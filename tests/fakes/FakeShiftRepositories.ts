import { isBookable } from "@/lib/shifts/schedule";
import { AppError } from "@/server/errors/AppError";
import type { ISmsProvider, OutboundSms, SentSms } from "@/server/providers/SmsProvider";
import { SmsSendError } from "@/server/providers/SmsProvider";
import type {
  IBroadcastRepository,
  NewRecipient,
  OpenOffer,
  RecipientPatch,
} from "@/server/repositories/BroadcastRepository";
import type { ConsentLogEntry, IConsentLogRepository } from "@/server/repositories/ConsentLogRepository";
import type {
  CreateShiftInput,
  IShiftRepository,
  MatchedDriver,
  ShiftListFilter,
  ShiftPatch,
} from "@/server/repositories/ShiftRepository";
import type { SmsMessage } from "@/types/domain";
import type { ISmsLogRepository, SmsContext, SmsLogEntry } from "@/server/repositories/SmsLogRepository";
import type { ITextingDriverRepository, TextingDriver } from "@/server/repositories/TextingDriverRepository";
import type { BookedDriverContact, BroadcastRecipient, ClaimOutcome, Shift } from "@/types/domain";

const T = "2026-11-01T12:00:00.000Z";

export function buildShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    carrierId: "c0000000-0000-4000-a000-000000000001",
    status: "open",
    shortCode: "4821",
    startsAt: "2026-11-03T12:00:00.000Z",
    endsAt: "2026-11-03T20:00:00.000Z",
    zip: "77506",
    city: "Pasadena",
    state: "TX",
    lat: 29.7009,
    lng: -95.1989,
    cdlClass: "A",
    endorsements: [],
    minYears: 0,
    equipmentTypes: [],
    twicRequired: false,
    medicalRequired: false,
    manualRequired: false,
    payText: null,
    workDescription: "Port moves to the yard.",
    onsiteContactName: "Lee Yard",
    onsiteContactPhone: "+17135550100",
    sendAfter: null,
    broadcastRound: 0,
    broadcastAt: null,
    releasedAt: null,
    bookedDriverId: null,
    bookedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  };
}

export function buildTextingDriver(n: number, overrides: Partial<TextingDriver> = {}): TextingDriver {
  const suffix = String(n).padStart(4, "0");
  return {
    driverId: `d0000000-0000-4000-8000-00000000${suffix}`,
    profileId: `a0000000-0000-4000-8000-00000000${suffix}`,
    fullName: `Driver ${n}`,
    phone: `+1555555${String(3000 + n)}`,
    status: "approved",
    smsOptIn: true,
    smsOptedOut: false,
    shiftsPaused: false,
    ...overrides,
  };
}

/**
 * Shifts, recipients, drivers and the text log in memory, sharing one world so claim and
 * release behave like the database functions.
 */
export class FakeShiftWorld {
  shifts = new Map<string, Shift>();
  recipients: BroadcastRecipient[] = [];
  drivers = new Map<string, TextingDriver & { noShowCount: number }>();
  /** Drivers matchingDrivers returns, before exclusions. */
  matching: string[] = [];
  now = () => new Date(T);
  private seq = 0;

  addDriver(driver: TextingDriver): void {
    this.drivers.set(driver.driverId, { ...driver, noShowCount: 0 });
  }

