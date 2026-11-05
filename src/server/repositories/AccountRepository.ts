import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";

export interface IAccountRepository {
  /** Removes the auth user. The profile, card and document rows go with it (on delete cascade). */
  deleteUser(userId: string): Promise<void>;
}

/** Account removal through Supabase Auth's admin API. Needs the service role client. */
export class AccountRepository extends BaseRepository implements IAccountRepository {
  async deleteUser(userId: string): Promise<void> {
    // The logs stay and stop pointing at the driver: the one exception to append-only (0035).
    const anonymized = await this.supabase.rpc("anonymize_driver_logs", { p_profile_id: userId });
    if (anonymized.error) throw this.toAppError(anonymized.error);
    const { error } = await this.supabase.auth.admin.deleteUser(userId);
    if (error) throw AppError.internal(error);
  }
}
