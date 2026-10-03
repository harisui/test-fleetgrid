import { deleteAccountSchema } from "@/lib/validation/account.schema";
import { parseInput } from "@/server/errors/AppError";
import type { IAccountRepository } from "@/server/repositories/AccountRepository";
import type { IAuthRepository } from "@/server/repositories/AuthRepository";
import type { IDocumentRepository } from "@/server/repositories/DocumentRepository";
import type { IDriverRepository } from "@/server/repositories/DriverRepository";
import type { SessionUser } from "@/types/domain";

/**
 * Self-service account removal: every person can delete their own account and data (a
 * compliance requirement). It takes a fresh code texted to the signed-in number, so a phone
 * left unlocked cannot wipe an account. Works for drivers and carriers alike; a carrier
 * simply has no card or files yet.
 */
export class AccountService {
  constructor(
    private readonly auth: IAuthRepository,
    private readonly drivers: IDriverRepository,
    private readonly documents: IDocumentRepository,
    /** Built on demand: the admin client is only ever created for this one operation. */
    private readonly accounts: () => IAccountRepository,
  ) {}

  /** Texts a code to the signed-in person's own number, never to one they typed. */
  async requestDeletionCode(user: SessionUser): Promise<{ phone: string }> {
    await this.auth.sendOtp(user.phone);
    return { phone: user.phone };
  }

  /**
   * Checks the code, then removes everything about the signed-in person: stored files first
   * (nothing cascades into storage), then the auth user, which takes the profile, card and
   * document rows with it. Ends the session, so the next visit starts at the login screen.
   */
  async deleteOwnAccount(user: SessionUser, input: unknown): Promise<void> {
    const { code } = parseInput(deleteAccountSchema, input);
    await this.auth.verifyOtp(user.phone, code);

    const driver = await this.drivers.findByProfileId(user.id);
    if (driver) {
      const documents = await this.documents.listByDriverId(driver.id);
      for (const document of documents) {
        await this.documents.removeFile(document.storagePath);
      }
    }
    await this.accounts().deleteUser(user.id);
    // The user is gone, so the sign-out may already have nothing to end.
    await this.auth.signOut().catch(() => undefined);
  }
}
