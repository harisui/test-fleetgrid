import type { ITosRepository, TosAcceptanceInput } from "@/server/repositories/TosRepository";
import type { TosAcceptance } from "@/types/domain";

/** In-memory stand-in for TosRepository: one acceptance per profile and version. */
export class FakeTosRepository implements ITosRepository {
  readonly rows: TosAcceptance[] = [];

  async findAcceptance(profileId: string, version: string): Promise<TosAcceptance | null> {
    return (
      this.rows.find((row) => row.profileId === profileId && row.version === version) ?? null
    );
  }

  async record(input: TosAcceptanceInput): Promise<TosAcceptance> {
    const existing = await this.findAcceptance(input.profileId, input.version);
    if (existing) return existing;
    const acceptance: TosAcceptance = {
      id: `t0000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, "0")}`,
      profileId: input.profileId,
      version: input.version,
      acceptedAt: new Date(Date.UTC(2026, 9, 13, 12, 0, this.rows.length + 1)).toISOString(),
      ip: input.ip,
      userAgent: input.userAgent,
    };
    this.rows.push(acceptance);
    return acceptance;
  }
}
