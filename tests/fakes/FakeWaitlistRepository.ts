import type { IWaitlistRepository, WaitlistInput } from "@/server/repositories/WaitlistRepository";
import type { WaitlistEntry } from "@/types/domain";

/** In-memory stand-in for WaitlistRepository: one entry per carrier. */
export class FakeWaitlistRepository implements IWaitlistRepository {
  readonly rows = new Map<string, WaitlistEntry>();
  private sequence = 0;

  async findByCarrierId(carrierId: string): Promise<WaitlistEntry | null> {
    return this.rows.get(carrierId) ?? null;
  }

  async create(input: WaitlistInput): Promise<WaitlistEntry> {
    const existing = this.rows.get(input.carrierId);
    if (existing) return existing;
    this.sequence += 1;
    const entry: WaitlistEntry = {
      id: `w0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      ...input,
      createdAt: new Date(Date.UTC(2026, 9, 13, 12, 0, this.sequence)).toISOString(),
    };
    this.rows.set(input.carrierId, entry);
    return entry;
  }
}
