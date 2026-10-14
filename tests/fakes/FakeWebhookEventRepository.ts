import type {
  IWebhookEventRepository,
  WebhookEventInput,
} from "@/server/repositories/WebhookEventRepository";

/** In-memory stand-in for WebhookEventRepository: a set of handled event ids. */
export class FakeWebhookEventRepository implements IWebhookEventRepository {
  readonly recorded = new Map<string, WebhookEventInput>();
  failNextRecordWith: Error | null = null;

  private key(provider: string, eventId: string): string {
    return `${provider}:${eventId}`;
  }

  async recordOnce(input: WebhookEventInput): Promise<boolean> {
    if (this.failNextRecordWith) {
      const error = this.failNextRecordWith;
      this.failNextRecordWith = null;
      throw error;
    }
    const key = this.key(input.provider, input.eventId);
    if (this.recorded.has(key)) return false;
    this.recorded.set(key, input);
    return true;
  }

  async forget(provider: string, eventId: string): Promise<void> {
    this.recorded.delete(this.key(provider, eventId));
  }
}
