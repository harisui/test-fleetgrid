import type {
  ConsentLogEntry,
  IConsentLogRepository,
} from "@/server/repositories/ConsentLogRepository";

/** In-memory stand-in for the SMS consent log. Append-only, like the real one. */
export class FakeConsentLogRepository implements IConsentLogRepository {
  readonly entries: ConsentLogEntry[] = [];
  failNextRecordWith: Error | null = null;

  async record(entry: ConsentLogEntry): Promise<void> {
    if (this.failNextRecordWith) {
      const error = this.failNextRecordWith;
      this.failNextRecordWith = null;
      throw error;
    }
    this.entries.push(entry);
  }
}
