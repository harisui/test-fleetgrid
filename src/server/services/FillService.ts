import { DEFAULT_TIMEZONE, FILL_FEE_CENTS, TRIAL_INCLUDED_FILLS } from "@/lib/constants";
import type { IPaymentProvider } from "@/server/providers/PaymentProvider";
import type { ICarrierRepository } from "@/server/repositories/CarrierRepository";
import type { IFillRepository } from "@/server/repositories/FillRepository";
import type { ISubscriptionRepository } from "@/server/repositories/SubscriptionRepository";
import type { ShiftFill } from "@/types/domain";

/** What a run did, for the cron's log line. */
export interface FillRunOutcome {
  /** Completed fills recorded this run. */
  recorded: number;
  /** Of those, included in a trial at no charge. */
  included: number;
  /** Billable fills given a Stripe invoice item. */
  billed: number;
  /** One-off invoices made for carriers whose subscription has ended. */
  invoicedNow: number;
  /** Carriers that could not be billed (logged, retried on the next run). */
  failed: number;
}

/** The repositories the job writes with: service role, built on demand. */
export interface FillRepositories {
  fills: () => IFillRepository;
  carriers: () => ICarrierRepository;
  subscriptions: () => ISubscriptionRepository;
}

const dateOf = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

/** The line on the carrier's invoice. Carrier-facing wording: goes to the client before a deploy. */
export const fillChargeDescription = (fill: ShiftFill): string => `Completed fill, shift on ${dateOf(fill.shiftStartsAt)}`;

/**
 * Completed fills (pricing of 2026-11-11): a booked shift is a completed fill 2 hours after its
 * end unless a no-show, release or cancel came first. The database decides which and whether
 * it is included in the trial (record_completed_fills); this service bills each billable one
 * as a Stripe invoice item on the carrier's customer, which their next invoice picks up. When
 * the carrier's subscription has ended, the pending items are invoiced at once, so no fill goes
 * unbilled.
 */
export class FillService {
  constructor(
    private readonly repos: FillRepositories,
    private readonly payments: IPaymentProvider,
    private readonly log: (message: string, detail?: unknown) => void = () => undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The daily job: record what completed, then bill what is billable. Safe to run again. */
  async runDaily(): Promise<FillRunOutcome> {
    const recorded = await this.repos.fills().recordCompleted(FILL_FEE_CENTS, TRIAL_INCLUDED_FILLS);
    const billing = await this.billUnbilled();
    return {
      ...billing,
      recorded: recorded.length,
      included: recorded.filter((fill) => fill.charge === "included").length,
    };
  }

  /**
   * The subscription has ended (cancelled in the trial or after, or the account is being
   * deleted): bill the carrier's unbilled fills and invoice everything pending now.
   */
  async closeOut(carrierId: string): Promise<void> {
    const carrier = await this.repos.carriers().findById(carrierId);
    if (!carrier?.stripeCustomerId) return;
    await this.billCarrier(carrierId, carrier.stripeCustomerId, await this.repos.fills().listUnbilled(carrierId));
    await this.payments.invoicePendingNow(carrier.stripeCustomerId);
  }

  private async billUnbilled(): Promise<Omit<FillRunOutcome, "recorded" | "included">> {
    const outcome = { billed: 0, invoicedNow: 0, failed: 0 };
    const byCarrier = new Map<string, ShiftFill[]>();
    for (const fill of await this.repos.fills().listUnbilled()) {
      if (!fill.carrierId) continue;
      byCarrier.set(fill.carrierId, [...(byCarrier.get(fill.carrierId) ?? []), fill]);
    }
    for (const [carrierId, fills] of byCarrier) {
      try {
        const carrier = await this.repos.carriers().findById(carrierId);
        if (!carrier?.stripeCustomerId) {
          outcome.failed += 1;
          this.log(`Completed fills for carrier ${carrierId}, who has no billing account`);
          continue;
        }
        outcome.billed += await this.billCarrier(carrierId, carrier.stripeCustomerId, fills);
        // No subscription left to pick the items up: invoice them now.
        if (!(await this.repos.subscriptions().findActiveByCarrierId(carrierId))) {
          if (await this.payments.invoicePendingNow(carrier.stripeCustomerId)) outcome.invoicedNow += 1;
        }
      } catch (error) {
        outcome.failed += 1;
        this.log(`Could not bill the completed fills of carrier ${carrierId}`, error);
      }
    }
    return outcome;
  }

  private async billCarrier(carrierId: string, customerId: string, fills: ShiftFill[]): Promise<number> {
    let billed = 0;
    for (const fill of fills) {
      const itemId = await this.payments.createFillCharge({
        customerId,
        amountCents: fill.amountCents,
        description: fillChargeDescription(fill),
        idempotencyKey: `fill-${fill.id}`,
        metadata: { fill_id: fill.id, shift_id: fill.shiftId ?? "", carrier_id: carrierId },
      });
      await this.repos.fills().markBilled(fill.id, itemId, this.now().toISOString());
      billed += 1;
    }
    return billed;
  }
}
