import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, login, PHONES, seedUser } from "./helpers";

/**
 * The Analytics page: the tiles and the sources, and a QR code's whole life: made from the
 * sheet, previewed, downloaded as PNG and SVG, scanned through its short link (which logs
 * the scan and lands on the tagged page), switched off (a scan then lands home, untagged)
 * and on again.
 */

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  expect(
    results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length })),
    label,
  ).toEqual([]);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test.describe("admin analytics", () => {
  const location = `Love's, Hwy 225 e2e ${Date.now()}`;
  const slug = `loves-hwy-225-e2e-${Date.now()}`;

  test.beforeEach(async () => {
    await seedUser(PHONES.admin, "admin", "approved");
  });

  test.afterAll(async () => {
    await adminClient().from("qr_links").delete().like("slug", "loves-hwy-225-e2e-%");
  });

  test("a QR code from the sheet to the scan: made, previewed, downloaded, scanned, switched off and on", async ({
    page,
    browser,
  }) => {
    await login(page, PHONES.admin);
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analytics");
    await expect(page.getByRole("region", { name: "Sign-ups" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where drivers come from" })).toBeVisible();

    // Make one.
    await page.getByRole("button", { name: "Generate QR code" }).click();
    const sheet = page.getByRole("dialog", { name: "Generate QR code" });
    await sheet.getByRole("textbox", { name: /Location name/ }).fill(location);
    await expect(sheet.getByRole("textbox", { name: /Slug/ })).toHaveValue(slug);
    await expect(sheet.getByRole("textbox", { name: /Campaign/ })).toHaveValue("pasadena-225");
    await page.waitForTimeout(300);
    await expectNoAccessibilityViolations(page, "generate sheet");
    await sheet.getByRole("button", { name: "Save and show the code" }).click();
    await expect(page.getByText(/^QR code made/)).toBeVisible();
    await expect(page).toHaveURL(/open=/);

    // The detail sheet: the preview renders, the short link reads right, the downloads are real files.
    const detail = page.getByRole("dialog", { name: location });
    const preview = detail.getByRole("img", { name: `QR code for ${location}` });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(detail.locator("[data-slot=short-link]")).toContainText(`/q/${slug}`);
    const { data: made } = await adminClient().from("qr_links").select("id, created_by").eq("slug", slug).single();
    expect(made).not.toBeNull();

    const png = await page.request.get(`/api/admin/qr/${made!.id}/png?download=1`);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toContain("image/png");
    expect(png.headers()["content-disposition"]).toContain(`attachment; filename="fleetgrid-qr-${slug}.png"`);
    expect([...(await png.body()).subarray(0, 8)]).toEqual(PNG_MAGIC);
    const svg = await page.request.get(`/api/admin/qr/${made!.id}/svg?download=1`);
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    const svgText = await svg.text();
    expect(svgText).toContain("<svg");
    expect(svgText).toContain("Love&apos;s, Hwy 225 e2e");

    // The audit log has the creation.
    const { data: audit } = await adminClient().from("admin_audit_log").select("action").eq("target_id", made!.id).order("created_at");
    expect(audit?.map((entry) => entry.action)).toEqual(["qr_link_created"]);

    // A stranger scans the flyer: logged, then the tagged home page.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/q/${slug}`);
    await expect(visitor).toHaveURL(new RegExp(`/\\?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=${slug}$`));
    await visitor.context().close();
    const { count: scans } = await adminClient().from("qr_scans").select("id", { count: "exact", head: true }).eq("qr_link_id", made!.id);
    expect(scans).toBe(1);

    // Back on the page the counts show the scan.
    await page.goto(`/admin/analytics?open=${made!.id}`);
    const counts = page.getByRole("dialog", { name: location }).getByLabel("Counts");
    await expect(counts).toContainText("1");
    await page.waitForTimeout(300);
    await expectNoAccessibilityViolations(page, "qr detail sheet");

    // Off: a scan lands home without tags and is not counted.
    await page.getByRole("dialog", { name: location }).getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog", { name: `Deactivate ${location}?` }).getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText(/^The code is off/)).toBeVisible();
    await expect(page.getByRole("dialog", { name: location }).getByText("Off")).toHaveAttribute("data-qr-status", "off");
    const again = await (await browser.newContext()).newPage();
    await again.goto(`/q/${slug}`);
    await expect(again).toHaveURL(/\/$/);
    await again.context().close();
    const { count: still } = await adminClient().from("qr_scans").select("id", { count: "exact", head: true }).eq("qr_link_id", made!.id);
    expect(still).toBe(1);

    // On again.
    await page.getByRole("dialog", { name: location }).getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText(/^The code is on again/)).toBeVisible();
    const { data: history } = await adminClient().from("admin_audit_log").select("action").eq("target_id", made!.id).order("created_at");
    expect(history?.map((entry) => entry.action)).toEqual(["qr_link_created", "qr_link_deactivated", "qr_link_activated"]);

    // The list shows it with its short link and the period keeps in the URL.
    await page.getByRole("dialog", { name: location }).getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    await expect(page.getByRole("table", { name: "QR codes" })).toContainText(`/q/${slug}`);
    await expect(page.getByRole("table", { name: "Sources" })).toContainText(`QR: ${location}`);
  });

  test("the downloads and the page are for admins only", async ({ page }) => {
    const response = await page.request.get("/api/admin/qr/00000000-0000-4000-8000-000000000000/png");
    expect(response.status()).toBe(401);
    await page.goto("/admin/analytics");
    await expect(page).toHaveURL(/\/login$/);
  });
});
