import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";

export interface IAccountRepository {
  /** Removes the auth user. The profile, card and document rows go with it (on delete cascade). */
  deleteUser(userId: string): Promise<void>;
}

/** Account removal through Supabase Auth's admin API. Needs the service role client. */
export class AccountRepository extends BaseRepository implements IAccountRepository {
  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.deleteUser(userId);
    if (error) throw AppError.internal(error);
  }
}
