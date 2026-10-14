import { redirect } from "next/navigation";
import { CHOOSE_ROLE_PATH, LOGIN_PATH, ROLE_HOME } from "@/lib/auth/routes";
import { getContainer } from "@/server/container";
import {
  CARRIER_STAGE_PATHS,
  type CarrierAccess,
  type CarrierStage,
} from "@/server/services/CarrierService";
import type { Profile, SessionUser, UserRole } from "@/types/domain";

/**
 * Server-side guards for pages, layouts and server actions.
 * They redirect instead of returning when the check fails, so code after them can rely on
 * the returned user. The proxy applies the same rules earlier; these are the second check.
 */

/** The signed-in user. Redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const { authService } = await getContainer();
  const user = await authService.getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

/** The signed-in user and their profile, which may not exist yet. */
export async function requireSession(): Promise<{ user: SessionUser; profile: Profile | null }> {
  const { authService } = await getContainer();
  const session = await authService.getSession();
  if (!session) redirect(LOGIN_PATH);
  return session;
}

/**
 * The signed-in user with the given role.
 * Signed out goes to /login, no profile goes to /choose-role, another role goes to that
 * role's home, and a blocked account is signed out.
 */
export async function requireRole(
  role: UserRole,
): Promise<{ user: SessionUser; profile: Profile }> {
  const { authService } = await getContainer();
  const session = await authService.getSession();
  if (!session) redirect(LOGIN_PATH);

  const { user, profile } = session;
  if (!profile) redirect(CHOOSE_ROLE_PATH);
  if (profile.status === "blocked") {
    await authService.signOut().catch(() => undefined);
    redirect(`${LOGIN_PATH}?blocked=1`);
  }
  if (profile.role !== role) redirect(ROLE_HOME[profile.role]);

  return { user, profile };
}

/**
 * The signed-in carrier at one of the given stages. A carrier at any other stage is sent to
 * the page for their own stage, so the search is never reachable without a subscription and
 * the sign-up form never shows twice. The order is onboarding, terms, waitlist or billing,
 * ready (see CarrierService.getAccess).
 */
export async function requireCarrierStage(
  ...stages: CarrierStage[]
): Promise<{ user: SessionUser; profile: Profile; access: CarrierAccess }> {
  const { user, profile } = await requireRole("carrier");
  const { carrierService } = await getContainer();
  const access = await carrierService.getAccess(user.id);
  if (!stages.includes(access.stage)) redirect(CARRIER_STAGE_PATHS[access.stage]);
  return { user, profile, access };
}

/** The signed-in carrier with an active subscription, or the page for the stage they are at. */
export async function requireActiveSubscription() {
  return requireCarrierStage("ready");
}
