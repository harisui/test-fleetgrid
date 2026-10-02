import { createServerClient } from "@/lib/supabase/server";
import { AuthRepository } from "@/server/repositories/AuthRepository";
import type { TypedSupabaseClient } from "@/server/repositories/BaseRepository";
import { DocumentRepository } from "@/server/repositories/DocumentRepository";
import { DriverRepository } from "@/server/repositories/DriverRepository";
import { ProfileRepository } from "@/server/repositories/ProfileRepository";
import { AuthService } from "@/server/services/AuthService";
import { DocumentService } from "@/server/services/DocumentService";
import { DriverService } from "@/server/services/DriverService";
import { ProfileService } from "@/server/services/ProfileService";

/** Wires repositories into services for one Supabase client. */
export function buildContainer(supabase: TypedSupabaseClient) {
  const auth = new AuthRepository(supabase);
  const profiles = new ProfileRepository(supabase);
  const drivers = new DriverRepository(supabase);
  const documents = new DocumentRepository(supabase);

  return {
    authService: new AuthService(auth, profiles),
    profileService: new ProfileService(profiles),
    driverService: new DriverService(drivers, profiles),
    documentService: new DocumentService(documents, drivers, profiles),
  };
}

export type Container = ReturnType<typeof buildContainer>;

/** Builds services for the current request, acting as the signed-in user (RLS applies). */
export async function getContainer(): Promise<Container> {
  return buildContainer(await createServerClient());
}
