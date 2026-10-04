import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { FileZipProvider } from "@/server/providers/ZipProvider";
import { AccountRepository } from "@/server/repositories/AccountRepository";
import { AuthRepository } from "@/server/repositories/AuthRepository";
import type { TypedSupabaseClient } from "@/server/repositories/BaseRepository";
import { DocumentRepository } from "@/server/repositories/DocumentRepository";
import { DriverRepository } from "@/server/repositories/DriverRepository";
import { ProfileRepository } from "@/server/repositories/ProfileRepository";
import { AccountService } from "@/server/services/AccountService";
import { AuthService } from "@/server/services/AuthService";
import { DocumentService } from "@/server/services/DocumentService";
import { DriverService } from "@/server/services/DriverService";
import { ProfileService } from "@/server/services/ProfileService";
import { ZipLookupService } from "@/server/services/ZipLookupService";

/** Loaded once per server process; the dataset does not change between requests. */
const zipProvider = new FileZipProvider();

/** Wires repositories into services for one Supabase client. */
export function buildContainer(supabase: TypedSupabaseClient) {
  const auth = new AuthRepository(supabase);
  const profiles = new ProfileRepository(supabase);
  const drivers = new DriverRepository(supabase);
  const documents = new DocumentRepository(supabase);

  return {
    authService: new AuthService(auth, profiles),
    accountService: new AccountService(
      auth,
      drivers,
      documents,
      () => new AccountRepository(createAdminClient()),
    ),
    profileService: new ProfileService(profiles),
    driverService: new DriverService(drivers, profiles, zipProvider),
    documentService: new DocumentService(documents, drivers, profiles),
    zipLookupService: new ZipLookupService(zipProvider),
  };
}

export type Container = ReturnType<typeof buildContainer>;

/** Builds services for the current request, acting as the signed-in user (RLS applies). */
export async function getContainer(): Promise<Container> {
  return buildContainer(await createServerClient());
}
