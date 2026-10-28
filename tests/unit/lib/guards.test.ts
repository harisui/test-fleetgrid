// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireActiveSubscription,
  requireAdmin,
  requireCarrierStage,
  requireRole,
  requireSession,
  requireUser,
} from "@/lib/auth/guards";
import type { CarrierAccess, CarrierStage } from "@/server/services/CarrierService";
import type { Profile, SessionUser } from "@/types/domain";
import { buildProfile, TEST_PHONES, USER_ID } from "../../setup/factories";

/** redirect() throws in Next.js, so code after it never runs. The mock does the same. */
class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const authService = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
}));
const carrierService = vi.hoisted(() => ({ getAccess: vi.fn() }));
const subscriptionService = vi.hoisted(() => ({ needsRecheck: vi.fn(), refreshAccess: vi.fn() }));

vi.mock("@/server/container", () => ({
  getContainer: async () => ({ authService, carrierService, subscriptionService }),
}));
/** forbidden() throws too: Next.js renders the 403 page in place of the route. */
class ForbiddenSignal extends Error {
  constructor() {
    super("forbidden");
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
  forbidden: () => {
    throw new ForbiddenSignal();
  },
}));

const user: SessionUser = { id: USER_ID, phone: TEST_PHONES.driver };

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RedirectSignal);
  return (error as RedirectSignal).to;
}

function signedInAs(profile: Profile | null) {
  authService.getCurrentUser.mockResolvedValue(user);
  authService.getSession.mockResolvedValue({ user, profile });
}

beforeEach(() => {
  authService.getCurrentUser.mockReset().mockResolvedValue(null);
  authService.getSession.mockReset().mockResolvedValue(null);
  authService.signOut.mockReset().mockResolvedValue(undefined);
  carrierService.getAccess.mockReset();
  subscriptionService.needsRecheck.mockReset().mockReturnValue(false);
  subscriptionService.refreshAccess.mockReset();
});

describe("requireCarrierStage", () => {
  const STAGE_PATHS: Record<CarrierStage, string> = {
    onboarding: "/carrier/onboarding",
    terms: "/carrier/terms",
    waitlist: "/carrier/waitlist",
    billing: "/carrier/billing",
    ready: "/carrier/search",
  };
  const accessAt = (stage: CarrierStage): CarrierAccess => ({
    carrier: null,
    termsAccepted: false,
    subscription: null,
    subscribed: stage === "ready",
    waitlisted: false,
    stage,
  });

  it("needs a carrier first: drivers go home, signed-out users to /login", async () => {
    await expect(redirectOf(requireCarrierStage("ready"))).resolves.toBe("/login");
    signedInAs(buildProfile({ role: "driver" }));
    await expect(redirectOf(requireCarrierStage("ready"))).resolves.toBe("/driver/profile");
    expect(carrierService.getAccess).not.toHaveBeenCalled();
  });

  it.each(Object.keys(STAGE_PATHS) as CarrierStage[])(
    "lets a carrier at %s through to a page for that stage, with the access",
    async (stage) => {
      const profile = buildProfile({ role: "carrier", status: "approved" });
      signedInAs(profile);
      carrierService.getAccess.mockResolvedValue(accessAt(stage));
      await expect(requireCarrierStage(stage)).resolves.toEqual({
        user,
        profile,
        access: accessAt(stage),
      });
      expect(carrierService.getAccess).toHaveBeenCalledWith(user.id);
    },
  );

  it.each([
    ["onboarding", "ready"],
    ["terms", "ready"],
    ["billing", "ready"],
    ["waitlist", "billing"],
    ["ready", "onboarding"],
  ] as const)("a carrier at %s is sent to their own page from a %s page", async (at, wanted) => {
    signedInAs(buildProfile({ role: "carrier", status: "approved" }));
    carrierService.getAccess.mockResolvedValue(accessAt(at));
    await expect(redirectOf(requireCarrierStage(wanted))).resolves.toBe(STAGE_PATHS[at]);
  });

  it("accepts several stages, as the account page does", async () => {
    signedInAs(buildProfile({ role: "carrier", status: "approved" }));
    carrierService.getAccess.mockResolvedValue(accessAt("billing"));
    await expect(requireCarrierStage("terms", "billing", "ready")).resolves.toBeTruthy();
  });

  it("reads a stale subscription from Stripe first, and decides from what comes back", async () => {
    signedInAs(buildProfile({ role: "carrier", status: "approved" }));
    carrierService.getAccess.mockResolvedValue(accessAt("ready"));
    subscriptionService.needsRecheck.mockReturnValue(true);
    // Cancelled at Stripe, webhook never arrived: the search closes on this visit.
    subscriptionService.refreshAccess.mockResolvedValue(accessAt("billing"));
    await expect(redirectOf(requireActiveSubscription())).resolves.toBe("/carrier/billing");
    expect(subscriptionService.needsRecheck).toHaveBeenCalledWith(accessAt("ready"));
    expect(subscriptionService.refreshAccess).toHaveBeenCalledWith(user.id);

    // Paid at Stripe, webhook never arrived: the billing page lets them through to the search.
    carrierService.getAccess.mockResolvedValue(accessAt("billing"));
    subscriptionService.refreshAccess.mockResolvedValue(accessAt("ready"));
    await expect(redirectOf(requireCarrierStage("billing"))).resolves.toBe("/carrier/search");
    await expect(requireActiveSubscription()).resolves.toMatchObject({ access: accessAt("ready") });
  });

  it("does not ask Stripe when the stored subscription is fresh", async () => {
    signedInAs(buildProfile({ role: "carrier", status: "approved" }));
    carrierService.getAccess.mockResolvedValue(accessAt("ready"));
    await expect(requireActiveSubscription()).resolves.toBeTruthy();
    expect(subscriptionService.refreshAccess).not.toHaveBeenCalled();
  });

  it("requireActiveSubscription is the ready stage", async () => {
    signedInAs(buildProfile({ role: "carrier", status: "approved" }));
    carrierService.getAccess.mockResolvedValue(accessAt("billing"));
    await expect(redirectOf(requireActiveSubscription())).resolves.toBe("/carrier/billing");
    carrierService.getAccess.mockResolvedValue(accessAt("ready"));
    await expect(requireActiveSubscription()).resolves.toMatchObject({ access: { stage: "ready" } });
  });
});

