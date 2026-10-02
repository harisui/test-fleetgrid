import type { Profile, UserRole } from "@/types/domain";

/** Route rules shared by the proxy, the server guards and the auth service. No I/O here. */

export const LOGIN_PATH = "/login";
export const VERIFY_PATH = "/verify";
export const CHOOSE_ROLE_PATH = "/choose-role";

export const ROLE_HOME: Record<UserRole, string> = {
  driver: "/driver/profile",
  carrier: "/carrier",
  admin: "/admin",
};

/** Each protected area and the one role allowed inside it. */
export const PROTECTED_AREAS: { prefix: string; role: UserRole }[] = [
  { prefix: "/driver", role: "driver" },
  { prefix: "/carrier", role: "carrier" },
  { prefix: "/admin", role: "admin" },
];

/** Pages that only make sense while signed out. */
const SIGNED_OUT_ONLY = [LOGIN_PATH, VERIFY_PATH];

function isWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The role required for a path, or null when the path is not role-protected. */
export function requiredRoleFor(pathname: string): UserRole | null {
  return PROTECTED_AREAS.find((area) => isWithin(pathname, area.prefix))?.role ?? null;
}

/** Where a signed-in user belongs: the role picker without a profile, their role home otherwise. */
export function homePathFor(profile: Pick<Profile, "role"> | null): string {
  return profile ? ROLE_HOME[profile.role] : CHOOSE_ROLE_PATH;
}

/** True when the proxy has to know who the user is to decide. */
export function needsAuthCheck(pathname: string): boolean {
  return (
    requiredRoleFor(pathname) !== null ||
    isWithin(pathname, CHOOSE_ROLE_PATH) ||
    SIGNED_OUT_ONLY.some((path) => isWithin(pathname, path))
  );
}

export interface RouteContext {
  pathname: string;
  /** True when there is a valid session. */
  signedIn: boolean;
  /** The user's role, or null when signed out or when no profile exists yet. */
  role: UserRole | null;
}

export type RouteDecision = { action: "allow" } | { action: "redirect"; to: string };

const allow: RouteDecision = { action: "allow" };
const redirectTo = (to: string): RouteDecision => ({ action: "redirect", to });

/**
 * The single place that decides who may open which page.
 *
 * - Signed out: protected areas and the role picker go to /login.
 * - Signed in without a profile: everything protected goes to /choose-role.
 * - Signed in with a profile: only the own area is allowed. Other areas, the role picker and
 *   the login pages go to the role home.
 * - Everything else (landing, legal pages, API) is public.
 */
export function decideRoute({ pathname, signedIn, role }: RouteContext): RouteDecision {
  const requiredRole = requiredRoleFor(pathname);
  const onChooseRole = isWithin(pathname, CHOOSE_ROLE_PATH);
  const onSignedOutOnly = SIGNED_OUT_ONLY.some((path) => isWithin(pathname, path));

  if (!signedIn) {
    if (requiredRole || onChooseRole) return redirectTo(LOGIN_PATH);
    return allow;
  }

  if (role === null) {
    if (requiredRole || onSignedOutOnly) return redirectTo(CHOOSE_ROLE_PATH);
    return allow;
  }

  if (requiredRole) {
    return requiredRole === role ? allow : redirectTo(ROLE_HOME[role]);
  }
  if (onChooseRole || onSignedOutOnly) return redirectTo(ROLE_HOME[role]);
  return allow;
}
