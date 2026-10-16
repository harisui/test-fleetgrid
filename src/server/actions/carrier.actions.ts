"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { ZipLookup } from "@/server/services/ZipLookupService";
import type { LocatedCarrier, Subscription, TosAcceptance, WaitlistEntry } from "@/types/domain";

/** The carrier's one-page sign-up: company, contact, billing email, numbers and the yard ZIP. */
export async function saveCarrierDetailsAction(input: unknown): Promise<Result<LocatedCarrier>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { carrierService } = await getContainer();
    const carrier = await carrierService.createCarrier(user.id, input);
    revalidatePath("/carrier", "layout");
    return carrier;
  });
}

/** Edits the same details from the account page. */
export async function updateCarrierDetailsAction(input: unknown): Promise<Result<LocatedCarrier>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { carrierService } = await getContainer();
    const carrier = await carrierService.updateCarrier(user.id, input);
    revalidatePath("/carrier", "layout");
    return carrier;
  });
}

/** City and state for the yard ZIP the carrier typed, and whether it sits in a launch area. */
export async function lookupYardZipAction(zip: unknown): Promise<Result<ZipLookup | null>> {
  return runAction(async () => {
    await requireRole("carrier");
    const { zipLookupService } = await getContainer();
    return zipLookupService.lookup(zip);
  });
}

/** Records the Terms acceptance with the caller's address and browser. */
export async function acceptTermsAction(input: unknown): Promise<Result<TosAcceptance>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { carrierService } = await getContainer();
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    const acceptance = await carrierService.acceptTerms(user.id, input, {
      ip: forwarded ? forwarded.split(",")[0].trim() : (requestHeaders.get("x-real-ip") ?? null),
      userAgent: requestHeaders.get("user-agent"),
    });
    revalidatePath("/carrier", "layout");
    return acceptance;
  });
}

export async function joinWaitlistAction(): Promise<Result<WaitlistEntry>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { carrierService } = await getContainer();
    const entry = await carrierService.joinWaitlist(user.id);
    revalidatePath("/carrier", "layout");
    return entry;
  });
}

/** Starts payment. Returns the URL to send the browser to (Stripe Checkout, or the test page). */
export async function startCheckoutAction(): Promise<Result<{ url: string }>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { subscriptionService } = await getContainer();
    return subscriptionService.startCheckout(user.id);
  });
}

/** Opens the hosted billing page where the carrier changes their card or cancels. */
export async function openBillingPortalAction(): Promise<Result<{ url: string }>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { subscriptionService } = await getContainer();
    return subscriptionService.openBillingPortal(user.id);
  });
}

/**
 * Asks the payment provider whether the carrier's subscription is live. The billing page
 * polls it after checkout, so access opens even when the webhook is late or lost.
 */
export async function refreshSubscriptionAction(): Promise<Result<{ subscribed: boolean }>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { subscriptionService } = await getContainer();
    const billing = await subscriptionService.syncFromProvider(user.id);
    if (billing.subscribed) revalidatePath("/carrier", "layout");
    return { subscribed: billing.subscribed };
  });
}

/** Test mode only: the Pay button of the in-app checkout page. */
export async function completeTestCheckoutAction(customerId: unknown): Promise<Result<Subscription>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { subscriptionService } = await getContainer();
    const subscription = await subscriptionService.completeTestCheckout(user.id, customerId);
    revalidatePath("/carrier", "layout");
    return subscription;
  });
}
