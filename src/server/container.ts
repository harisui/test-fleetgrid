import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/server/providers/createPaymentProvider";
import { FileZipProvider } from "@/server/providers/ZipProvider";
import { AccountRepository } from "@/server/repositories/AccountRepository";
import { AdminRepository } from "@/server/repositories/AdminRepository";
import { AuthRepository } from "@/server/repositories/AuthRepository";
import type { TypedSupabaseClient } from "@/server/repositories/BaseRepository";
import { CarrierRepository } from "@/server/repositories/CarrierRepository";
import { ConsentLogRepository } from "@/server/repositories/ConsentLogRepository";
import { DocumentRepository } from "@/server/repositories/DocumentRepository";
import { DriverRepository } from "@/server/repositories/DriverRepository";
import { DriverSearchRepository } from "@/server/repositories/DriverSearchRepository";
import { ProfileRepository } from "@/server/repositories/ProfileRepository";
import { ServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import { SubscriptionRepository } from "@/server/repositories/SubscriptionRepository";
import { TosRepository } from "@/server/repositories/TosRepository";
import { WaitlistRepository } from "@/server/repositories/WaitlistRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import { AccountService } from "@/server/services/AccountService";
import { AdminService } from "@/server/services/AdminService";
import { AuthService } from "@/server/services/AuthService";
import { CarrierService } from "@/server/services/CarrierService";
import { DocumentService } from "@/server/services/DocumentService";
import { DriverSearchService } from "@/server/services/DriverSearchService";
import { DriverService } from "@/server/services/DriverService";
import { ProfileService } from "@/server/services/ProfileService";
import { SubscriptionService } from "@/server/services/SubscriptionService";
import { ZipLookupService } from "@/server/services/ZipLookupService";

/** Loaded once per server process; the dataset does not change between requests. */
const zipProvider = new FileZipProvider();

/** Wires repositories into services for one Supabase client. */
export function buildContainer(supabase: TypedSupabaseClient) {
  const env = getServerEnv();
  const auth = new AuthRepository(supabase);
  const profiles = new ProfileRepository(supabase);
  const drivers = new DriverRepository(supabase);
  const documents = new DocumentRepository(supabase);
  const serviceAreas = new ServiceAreaRepository(supabase);
  const carriers = new CarrierRepository(supabase);
  const subscriptions = new SubscriptionRepository(supabase);
  const tos = new TosRepository(supabase);
  const waitlist = new WaitlistRepository(supabase);
  const driverSearch = new DriverSearchRepository(supabase);

  const carrierService = new CarrierService(
    carriers,
    profiles,
    zipProvider,
    serviceAreas,
    tos,
    waitlist,
    subscriptions,
  );
  // The webhook and the Stripe customer id write with the service role, built on demand.
  const subscriptionService = new SubscriptionService(
    carrierService,
    subscriptions,
    {
      carriers: () => new CarrierRepository(createAdminClient()),
      subscriptions: () => new SubscriptionRepository(createAdminClient()),
      webhookEvents: () => new WebhookEventRepository(createAdminClient()),
    },
    getPaymentProvider(env),
    env.NEXT_PUBLIC_APP_URL,
    (message, detail) => console.error(`[FleetGrid] ${message}`, detail),
  );

  return {
    authService: new AuthService(auth, profiles),
    accountService: new AccountService(
      auth,
      drivers,
      documents,
      () => new AccountRepository(createAdminClient()),
      (userId) => subscriptionService.cancelForAccountDeletion(userId),
    ),
    profileService: new ProfileService(profiles, { carrierDisabled: env.CARRIER_DISABLED }),
    driverService: new DriverService(
      drivers,
      profiles,
      zipProvider,
      serviceAreas,
      () => new ConsentLogRepository(createAdminClient()),
    ),
    documentService: new DocumentService(documents, drivers, profiles),
    zipLookupService: new ZipLookupService(zipProvider, serviceAreas),
    carrierService,
    subscriptionService,
    driverSearchService: new DriverSearchService(carrierService, driverSearch, documents),
    adminService: new AdminService(new AdminRepository(supabase), profiles, serviceAreas),
  };
}

export type Container = ReturnType<typeof buildContainer>;

/** Builds services for the current request, acting as the signed-in user (RLS applies). */
export async function getContainer(): Promise<Container> {
  return buildContainer(await createServerClient());
}