describe("requireUser", () => {
  it("redirects to /login when signed out", async () => {
    await expect(redirectOf(requireUser())).resolves.toBe("/login");
  });

  it("returns the user when signed in", async () => {
    signedInAs(null);
    await expect(requireUser()).resolves.toEqual(user);
  });
});

describe("requireSession", () => {
  it("redirects to /login when signed out", async () => {
    await expect(redirectOf(requireSession())).resolves.toBe("/login");
  });

  it("returns the user with a null profile before a role is chosen", async () => {
    signedInAs(null);
    await expect(requireSession()).resolves.toEqual({ user, profile: null });
  });

  it("returns the user with their profile", async () => {
    const profile = buildProfile();
    signedInAs(profile);
    await expect(requireSession()).resolves.toEqual({ user, profile });
  });
});

describe("requireAdmin", () => {
  it("signed out goes to /login, no profile to /choose-role", async () => {
    await expect(redirectOf(requireAdmin())).resolves.toBe("/login");
    signedInAs(null);
    await expect(redirectOf(requireAdmin())).resolves.toBe("/choose-role");
  });

  it("lets an admin through", async () => {
    const profile = buildProfile({ role: "admin", status: "approved" });
    signedInAs(profile);
    await expect(requireAdmin()).resolves.toEqual({ user, profile });
  });

  it.each(["driver", "carrier"] as const)("answers 403 to a %s instead of sending them home", async (role) => {
    signedInAs(buildProfile({ role, status: "approved" }));
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenSignal);
  });

  it("signs a blocked account out first", async () => {
    signedInAs(buildProfile({ role: "admin", status: "blocked" }));
    await expect(redirectOf(requireAdmin())).resolves.toBe("/login?blocked=1");
    expect(authService.signOut).toHaveBeenCalledOnce();
  });
});

describe("requireRole", () => {
  const roles = ["driver", "carrier", "admin"] as const;
  const home = { driver: "/driver/profile", carrier: "/carrier", admin: "/admin" };

  it.each(roles)("signed out: %s pages redirect to /login", async (role) => {
    await expect(redirectOf(requireRole(role))).resolves.toBe("/login");
  });

  it.each(roles)("no profile: %s pages redirect to /choose-role", async (role) => {
    signedInAs(null);
    await expect(redirectOf(requireRole(role))).resolves.toBe("/choose-role");
  });

  it.each(roles)("a %s gets through to their own area", async (role) => {
    const profile = buildProfile({ role, status: "approved" });
    signedInAs(profile);
    await expect(requireRole(role)).resolves.toEqual({ user, profile });
  });

  it.each(
    roles.flatMap((actual) =>
      roles.filter((required) => required !== actual).map((required) => [actual, required]),
    ),
  )("a %s is sent home from %s pages", async (actual, required) => {
    signedInAs(buildProfile({ role: actual }));
    await expect(redirectOf(requireRole(required))).resolves.toBe(home[actual]);
  });

  it("a pending user is allowed", async () => {
    signedInAs(buildProfile({ status: "pending" }));
    await expect(requireRole("driver")).resolves.toBeTruthy();
  });

  it("a blocked user is signed out and sent to /login with a notice", async () => {
    signedInAs(buildProfile({ status: "blocked" }));
    await expect(redirectOf(requireRole("driver"))).resolves.toBe("/login?blocked=1");
    expect(authService.signOut).toHaveBeenCalledOnce();
  });

  it("a blocked user is still redirected when sign-out fails", async () => {
    signedInAs(buildProfile({ status: "blocked" }));
    authService.signOut.mockRejectedValue(new Error("network"));
    await expect(redirectOf(requireRole("driver"))).resolves.toBe("/login?blocked=1");
  });
});
