import { BaseRepository } from "@/server/repositories/BaseRepository";

/** A driver a one-time text is claimed for, with the number to send it to. */
export interface ClaimedText {
  driverId: string;
  phone: string;
}

/** A welcome text due now, with the name it greets. */
export interface ClaimedWelcome extends ClaimedText {
  fullName: string | null;
}

/** A Registered driver missing a required document, and why a reminder would leave them out. */
export interface DocReminderCandidate {
  driverId: string;
  phone: string;
  missing: string[];
  exclusion: "opted_out" | "no_consent" | "recent" | null;
  lastDocReminderAt: string | null;
}

export interface IDriverNotificationRepository {
  /** Stamps and returns the drivers due their one profile reminder (0025). */
  claimReminders(limit?: number): Promise<ClaimedText[]>;
  /** Queues the one approval text for this time; false when it was queued before or may not go. */
  queueApprovalText(driverId: string, dueAt: string | null): Promise<boolean>;
  /** Stamps and returns the approval texts due now, for one driver or everyone. */
  claimApprovalTexts(driverId?: string): Promise<ClaimedText[]>;
  /** Queues the welcome for this number's hash once ever; false when it was queued before (0030). */
  queueWelcomeText(phoneHash: string, driverId: string, dueAt: string | null): Promise<boolean>;
  /** Stamps and returns the welcomes due now, for one driver or everyone, with consent. */
  claimWelcomeTexts(driverId?: string): Promise<ClaimedWelcome[]>;
  /** Registered drivers missing a document, one or all. */
  docReminderCandidates(driverId?: string): Promise<DocReminderCandidate[]>;
  /** Stamps the documents reminder if one may go now; null when it may not. */
  claimDocReminder(driverId: string): Promise<{ phone: string; missing: string[] } | null>;
}

const EXCLUSIONS = new Set(["opted_out", "no_consent", "recent"]);

/** The once-only driver texts. Service role only: the functions are closed to everyone else. */
export class DriverNotificationRepository extends BaseRepository implements IDriverNotificationRepository {
  async claimReminders(limit = 200): Promise<ClaimedText[]> {
    const result = await this.supabase.rpc("claim_profile_reminders", { p_limit: limit });
    return this.unwrap(result).map((row) => ({ driverId: row.driver_id, phone: row.phone }));
  }

  async queueApprovalText(driverId: string, dueAt: string | null): Promise<boolean> {
    const result = await this.supabase.rpc("queue_approval_text", {
      p_driver_id: driverId,
      p_due_at: dueAt as string,
    });
    return this.unwrap(result) === true;
  }

  async claimApprovalTexts(driverId?: string): Promise<ClaimedText[]> {
    const result = await this.supabase.rpc("claim_approval_texts", driverId ? { p_driver_id: driverId } : {});
    return this.unwrap(result).map((row) => ({ driverId: row.driver_id, phone: row.phone }));
  }

  async queueWelcomeText(phoneHash: string, driverId: string, dueAt: string | null): Promise<boolean> {
    const result = await this.supabase.rpc("queue_welcome_text", {
      p_phone_hash: phoneHash,
      p_driver_id: driverId,
      p_due_at: dueAt as string,
    });
    return this.unwrap(result) === true;
  }

  async claimWelcomeTexts(driverId?: string): Promise<ClaimedWelcome[]> {
    const result = await this.supabase.rpc("claim_welcome_texts", driverId ? { p_driver_id: driverId } : {});
    return this.unwrap(result).map((row) => ({ driverId: row.driver_id, phone: row.phone, fullName: row.full_name }));
  }

  async docReminderCandidates(driverId?: string): Promise<DocReminderCandidate[]> {
    const result = await this.supabase.rpc("doc_reminder_candidates", driverId ? { p_driver_id: driverId } : {});
    return this.unwrap(result).map((row) => ({
      driverId: row.driver_id,
      phone: row.phone,
      missing: row.missing,
      exclusion: EXCLUSIONS.has(row.exclusion) ? (row.exclusion as DocReminderCandidate["exclusion"]) : null,
      lastDocReminderAt: row.last_doc_reminder_at,
    }));
  }

  async claimDocReminder(driverId: string): Promise<{ phone: string; missing: string[] } | null> {
    const rows = this.unwrap(await this.supabase.rpc("claim_doc_reminder", { p_driver_id: driverId }));
    return rows[0] ? { phone: rows[0].phone, missing: rows[0].missing } : null;
  }
}
