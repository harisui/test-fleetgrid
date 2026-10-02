// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decideRoute,
  homePathFor,
  needsAuthCheck,
  requiredRoleFor,
  ROLE_HOME,
} from "@/lib/auth/routes";
import type { UserRole } from "@/types/domain";

const allow = { action: "allow" };
const to = (path: string) => ({ action: "redirect", to: path });

const DRIVER_PATHS = [
  "/driver",
  "/driver/onboarding",
  "/driver/profile",
  "/driver/documents",
  "/driver/anything/deeper",
];
const CARRIER_PATHS = ["/carrier", "/carrier/search", "/carrier/billing"];
const ADMIN_PATHS = ["/admin", "/admin/drivers", "/admin/shifts/123"];
const PROTECTED_PATHS = [...DRIVER_PATHS, ...CARRIER_PATHS, ...ADMIN_PATHS];
const PUBLIC_PATHS = ["/", "/terms", "/privacy", "/sms-terms", "/api/health", "/drivers-wanted"];
const SIGNED_OUT_ONLY_PATHS = ["/login", "/verify"];

type Who = { label: string; signedIn: boolean; role: UserRole | null };
const SIGNED_OUT: Who = { label: "signed out", signedIn: false, role: null };
const NO_PROFILE: Who = { label: "signed in without a profile", signedIn: true, role: null };
const DRIVER: Who = { label: "driver", signedIn: true, role: "driver" };
const CARRIER: Who = { label: "carrier", signedIn: true, role: "carrier" };
const ADMIN: Who = { label: "admin", signedIn: true, role: "admin" };

const decide = (pathname: string, who: Who) =>
  decideRoute({ pathname, signedIn: who.signedIn, role: who.role });

describe("decideRoute", () => {
  describe("public pages are open to everyone", () => {
    const everyone = [SIGNED_OUT, NO_PROFILE, DRIVER, CARRIER, ADMIN];
    it.each(PUBLIC_PATHS.flatMap((path) => everyone.map((who) => [path, who.label, who] as const)))(
      "%s for %s",
      (path, _label, who) => {
        expect(decide(path, who)).toEqual(allow);
      },
    );
  });

  describe("signed out", () => {
    it.each(PROTECTED_PATHS)("%s redirects to /login", (path) => {
      expect(decide(path, SIGNED_OUT)).toEqual(to("/login"));
    });

    it("/choose-role redirects to /login", () => {
      expect(decide("/choose-role", SIGNED_OUT)).toEqual(to("/login"));
    });

    it.each(SIGNED_OUT_ONLY_PATHS)("%s is allowed", (path) => {
      expect(decide(path, SIGNED_OUT)).toEqual(allow);
    });
  });

  describe("signed in without a profile", () => {
    it.each([...PROTECTED_PATHS, ...SIGNED_OUT_ONLY_PATHS])(
      "%s redirects to /choose-role",
      (path) => {
        expect(decide(path, NO_PROFILE)).toEqual(to("/choose-role"));
      },
    );

    it("/choose-role is allowed", () => {
      expect(decide("/choose-role", NO_PROFILE)).toEqual(allow);
    });
  });

  describe.each([
    { who: DRIVER, own: DRIVER_PATHS, foreign: [...CARRIER_PATHS, ...ADMIN_PATHS] },
    { who: CARRIER, own: CARRIER_PATHS, foreign: [...DRIVER_PATHS, ...ADMIN_PATHS] },
    { who: ADMIN, own: ADMIN_PATHS, foreign: [...DRIVER_PATHS, ...CARRIER_PATHS] },
  ])("$who.label", ({ who, own, foreign }) => {
    const home = ROLE_HOME[who.role!];

    it.each(own)("%s (own area) is allowed", (path) => {
      expect(decide(path, who)).toEqual(allow);
    });

    it.each(foreign)("%s (another role's area) redirects home", (path) => {
      expect(decide(path, who)).toEqual(to(home));
    });

    it.each(["/choose-role", ...SIGNED_OUT_ONLY_PATHS])("%s redirects home", (path) => {
      expect(decide(path, who)).toEqual(to(home));
    });
  });

  it("does not treat look-alike paths as protected", () => {
    for (const path of ["/drivers", "/driver-jobs", "/administrator", "/carriers", "/loginx"]) {
      expect(decide(path, SIGNED_OUT)).toEqual(allow);
    }
  });
});

describe("requiredRoleFor", () => {
  it.each([
    ["/driver", "driver"],
    ["/driver/profile", "driver"],
    ["/carrier", "carrier"],
    ["/carrier/billing", "carrier"],
    ["/admin", "admin"],
    ["/admin/drivers", "admin"],
    ["/", null],
    ["/login", null],
    ["/drivers", null],
    ["/choose-role", null],
  ])("%s requires %s", (path, role) => {
    expect(requiredRoleFor(path)).toBe(role);
  });
});

describe("needsAuthCheck", () => {
  it.each([...PROTECTED_PATHS, "/choose-role", ...SIGNED_OUT_ONLY_PATHS])("%s needs it", (path) => {
    expect(needsAuthCheck(path)).toBe(true);
  });

  it.each(PUBLIC_PATHS)("%s does not", (path) => {
    expect(needsAuthCheck(path)).toBe(false);
  });
});

describe("homePathFor", () => {
  it("maps roles to their home and no profile to the role picker", () => {
    expect(homePathFor(null)).toBe("/choose-role");
    expect(homePathFor({ role: "driver" })).toBe("/driver/profile");
    expect(homePathFor({ role: "carrier" })).toBe("/carrier");
    expect(homePathFor({ role: "admin" })).toBe("/admin");
  });

  it("every role home sits inside that role's protected area", () => {
    for (const role of ["driver", "carrier", "admin"] as const) {
      expect(requiredRoleFor(ROLE_HOME[role])).toBe(role);
    }
  });
});
