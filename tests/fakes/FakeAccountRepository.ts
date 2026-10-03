import type { IAccountRepository } from "@/server/repositories/AccountRepository";

/** In-memory stand-in for AccountRepository. Records which users were deleted. */
export class FakeAccountRepository implements IAccountRepository {
  readonly deleted: string[] = [];
  failNextDeleteWith: Error | null = null;

  async deleteUser(userId: string): Promise<void> {
    if (this.failNextDeleteWith) {
      const error = this.failNextDeleteWith;
      this.failNextDeleteWith = null;
      throw error;
    }
    this.deleted.push(userId);
  }
}
