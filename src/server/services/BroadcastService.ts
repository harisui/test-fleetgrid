import { isBookable } from "@/lib/shifts/schedule";
import { shuffleAndCap } from "@/lib/shifts/shuffle";
import { offerText } from "@/lib/shifts/texts";
import { AppError } from "@/server/errors/AppError";
import type { IBroadcastRepository } from "@/server/repositories/BroadcastRepository";
import type { IShiftRepository, MatchedDriver } from "@/server/repositories/ShiftRepository";
import type { TextService } from "@/server/services/TextService";

/** Texts go out ten at a time (T3.5). */
export const SEND_CONCURRENCY = 10;

export interface BroadcastResult {
  round: number;
  matched: number;
  offered: number;
  sent: number;
  failed: number;
}

const NOTHING: BroadcastResult = { round: 0, matched: 0, offered: 0, sent: 0, failed: 0 };

/**
 * One broadcast round for an open shift (T3.4, T3.5): the matching drivers, minus anyone who
 * was a no-show on it, in a fresh random order, the first 200, each sent the shift alert with
 * the shift's current code. A failed send is recorded and never stops the rest. Runs with
 * the service role.
 */
export class BroadcastService {
  constructor(
    private readonly shifts: IShiftRepository,
    private readonly recipients: IBroadcastRepository,
    private readonly texts: TextService,
    private readonly random: () => number = Math.random,
  ) {}

  /** How many drivers a shift with these requirements would reach now. */
  async countMatches(...args: Parameters<IShiftRepository["matchingDrivers"]>): Promise<number> {
    return (await this.shifts.matchingDrivers(...args)).length;
  }

  async broadcast(shiftId: string, now: Date = new Date()): Promise<BroadcastResult> {
    const shift = await this.shifts.findById(shiftId);
    if (!shift || shift.status !== "open" || !isBookable(shift, now)) return NOTHING;

    const exclude = await this.recipients.noShowDriverIds(shift.id);
    const matches = await this.shifts.matchingDrivers(shift, shift, exclude);
    const chosen = shuffleAndCap(matches, this.random);
    const round = shift.broadcastRound + 1;

    await this.shifts.update(shift.id, {
      broadcastRound: round,
      broadcastAt: now.toISOString(),
      sendAfter: null,
    });

    let rows;
    try {
      rows = await this.recipients.insertMany(
        chosen.map((match, index) => ({
          shiftId: shift.id,
          driverId: match.driverId,
          round,
          position: index + 1,
          code: shift.shortCode,
        })),
      );
    } catch (error) {
      // Another call started the same round first; it sends the texts.
      if (error instanceof AppError && error.code === "CONFLICT") return NOTHING;
      throw error;
    }

    const phones = new Map<string, MatchedDriver>(chosen.map((match) => [match.driverId, match]));
    const body = offerText(shift, shift.shortCode);
    let sent = 0;
    let failed = 0;

    await inBatches(rows, SEND_CONCURRENCY, async (row) => {
      const match = phones.get(row.driverId);
      if (!match) return;
      const outcome = await this.texts.send(
        { driverId: row.driverId, phone: match.phone, smsOptedOut: false },
        "offer",
        body,
        shift.id,
      );
      if (outcome.sent) sent += 1;
      else failed += 1;
      await this.recipients.update(row.id, {
        status: outcome.sent ? (outcome.status === "delivered" ? "delivered" : "sent") : "failed",
        messageSid: outcome.sid,
        errorCode: outcome.errorCode,
        sentAt: outcome.sent ? new Date().toISOString() : null,
        deliveredAt: outcome.status === "delivered" ? new Date().toISOString() : null,
      });
    });

    return { round, matched: matches.length, offered: rows.length, sent, failed };
  }

  /** The broadcasts held for quiet hours whose time has come. */
  async dispatchDue(now: Date = new Date()): Promise<number> {
    const due = await this.shifts.listDueBroadcasts(now.toISOString());
    for (const shift of due) await this.broadcast(shift.id, now);
    return due.length;
  }
}

/** Runs the task over the items, at most `limit` at a time; a failure never stops the rest. */
export async function inBatches<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += limit) {
    await Promise.allSettled(items.slice(start, start + limit).map(task));
  }
}
