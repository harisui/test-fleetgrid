import type { IAccountRepository } from "@/server/repositories/AccountRepository";

/** In-memory stand-in for AccountRepository. Records which users were deleted. */
export class FakeAccountRepository implements IAccountRepository {
  readonly deleted: string[] = [];
  /** Replaced papers' files by driver id (0040). */
  readonly replacedPaths = new Map<string, string[]>();
  failNextDeleteWith: Error | null = null;

  async deleteUser(userId: string): Promise<void> {
    if (this.failNextDeleteWith) {
      const error = this.failNextDeleteWith;
      this.failNextDeleteWith = null;
      throw error;
    }
    this.deleted.push(userId);
  }

  async listReplacedDocumentPaths(driverId: string): Promise<string[]> {
    return this.replacedPaths.get(driverId) ?? [];
  }
}
