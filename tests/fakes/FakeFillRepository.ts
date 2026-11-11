import { AppError } from "@/server/errors/AppError";
import type { IFillRepository } from "@/server/repositories/FillRepository";
import type { ShiftFill } from "@/types/domain";

/**
 * In-memory stand-in for FillRepository. Which shift is a fill and whether it is included is
 * the database's work (pgTAP 029); here a test queues the fills the next run "completes".
 */
export class FakeFillRepository implements IFillRepository {
  readonly rows = new Map<string, ShiftFill>();
  /** Returned (and stored) by the next recordCompleted call. */
  completing: ShiftFill[] = [];

  async recordCompleted(): Promise<ShiftFill[]> {
    const fresh = this.completing.filter((fill) => !this.rows.has(fill.id));
    for (const fill of fresh) this.rows.set(fill.id, fill);
    this.completing = [];
    return fresh;
  }

  async listUnbilled(carrierId?: string): Promise<ShiftFill[]> {
    return [...this.rows.values()]
      .filter((fill) => fill.charge === "billable" && fill.billedAt === null && fill.carrierId !== null)
      .filter((fill) => !carrierId || fill.carrierId === carrierId)
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id));
  }

  async markBilled(fillId: string, invoiceItemId: string, at: string): Promise<ShiftFill> {
    const fill = this.require(fillId);
    if (fill.stripeInvoiceItemId && fill.stripeInvoiceItemId !== invoiceItemId) throw AppError.forbidden();
    const billed = { ...fill, stripeInvoiceItemId: invoiceItemId, billedAt: at };
    this.rows.set(fillId, billed);
    return billed;
  }

  async markWaived(fillId: string, adminId: string, reason: string, at: string): Promise<ShiftFill> {
    const fill = this.require(fillId);
    const waived = { ...fill, charge: "waived" as const, amountCents: 0, waivedAt: at, waivedBy: adminId, waiveReason: reason };
    this.rows.set(fillId, waived);
    return waived;
  }

  async findById(fillId: string): Promise<ShiftFill | null> {
    return this.rows.get(fillId) ?? null;
  }

  async listForCarrier(carrierId: string, since: string | null): Promise<ShiftFill[]> {
    return [...this.rows.values()]
      .filter((fill) => fill.carrierId === carrierId && (!since || fill.completedAt >= since))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }

  async listSince(since: string): Promise<ShiftFill[]> {
    return [...this.rows.values()]
      .filter((fill) => fill.completedAt >= since)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }

  private require(fillId: string): ShiftFill {
    const fill = this.rows.get(fillId);
    if (!fill) throw AppError.notFound();
    return fill;
  }
}
