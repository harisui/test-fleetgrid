import { BaseRepository } from "@/server/repositories/BaseRepository";

/** A driver a one-time text is claimed for, with the number to send it to. */
export interface ClaimedText {
  driverId: string;
  phone: string;
}

export interface IDriverNotificationRepository {
  /** Stamps and returns the drivers due their one profile reminder (0025). */
  claimReminders(limit?: number): Promise<ClaimedText[]>;
  /** Queues the one approval text for this time; false when it was queued before or may not go. */
  queueApprovalText(driverId: string, dueAt: string | null): Promise<boolean>;
  /** Stamps and returns the approval texts due now, for one driver or everyone. */
  claimApprovalTexts(driverId?: string): Promise<ClaimedText[]>;
}

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
}
