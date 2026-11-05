import { RESUME_AFTER_MS, SHIFT_ALERT_CAP } from "@/lib/constants";
import { isBookable, sendAfterFor } from "@/lib/shifts/schedule";
import { shuffleAndCap } from "@/lib/shifts/shuffle";
import { offerText } from "@/lib/shifts/texts";
import { AppError } from "@/server/errors/AppError";
import type { IBroadcastRepository } from "@/server/repositories/BroadcastRepository";
import type { IShiftRepository, MatchedDriver } from "@/server/repositories/ShiftRepository";
import type { TextService } from "@/server/services/TextService";
import type { Shift } from "@/types/domain";

/** Texts go out ten at a time (T3.5). */
export const SEND_CONCURRENCY = 10;

export interface BroadcastResult {
  round: number;
  matched: number;
  offered: number;
  sent: number;
  failed: number;
  /** Matched, but already at the alert limit: on record, not texted. */
  skippedCap: number;
}

const NOTHING: BroadcastResult = { round: 0, matched: 0, offered: 0, sent: 0, failed: 0, skippedCap: 0 };

/**
 * One broadcast round for an open shift (T3.4, T3.5): the matching drivers, minus anyone who
 * was a no-show on it, an overlapping booking or at the alert limit, in a fresh random order,
 * the first 200, each sent the shift alert with the shift's current code. A failed send is recorded and never stops the rest. Runs with
 * the service role.
 */
export class BroadcastService {
  constructor(
    private readonly shifts: IShiftRepository,
    private readonly recipients: IBroadcastRepository,
    private readonly texts: TextService,
    private readonly random: () => number = Math.random,
    /** CARRIER_DISABLED: no shift alert goes by any path; held shifts wait, untouched. */
    private readonly carrierDisabled: () => boolean = () => false,
  ) {}

  /** How many drivers a shift with these requirements would reach now. */
  async countMatches(...args: Parameters<IShiftRepository["matchingDrivers"]>): Promise<number> {
    return (await this.shifts.matchingDrivers(...args)).length;
  }

  async broadcast(shiftId: string, now: Date = new Date()): Promise<BroadcastResult> {
    if (this.carrierDisabled()) return NOTHING;
    const shift = await this.shifts.findById(shiftId);
    if (!shift || shift.status !== "open" || !isBookable(shift, now)) return NOTHING;

    const exclude = await this.recipients.noShowDriverIds(shift.id);
    const matches = await this.shifts.matchingDrivers(shift, shift, exclude, { startsAt: shift.startsAt, endsAt: shift.endsAt });
    const atCap = new Set(await this.recipients.driversAtAlertCap(matches.map((match) => match.driverId), SHIFT_ALERT_CAP));
    const chosen = shuffleAndCap(matches.filter((match) => !atCap.has(match.driverId)), this.random);
    const capped = matches.filter((match) => atCap.has(match.driverId));
    const round = shift.broadcastRound + 1;

    await this.shifts.update(shift.id, {
      broadcastRound: round,
      broadcastAt: now.toISOString(),
      sendAfter: null,
    });

    let rows;
    try {
      rows = await this.recipients.insertMany([
        ...chosen.map((match, index) => ({
          shiftId: shift.id,
          driverId: match.driverId,
          round,
          position: index + 1,
          code: shift.shortCode,
        })),
        // On record, not texted: the admin can see why a driver got nothing.
        ...capped.map((match, index) => ({
          shiftId: shift.id,
          driverId: match.driverId,
          round,
          position: chosen.length + index + 1,
          code: shift.shortCode,
          status: "skipped_cap" as const,
        })),
      ]);
    } catch (error) {
      // Another call started the same round first; it sends the texts.
      if (error instanceof AppError && error.code === "CONFLICT") return NOTHING;
      throw error;
    }

    const phones = new Map<string, MatchedDriver>(chosen.map((match) => [match.driverId, match]));
    const queued = rows.filter((row) => row.status === "queued");
    let sent = 0;
    let failed = 0;

    await inBatches(queued, SEND_CONCURRENCY, async (row) => {
      const match = phones.get(row.driverId);
      if (!match) return;
      const outcome = await this.sendOffer(shift, row.id, row.driverId, match.phone);
      if (outcome === "sent") sent += 1;
      if (outcome === "failed") failed += 1;
    });

    return { round, matched: matches.length, offered: queued.length, sent, failed, skippedCap: capped.length };
  }

  /** Sends one alert if this call holds it, and writes the answer on the recipient. */
  private async sendOffer(shift: Shift, recipientId: string, driverId: string, phone: string): Promise<"sent" | "failed" | "taken"> {
    if (!(await this.recipients.claimSend(recipientId))) return "taken";
    const outcome = await this.texts.send({ driverId, phone, smsOptedOut: false }, "offer", offerText(shift, shift.shortCode), shift.id);
    await this.recipients.update(recipientId, {
      status: outcome.sent ? (outcome.status === "delivered" ? "delivered" : "sent") : "failed",
      messageSid: outcome.sid,
      errorCode: outcome.errorCode,
      sentAt: outcome.sent ? new Date().toISOString() : null,
      deliveredAt: outcome.status === "delivered" ? new Date().toISOString() : null,
    });
    return outcome.sent ? "sent" : "failed";
  }

  /**
   * Picks up alerts a broadcast left queued (the server stopped mid-send), under the same rules
   * as the first send: the switch, quiet hours and the cap. Returns how many went.
   */
  async resumeQueued(now: Date = new Date()): Promise<number> {
    if (this.carrierDisabled()) return 0;
    const stale = await this.recipients.staleQueued(new Date(now.getTime() - RESUME_AFTER_MS).toISOString());
    const shifts = new Map<string, Shift | null>();
    for (const row of stale) {
      if (!shifts.has(row.shiftId)) shifts.set(row.shiftId, await this.shifts.findById(row.shiftId));
    }
    const atCap = new Set(await this.recipients.driversAtAlertCap(stale.map((row) => row.driverId), SHIFT_ALERT_CAP));
    let sent = 0;
    await inBatches(stale, SEND_CONCURRENCY, async (row) => {
      const shift = shifts.get(row.shiftId);
      if (!shift || sendAfterFor(now, new Date(shift.startsAt))) return;
      if (atCap.has(row.driverId)) {
        await this.recipients.update(row.recipientId, { status: "skipped_cap" });
        return;
      }
      if ((await this.sendOffer(shift, row.recipientId, row.driverId, row.phone)) === "sent") sent += 1;
    });
    return sent;
  }

  /** The broadcasts held for quiet hours whose time has come. */
  async dispatchDue(now: Date = new Date()): Promise<number> {
    if (this.carrierDisabled()) return 0;
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
