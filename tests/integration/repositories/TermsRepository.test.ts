import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_TERMS } from "@/content/legal/terms";
import { TermsAdminRepository, TermsRepository } from "@/server/repositories/TermsRepository";
import { cleanupTestUsers, createTestDriver, serviceClient, type TestDriver } from "../../setup/supabase";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const newToken = () => randomBytes(16).toString("base64url");

/**
 * The Terms archive and links against the local database (Milestone 6). Only the real current
 * version is archived here: the archive is append-only, and a test version that needs everyone
 * again would gate every local driver for good. That case is covered by pgTAP 031, inside a
 * transaction that is rolled back.
 */
describe("Terms repositories", () => {
  let driver: TestDriver;
  const admin = () => new TermsAdminRepository(serviceClient());

  beforeAll(async () => {
    driver = await createTestDriver();
    await admin().publish(CURRENT_TERMS);
  });

  afterAll(cleanupTestUsers);

  it("archives the current version with the SHA-256 of its exact text, idempotently", async () => {
    expect(await admin().publish(CURRENT_TERMS)).toEqual({ bodySha256: sha256(CURRENT_TERMS.body) });
    const { data } = await serviceClient().from("terms_versions").select("body, title").eq("version", CURRENT_TERMS.version).single();
    expect(data).toEqual({ body: CURRENT_TERMS.body, title: CURRENT_TERMS.title });
  });

  it("refuses different text under the same version", async () => {
    await expect(admin().publish({ ...CURRENT_TERMS, body: `${CURRENT_TERMS.body} ` })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets a signed-in driver ask only about themselves, and they are fine when nothing needs re-acceptance", async () => {
    // A local database may hold a version that needs everyone again only if a test leaked one.
    expect(await admin().requiredVersion()).toBeNull();
    expect(await new TermsRepository(driver.client).myTermsOk()).toBe(true);
    expect(await admin().driversAwaiting()).toEqual([]);
  });

  it("issues a link by its hash, ends the earlier one, and uses it up on acceptance", async () => {
    const first = newToken();
    const second = newToken();
    const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
    await admin().createLink({ profileId: driver.id, version: CURRENT_TERMS.version, tokenHash: sha256(first), expiresAt, createdBy: null });
    await admin().createLink({ profileId: driver.id, version: CURRENT_TERMS.version, tokenHash: sha256(second), expiresAt, createdBy: null });

    const earlier = await admin().findLink(sha256(first));
    expect(new Date(earlier!.expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(await admin().acceptByLink({ tokenHash: sha256(first), ip: null, userAgent: null, statement: "I agree" })).toMatchObject({
      outcome: "expired",
    });
    expect(await admin().findLink(sha256(second))).toMatchObject({ profileId: driver.id, version: CURRENT_TERMS.version, usedAt: null });

    expect(
      await admin().acceptByLink({ tokenHash: sha256(second), ip: "203.0.113.9", userAgent: "Phone", statement: "I agree" }),
    ).toEqual({ outcome: "accepted", profileId: driver.id });
    expect((await admin().findLink(sha256(second)))?.usedAt).not.toBeNull();
    expect(await admin().acceptByLink({ tokenHash: sha256(second), ip: null, userAgent: null, statement: "I agree" })).toMatchObject({
      outcome: "used",
    });
    expect(await admin().acceptByLink({ tokenHash: sha256(newToken()), ip: null, userAgent: null, statement: "I agree" })).toEqual({
      outcome: "not_found",
      profileId: null,
    });

    const { data } = await driver.client.from("tos_acceptances").select("version, method, ip, user_agent, statement").eq("profile_id", driver.id);
    expect(data).toEqual([{ version: CURRENT_TERMS.version, method: "link", ip: "203.0.113.9", user_agent: "Phone", statement: "I agree" }]);
  });

  it("keeps links away from signed-in users", async () => {
    const { data, error } = await driver.client.from("driver_terms_links").select("id");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });
});
