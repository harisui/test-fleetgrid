import { AppError } from "@/server/errors/AppError";
import type { IAuthRepository } from "@/server/repositories/AuthRepository";
import type { SessionUser } from "@/types/domain";

/** In-memory stand-in for AuthRepository. No SMS is ever sent. */
export class FakeAuthRepository implements IAuthRepository {
  /** phone -> user id. Unknown phones get a new user on first verify, like Supabase. */
  readonly users = new Map<string, string>();
  readonly sentTo: string[] = [];
  currentUser: SessionUser | null = null;
  validCode = "123456";
  failNextSendWith: Error | null = null;
  signOutCount = 0;
  private sequence = 0;

  async sendOtp(phone: string): Promise<void> {
    if (this.failNextSendWith) {
      const error = this.failNextSendWith;
      this.failNextSendWith = null;
      throw error;
    }
    this.sentTo.push(phone);
  }

  async verifyOtp(phone: string, code: string): Promise<SessionUser> {
    if (!this.sentTo.includes(phone) || code !== this.validCode) {
      const message = "That code is incorrect or has expired";
      throw AppError.validation(message, { code: message });
    }
    let id = this.users.get(phone);
    if (!id) {
      this.sequence += 1;
      id = `a0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
      this.users.set(phone, id);
    }
    this.currentUser = { id, phone };
    return this.currentUser;
  }

  async getUser(): Promise<SessionUser | null> {
    return this.currentUser;
  }

  async signOut(): Promise<void> {
    this.signOutCount += 1;
    this.currentUser = null;
  }
}
