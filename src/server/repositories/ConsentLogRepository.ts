import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { SmsConsentEvent, SmsConsentSource } from "@/types/domain";

export interface ConsentLogEntry {
  /** E.164 number the consent concerns. */
  phone: string;
  event: SmsConsentEvent;
  /** The exact wording the person saw or sent. */
  consentText: string;
  /** Version label of that wording, like "2026-10-v1". */
  consentVersion: string;
  source: SmsConsentSource;
}

export interface IConsentLogRepository {
  /** Appends one consent event. Nothing is ever updated or removed. */
  record(entry: ConsentLogEntry): Promise<void>;
}

/** The SMS consent audit log. Needs the service role client: nobody signed in may write. */
export class ConsentLogRepository extends BaseRepository implements IConsentLogRepository {
  async record(entry: ConsentLogEntry): Promise<void> {
    const { error } = await this.supabase.from("sms_consent_log").insert({
      phone: entry.phone,
      event: entry.event,
      consent_text: entry.consentText,
      consent_version: entry.consentVersion,
      source: entry.source,
    });
    if (error) throw AppError.internal(error);
  }
}
