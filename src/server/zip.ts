import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileZipProvider } from "@/server/providers/ZipProvider";
import { ServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import { ZipLookupService } from "@/server/services/ZipLookupService";

/** Loaded once per server process; the dataset does not change between requests. */
let service: ZipLookupService | undefined;

/**
 * The ZIP check on the public carriers page. A visitor is signed out, and the area function
 * is granted to signed-in users only, so this one read-only question is asked with the
 * service role. It returns a city, a state and yes or no; nothing about anyone.
 */
export function getPublicZipLookupService(): ZipLookupService {
  service ??= new ZipLookupService(
    new FileZipProvider(),
    new ServiceAreaRepository(createAdminClient()),
  );
  return service;
}
