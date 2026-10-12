import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";

export interface WebhookEventInput {
  provider: string;
  eventId: string;
  type: string;
}

export interface IWebhookEventRepository {
  /** Records the event. True the first time; false when the same id was already recorded. */
  recordOnce(input: WebhookEventInput): Promise<boolean>;
  /** Drops the record so a failed event can be delivered again. */
  forget(provider: string, eventId: string): Promise<void>;
}

/** Service role only: the table is closed to every signed-in role. */
export class WebhookEventRepository extends BaseRepository implements IWebhookEventRepository {
  async recordOnce(input: WebhookEventInput): Promise<boolean> {
    const { error } = await this.supabase
      .from("webhook_events")
      .insert({ provider: input.provider, event_id: input.eventId, type: input.type });
    if (!error) return true;
    const appError = this.toAppError(error);
    if (appError.code === "CONFLICT") return false;
    throw appError;
  }

  async forget(provider: string, eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from("webhook_events")
      .delete()
      .eq("provider", provider)
      .eq("event_id", eventId);
    if (error) throw AppError.internal(error);
  }
}
