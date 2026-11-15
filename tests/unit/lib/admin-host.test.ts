// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decideAdminHost, hostOf } from "@/lib/auth/admin-host";

const ADMIN = "admin.fleetgridus.com";
const decide = (host: string, pathname: string, extra: Partial<Parameters<typeof decideAdminHost>[0]> = {}) =>
  decideAdminHost({ host, pathname, search: "", adminHost: ADMIN, ...extra });

/** The admin subdomain (user decision of 2026-11-15). */
describe("decideAdminHost", () => {
  it("changes nothing without ADMIN_HOST: local, tests and previews", () => {
    expect(decideAdminHost({ host: "localhost", pathname: "/admin", search: "", adminHost: undefined })).toEqual({ action: "pass", adminHost: false });
    expect(decideAdminHost({ host: "fleetgridus.com", pathname: "/admin/drivers", search: "", adminHost: "  " })).toEqual({ action: "pass", adminHost: false });
  });

  it("serves the admin pages, the admin sign-in and what they need on the admin host", () => {
    for (const path of ["/admin", "/admin/drivers", "/admin-sign-in", "/admin-verify", "/api/documents/x/url", "/_next/data/x.json", "/forbidden"]) {
      expect(decide(ADMIN, path), path).toEqual({ action: "pass", adminHost: true });
    }
  });

  it("sends the home page and every public, driver or carrier page on the admin host to /admin", () => {
    // The phone sign-in too: admins sign in with email and password there (0039).
    for (const path of ["/", "/carriers", "/terms", "/driver", "/carrier/billing", "/choose-role", "/q/flyer", "/administrator", "/login", "/verify"]) {
      expect(decide(ADMIN, path), path).toEqual({ action: "redirect", to: "https://admin.fleetgridus.com/admin" });
    }
  });

  it("answers robots.txt on the admin host with nothing to crawl", () => {
    expect(decide(ADMIN, "/robots.txt")).toEqual({ action: "robots" });
  });

  it("sends /admin on the public site to the same page on the admin host, with its query", () => {
    expect(decideAdminHost({ host: "fleetgridus.com", pathname: "/admin/drivers", search: "?rereview=ready", adminHost: ADMIN })).toEqual({
      action: "redirect",
      to: "https://admin.fleetgridus.com/admin/drivers?rereview=ready",
    });
    expect(decide("www.fleetgridus.com", "/admin")).toEqual({ action: "redirect", to: "https://admin.fleetgridus.com/admin" });
    expect(decide("fleetgridus.com", "/admin-sign-in")).toEqual({ action: "redirect", to: "https://admin.fleetgridus.com/admin-sign-in" });
    expect(decide("fleetgridus.com", "/admin-verify")).toEqual({ action: "redirect", to: "https://admin.fleetgridus.com/admin-verify" });
    // The rest of the public site is untouched, the login included.
    for (const path of ["/", "/login", "/driver", "/api/twilio/inbound", "/administrator"]) {
      expect(decide("fleetgridus.com", path), path).toEqual({ action: "pass", adminHost: false });
    }
  });

  it("refuses an admin-host request without Cloudflare's secret header, when one is set", () => {
    const gated = { gateSecret: "s3cret-gate-value" };
    expect(decide(ADMIN, "/admin", { ...gated, gateHeader: null })).toEqual({ action: "refuse" });
    expect(decide(ADMIN, "/admin", { ...gated, gateHeader: "wrong-gate-value!" })).toEqual({ action: "refuse" });
    expect(decide(ADMIN, "/admin", { ...gated, gateHeader: "s3cret-gate-value" })).toEqual({ action: "pass", adminHost: true });
    // The public site never needs it.
    expect(decide("fleetgridus.com", "/", { ...gated, gateHeader: null })).toEqual({ action: "pass", adminHost: false });
  });

  it("reads the host without its port, in lower case", () => {
    expect(hostOf("Admin.FleetGridUS.com:443")).toBe("admin.fleetgridus.com");
    expect(hostOf(null)).toBe("");
  });
});