  readonly shiftRepository: IShiftRepository = {
    create: async (carrierId: string, input: CreateShiftInput) => {
      const shift = buildShift({ ...input, carrierId, id: `50000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}` });
      this.shifts.set(shift.id, shift);
      return shift;
    },
    findById: async (id) => this.shifts.get(id) ?? null,
    list: async (filter: ShiftListFilter = {}) =>
      [...this.shifts.values()].filter(
        (shift) => (!filter.carrierId || shift.carrierId === filter.carrierId) && (!filter.status || shift.status === filter.status),
      ),
    listBookedByDriver: async (driverId) => [...this.shifts.values()].filter((shift) => shift.bookedDriverId === driverId),
    update: async (id: string, patch: ShiftPatch) => {
      const shift = this.shifts.get(id);
      if (!shift) throw AppError.notFound();
      const next = { ...shift, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Shift;
      this.shifts.set(id, next);
      return next;
    },
    claim: async (driverId, code) => this.claim(driverId, code),
    release: async (id) => {
      const shift = this.shifts.get(id);
      if (!shift || shift.status !== "booked" || !shift.bookedDriverId) return null;
      const driverId = shift.bookedDriverId;
      const driver = this.drivers.get(driverId);
      if (driver) driver.noShowCount += 1;
      for (const r of this.recipients) if (r.shiftId === id && r.driverId === driverId && r.status === "booked") r.status = "no_show";
      this.shifts.set(id, { ...shift, status: "open", bookedDriverId: null, bookedAt: null, releasedAt: this.now().toISOString(), shortCode: "7310" });
      return driverId;
    },
    expire: async () => 0,
    bookedDriverContact: async (id): Promise<BookedDriverContact | null> => {
      const shift = this.shifts.get(id);
      const driver = shift?.bookedDriverId ? this.drivers.get(shift.bookedDriverId) : null;
      return shift?.status === "booked" && driver ? { driverId: driver.driverId, fullName: driver.fullName, phone: driver.phone } : null;
    },
    matchingDrivers: async (_place, _requirements, exclude = []): Promise<MatchedDriver[]> =>
      this.matching
        .filter((id) => !exclude.includes(id))
        .map((id) => ({ driverId: id, phone: this.drivers.get(id)?.phone ?? "+15555550000" })),
    listDueBroadcasts: async (now) =>
      [...this.shifts.values()].filter(
        (shift) => shift.status === "open" && shift.broadcastRound === 0 && shift.sendAfter !== null && shift.sendAfter <= now,
      ),
  };

  readonly broadcastRepository: IBroadcastRepository = {
    insertMany: async (rows: NewRecipient[]) => {
      if (rows.some((row) => this.recipients.some((r) => r.shiftId === row.shiftId && r.round === row.round && r.driverId === row.driverId))) {
        throw AppError.conflict();
      }
      const created = rows.map((row) => ({
        ...row,
        id: `r-${++this.seq}`,
        status: "queued" as const,
        messageSid: null,
        errorCode: null,
        sentAt: null,
        deliveredAt: null,
        repliedAt: null,
        createdAt: this.now().toISOString(),
      }));
      this.recipients.push(...created);
      return created;
    },
    update: async (id: string, patch: RecipientPatch) => {
      const row = this.recipients.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
    updateByMessageSid: async (sid, patch) => {
      for (const row of this.recipients) {
        if (row.messageSid === sid && ["queued", "sent", "delivered", "failed"].includes(row.status)) Object.assign(row, patch);
      }
    },
    listByShift: async (shiftId) => this.recipients.filter((r) => r.shiftId === shiftId),
    noShowDriverIds: async (shiftId) => this.recipients.filter((r) => r.shiftId === shiftId && r.status === "no_show").map((r) => r.driverId),
    openOffersForDriver: async (driverId): Promise<OpenOffer[]> => {
      const offers = this.recipients.filter((r) => {
        const shift = this.shifts.get(r.shiftId);
        return r.driverId === driverId && ["queued", "sent", "delivered"].includes(r.status) && shift?.status === "open" && shift.shortCode === r.code && isBookable(shift, this.now());
      });
      return [...new Map(offers.map((r) => [r.shiftId, { shiftId: r.shiftId, code: r.code }])).values()];
    },
  };

  readonly textingDrivers: ITextingDriverRepository = {
    findByPhone: async (phone) => [...this.drivers.values()].find((d) => d.phone === phone) ?? null,
    findById: async (id) => this.drivers.get(id) ?? null,
    findByProfileId: async (id) => [...this.drivers.values()].find((d) => d.profileId === id) ?? null,
    setOptedOut: async (id, optedOut) => {
      const driver = this.drivers.get(id);
      if (driver) driver.smsOptedOut = optedOut;
    },
    setShiftsPaused: async (id, paused) => {
      const driver = this.drivers.get(id);
      if (driver) driver.shiftsPaused = paused;
    },
  };

  /** claim_shift() in memory: the same outcomes, one winner. */
  private claim(driverId: string, code: string): { outcome: ClaimOutcome; shiftId: string | null } {
    const offer = [...this.recipients]
      .reverse()
      .find((r) => r.driverId === driverId && r.code === code);
    if (!offer) return { outcome: "not_found", shiftId: null };
    const driver = this.drivers.get(driverId);
    if (!driver || driver.status !== "approved" || driver.shiftsPaused || driver.smsOptedOut) {
      return { outcome: "not_eligible", shiftId: offer.shiftId };
    }
    const shift = this.shifts.get(offer.shiftId)!;
    if (shift.status === "open" && shift.shortCode === code && isBookable(shift, this.now())) {
      this.shifts.set(shift.id, { ...shift, status: "booked", bookedDriverId: driverId, bookedAt: this.now().toISOString() });
      offer.status = "booked";
      return { outcome: "won", shiftId: shift.id };
    }
    if (shift.status === "booked" && shift.bookedDriverId === driverId) return { outcome: "already_yours", shiftId: shift.id };
    if (offer.status !== "booked" && offer.status !== "no_show") offer.status = "too_late";
    if (shift.status === "booked" || (shift.status === "open" && shift.shortCode !== code)) return { outcome: "filled", shiftId: shift.id };
    return { outcome: "closed", shiftId: shift.id };
  }
}

export class FakeSmsLog implements ISmsLogRepository {
  entries: (SmsLogEntry & { id: string; inboundOutcome?: string })[] = [];
  private seq = 0;
  async record(entry: SmsLogEntry): Promise<string | null> {
    if (entry.providerSid && this.entries.some((e) => e.providerSid === entry.providerSid)) return null;
    if (entry.resendOf && this.entries.some((e) => e.resendOf === entry.resendOf)) return null;
    const id = `m${++this.seq}`;
    this.entries.push({ ...entry, id });
    return id;
  }
  async listHeld() {
    return this.entries
      .filter((e) => e.direction === "outbound" && e.status === "held" && e.kind !== "offer")
      .map((e) => ({ id: e.id, kind: e.kind, toPhone: e.toPhone, body: e.body, driverId: e.driverId ?? null }) as SmsMessage);
  }
  async claimHeld(id: string, sender: string) {
    const entry = this.entries.find((e) => e.id === id && e.status === "held");
    if (!entry) return false;
    entry.status = "sending";
    entry.fromPhone = sender;
    return true;
  }
  async updateById(id: string, update: { providerSid: string | null; status: string; errorCode: string | null }): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) Object.assign(entry, update);
  }
  async updateStatus(sid: string, status: string, errorCode: string | null): Promise<void> {
    for (const entry of this.entries) if (entry.providerSid === sid) Object.assign(entry, { status, errorCode });
  }
  async setContext(sid: string, context: SmsContext): Promise<void> {
    for (const entry of this.entries) if (entry.providerSid === sid) Object.assign(entry, context);
  }
  async listByShift(): Promise<never[]> {
    return [];
  }
  async listRecent(): Promise<never[]> {
    return [];
  }
  outbound(): SmsLogEntry[] {
    return this.entries.filter((e) => e.direction === "outbound");
  }
}

export class FakeConsentLog implements IConsentLogRepository {
  entries: ConsentLogEntry[] = [];
  async record(entry: ConsentLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Records sends; numbers in `failing` are refused. */
export class RecordingSmsProvider implements ISmsProvider {
  readonly kind = "fake" as const;
  readonly sender = "fake";
  sent: OutboundSms[] = [];
  failing = new Set<string>();
  private seq = 0;
  async send(message: OutboundSms): Promise<SentSms> {
    if (this.failing.has(message.to)) throw new SmsSendError("refused", "30003");
    this.sent.push(message);
    return { sid: `SMrec${process.pid}x${Date.now()}x${++this.seq}`, status: "queued" };
  }
}
