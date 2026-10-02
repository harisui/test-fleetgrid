// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRole, requireSession, requireUser } from "@/lib/auth/guards";
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

vi.mock("@/server/container", () => ({ getContainer: async () => ({ authService }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
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
