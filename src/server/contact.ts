import "server-only";
import { getServerEnv } from "@/lib/env";
import { ContactService, createContactService } from "@/server/services/ContactService";

/** One per server process, so the rate-limit counters outlive a request. */
let service: ContactService | undefined;

export function getContactService(): ContactService {
  service ??= createContactService(getServerEnv());
  return service;
}
