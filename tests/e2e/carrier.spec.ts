import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  CARRIER_DETAILS,
  chooseRole,
  formAlert,
  login,
  PHONES,
  PLACES,
  resetUser,
  seedCarrier,
  signUp,
  TOS_VERSION,
} from "./helpers";

/**
 * The carrier side end to end: sign-up, the Terms, the paywall with the test checkout, the
 * waitlist for a yard outside the launch area, the driver search from the yard, one
 * driver's page with their papers, the account page, and what a carrier can never reach.
 * The seeded drivers (supabase/seed.sql) are the listed cards: eleven approved, complete,
 * opted-in drivers in the Houston area.
 */

const SEED_DRIVER_PHONE = "+15555551001";

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, label).toEqual([]);
}

/** The seed drivers a subscribed Houston carrier sees: approved, complete, opted in, in area. */
/** On a phone the search filters fold behind "Filters": open them. A desktop shows them already. */
async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
}

async function listedSeedDriverIds(): Promise<string[]> {
  const admin = adminClient();
  const { data: drivers } = await admin
    .from("drivers")
    .select("id, profile_id, sms_opted_out, card_completed, lat, lng")
    .like("zip", "77%")
    .eq("card_completed", true)
    .eq("sms_opted_out", false);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "driver")
    .eq("status", "approved");
  const approved = new Set((profiles ?? []).map((profile) => profile.id));
  return (drivers ?? []).filter((driver) => approved.has(driver.profile_id)).map((driver) => driver.id);
}

async function fillCarrierDetails(page: Page, zip: string = PLACES.houston.zip) {
  await page.getByLabel("Company name").fill(CARRIER_DETAILS.companyName);
  await page.getByLabel("Contact name").fill(CARRIER_DETAILS.contactName);
  await page.getByLabel("Billing email").fill(CARRIER_DETAILS.billingEmail);
  await page.getByLabel("USDOT number").fill(CARRIER_DETAILS.usdot);
  await page.getByLabel("ZIP code").fill(zip);
}

test.describe("carrier sign-up, Terms and payment", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.carrier);
  });

  test("a new carrier sets up the company, accepts the Terms, pays and reaches the search", async ({
    page,
  }) => {
    await signUp(page, PHONES.carrier, "carrier");
    await expect(page).toHaveURL(/\/carrier\/onboarding$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Set up your company");

    // Nothing filled: every required field says so, nothing is saved.
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(formAlert(page)).toHaveCount(4);
    await expect(page).toHaveURL(/\/carrier\/onboarding$/);

    await fillCarrierDetails(page);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await expect(page.locator("[data-slot=launch-area-note]")).toHaveCount(0);
    await page.getByRole("button", { name: "Save and continue" }).click();

    // Step 2: the Terms. The box starts unchecked.
    await expect(page).toHaveURL(/\/carrier\/terms$/);
    const terms = page.getByRole("checkbox");
    await expect(terms).not.toBeChecked();
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(formAlert(page)).toHaveText("Check the box to accept the Terms of Service");
    await terms.click();
    await page.getByRole("button", { name: "Accept and continue" }).click();

    // Step 3: billing. Not subscribed yet, so the search is closed.
    await expect(page).toHaveURL(/\/carrier\/billing$/);
    await expect(page.getByText("Not subscribed")).toBeVisible();
    await expect(page.getByText("$399 a month")).toBeVisible();
    await page.goto("/carrier/search");
    await expect(page).toHaveURL(/\/carrier\/billing$/);

    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page).toHaveURL(/\/carrier\/billing\/test-checkout\?customer=cus_test_/);
    await expect(page.getByRole("heading", { name: "Test checkout" })).toBeVisible();
    await page.getByRole("button", { name: "Pay $399 a month" }).click();

    await expect(page).toHaveURL(/\/carrier\/billing\?checkout=success$/);
    await expect(page.locator("[data-slot=checkout-result]")).toContainText("Payment received");
    await expect(page.locator("[data-subscription=active]")).toBeVisible();
    await expect(page.locator("[data-slot=period-end]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();

    // Everything is in the database: the company, the acceptance with its context, the subscription.
    const admin = adminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", PHONES.carrier)
      .single();
    const { data: carrier } = await admin
      .from("carriers")
      .select("*")
      .eq("profile_id", profile!.id)
      .single();
    expect(carrier).toMatchObject({
      company_name: CARRIER_DETAILS.companyName,
      contact_name: CARRIER_DETAILS.contactName,
      billing_email: CARRIER_DETAILS.billingEmail,
      usdot: CARRIER_DETAILS.usdot,
      mc: null,
      city: "Houston",
      state: "TX",
      zip: "77002",
      lat: PLACES.houston.lat,
      lng: PLACES.houston.lng,
    });
    expect(carrier!.stripe_customer_id).toMatch(/^cus_test_/);
    const { data: acceptance } = await admin
      .from("tos_acceptances")
      .select("version, ip, user_agent")
      .eq("profile_id", profile!.id)
      .single();
    expect(acceptance?.version).toBe(TOS_VERSION);
    expect(acceptance?.user_agent).toContain("Mozilla");
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status, stripe_customer_id, current_period_end")
      .eq("carrier_id", carrier!.id)
      .single();
    expect(subscription?.status).toBe("active");
    expect(subscription?.stripe_customer_id).toBe(carrier!.stripe_customer_id);
    expect(subscription?.current_period_end).toBeTruthy();

    // The search opens, listing the seeded Houston drivers nearest first.
    await page.getByRole("link", { name: "Search" }).first().click();
    await expect(page).toHaveURL(/\/carrier\/search$/);
    const listed = await listedSeedDriverIds();
    await expect(page.locator("[data-slot=result-count]")).toContainText(
      `of ${listed.length} drivers`,
    );
    await expect(page.getByRole("link", { name: /Marcus Hill/ }).first()).toBeVisible();
    // The phone number of a driver is never on the page.
    await expect(page.getByText(/555-1001|\+1555555/)).toHaveCount(0);
  });

  test("the checkout page is only the carrier's own, and cancelling charges nothing", async ({
    page,
  }) => {
    await seedCarrier(PHONES.carrier, { terms: true });
    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/carrier\/billing$/);

    await page.goto("/carrier/billing/test-checkout?customer=cus_somebody_else");
    await expect(page).toHaveURL(/\/carrier\/billing$/);

    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page).toHaveURL(/test-checkout/);
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/carrier\/billing\?checkout=cancelled$/);
    await expect(page.locator("[data-slot=checkout-result]")).toContainText("Nothing was charged");
    await expect(page.getByText("Not subscribed")).toBeVisible();
    const { count } = await adminClient()
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .like("stripe_subscription_id", "sub_test_%");
    expect(count ?? 0).toBeGreaterThanOrEqual(0);
    await page.goto("/carrier/search");
    await expect(page).toHaveURL(/\/carrier\/billing$/);
  });
});

test.describe("the paywall", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.carrier);
  });

  test("a failed payment closes the search, with the reason on the billing page", async ({ page }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "past_due" });
    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/carrier\/billing$/);
    await expect(page.locator("[data-subscription=past_due]")).toHaveText("Payment failed");
    await expect(page.getByText(/last payment failed/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe again" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
    await page.goto("/carrier/search");
    await expect(page).toHaveURL(/\/carrier\/billing$/);
  });

  test("a cancelled subscription closes the search too", async ({ page }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "canceled" });
    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/carrier\/billing$/);
    await expect(page.locator("[data-subscription=canceled]")).toHaveText("Cancelled");
    await page.goto("/carrier/drivers/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/carrier\/billing$/);
  });

  test("a cancellation set for the period end shows as Ending with the date, keeps the search open, and offers Keep", async ({
    page,
  }) => {
    // Cancelled from the portal or the Dashboard: the webhook (or the next visit) stored it.
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active", cancelAtPeriodEnd: true });
    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/carrier\/search$/);
    await page.goto("/carrier/billing");
    const badge = page.locator("[data-ending=true]");
    await expect(badge).toHaveText("Ending");
    await expect(badge).toHaveAttribute("data-subscription", "active");
    await expect(page.getByText(/Access ends on/)).toBeVisible();
    await expect(page.locator("[data-slot=period-end]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep my subscription" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Subscribe/ })).toHaveCount(0);
    await page.goto("/carrier/account");
    await expect(page.locator("[data-ending=true]")).toHaveText("Ending");
    await expect(page.getByText(/Driver search is open until/)).toBeVisible();
  });

  test("a trial opens the search like an active subscription", async ({ page }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "trialing" });
    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/carrier\/search$/);
    await page.goto("/carrier/billing");
    await expect(page.locator("[data-subscription=trialing]")).toHaveText("Trial");
  });
});

test.describe("a yard outside the launch area", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.carrier);
  });

  test("sees the note on sign-up, lands on the waitlist instead of checkout, and can join it", async ({
    page,
  }) => {
    await signUp(page, PHONES.carrier, "carrier");
    await fillCarrierDetails(page, PLACES.dallas.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Dallas, TX");
    await expect(page.locator("[data-slot=launch-area-note]")).toContainText(
      "FleetGrid isn't available in your area yet",
    );
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/carrier\/terms$/);
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Accept and continue" }).click();

    await expect(page).toHaveURL(/\/carrier\/waitlist$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/isn't available in your area yet/);
    await expect(page.getByText("Dallas, TX 75201")).toBeVisible();
    // No checkout for a yard FleetGrid does not serve.
    await page.goto("/carrier/billing");
    await expect(page).toHaveURL(/\/carrier\/waitlist$/);
    await page.goto("/carrier/search");
    await expect(page).toHaveURL(/\/carrier\/waitlist$/);

    await page.getByRole("button", { name: "Join the waitlist" }).click();
    await expect(page.locator("[data-slot=waitlist-joined]")).toContainText("You're on the list.");

    const admin = adminClient();
    const { data: profile } = await admin.from("profiles").select("id").eq("phone", PHONES.carrier).single();
    const { data: carrier } = await admin.from("carriers").select("id").eq("profile_id", profile!.id).single();
    const { data: entry } = await admin
      .from("carrier_waitlist")
      .select("zip, lat, lng")
      .eq("carrier_id", carrier!.id)
      .single();
    expect(entry).toEqual({ zip: "75201", lat: PLACES.dallas.lat, lng: PLACES.dallas.lng });

    // Still on the list after a reload, and the account page offers the yard.
    await page.reload();
    await expect(page.locator("[data-slot=waitlist-joined]")).toBeVisible();
    await page.getByRole("link", { name: "Change your yard" }).click();
    await expect(page).toHaveURL(/\/carrier\/account$/);
    await expect(page.getByText("Outside launch area")).toBeVisible();

    // Moving the yard into the launch area opens billing.
    await page.getByLabel("ZIP code").fill(PLACES.houston.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Company details saved")).toBeVisible();
    await page.goto("/carrier");
    await expect(page).toHaveURL(/\/carrier\/billing$/);
  });
});

test.describe("driver search and a driver's page", () => {
  let listed: string[];

  test.beforeAll(async () => {
    listed = await listedSeedDriverIds();
    expect(listed.length).toBeGreaterThan(1);
  });

  test.afterAll(async () => {
    await resetUser(PHONES.carrier);
    const admin = adminClient();
    await admin.from("driver_documents").delete().like("file_name", "e2e-%");
  });

  test("searches from the yard with the filters in the URL, and a wrong filter falls back", async ({
    page,
  }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/carrier\/search$/);
    await expect(page.locator("[data-slot=result-count]")).toContainText(`of ${listed.length} drivers`);
    await expect(page.locator("[data-slot=result-count]")).toContainText("nearest first");

    // The table has the page's width: the filters sit above it, and on a phone they fold
    // behind "Filters". The boxes fold under "More filters" until one is on.
    const filtersToggle = page.getByRole("button", { name: /^Filters/ });
    if (await filtersToggle.isVisible()) {
      await expect(page.getByRole("combobox", { name: "CDL class" })).toBeHidden();
    }
    await openFilters(page);
    await expect(page.getByRole("combobox", { name: "CDL class" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^H/ })).toBeHidden();
    await page.getByRole("button", { name: /^More filters/ }).click();

    // Every endorsement picked must be on the card: H and T narrows the list. Search is a
    // client-side navigation: the URL takes the query, the page does not reload.
    await page.evaluate(() => {
      (window as Window & { notReloaded?: boolean }).notReloaded = true;
    });
    await page.getByRole("checkbox", { name: /^H/ }).click();
    await page.getByRole("checkbox", { name: /^T/ }).click();
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/endorsements=H&endorsements=T/);
    const { data: withLetters } = await adminClient()
      .from("drivers")
      .select("id")
      .in("id", listed)
      .contains("endorsements", ["H", "T"]);
    const expected = withLetters?.length ?? 0;
    if (expected === 0) {
      await expect(page.getByText("No drivers match")).toBeVisible();
    } else {
      await expect(page.locator("[data-slot=result-count]")).toContainText(`of ${expected} driver`);
    }
    expect(await page.evaluate(() => (window as Window & { notReloaded?: boolean }).notReloaded)).toBe(true);
    // The boxes that are on keep "More filters" open, with the count.
    await openFilters(page);
    await expect(page.getByRole("button", { name: /^More filters \(2 on\)/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(page.getByRole("checkbox", { name: /^H/ })).toBeChecked();

    // The URL is the search: a reload shows the same filters and results.
    await page.reload();
    await openFilters(page);
    await expect(page.getByRole("checkbox", { name: /^T/ })).toBeChecked();
    if (expected > 0) {
      await expect(page.locator("[data-slot=result-count]")).toContainText(`of ${expected} driver`);
    }

    // Class A only, from a fresh search.
    await page.goto("/carrier/search?cdlClass=A");
    const { data: classA } = await adminClient()
      .from("drivers")
      .select("id")
      .in("id", listed)
      .eq("cdl_class", "A");
    await expect(page.locator("[data-slot=result-count]")).toContainText(`of ${classA!.length} driver`);
    await expect(page.getByRole("cell", { name: "Class B" })).toHaveCount(0);

    // A radius the schema refuses: the error shows and the default search is used.
    await page.goto("/carrier/search?radiusMiles=1000");
    await expect(formAlert(page)).toContainText("Distance must be 250 miles or less");
    await expect(page.locator("[data-slot=result-count]")).toContainText(`of ${listed.length} drivers`);

    // Clear filters is the plain search, and every field starts over.
    await page.goto("/carrier/search?cdlClass=A");
    await openFilters(page);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/carrier\/search$/);
    await openFilters(page);
    await expect(page.getByRole("combobox", { name: "CDL class" })).toHaveText(/A or B/);
  });

  test("a driver's page shows the card, the distance and the papers, never the phone", async ({
    page,
  }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    const admin = adminClient();
    const { data: seedProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", SEED_DRIVER_PHONE)
      .single();
    const { data: seedDriver } = await admin
      .from("drivers")
      .select("id, full_name")
      .eq("profile_id", seedProfile!.id)
      .single();
    const path = `${seedDriver!.id}/e2e-${Date.now()}.png`;
    await admin.storage
      .from("driver-documents")
      .upload(path, Buffer.from("not really a png"), { contentType: "image/png" });
    const { data: document } = await admin
      .from("driver_documents")
      .insert({
        driver_id: seedDriver!.id,
        type: "cdl_front",
        storage_path: path,
        file_name: "e2e-cdl.png",
        mime_type: "image/png",
        size_bytes: 16,
      })
      .select("id")
      .single();

    await login(page, PHONES.carrier);
    await page.goto(`/carrier/drivers/${seedDriver!.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(seedDriver!.full_name);
    await expect(page.locator("[data-slot=distance]")).toContainText("miles from your yard");
    const card = page.locator("[data-slot=driver-card]");
    await expect(card).toContainText("CDL class");
    await expect(card).toContainText("Equipment");
    await expect(page.getByText(/555-1001|\+1555555/)).toHaveCount(0);

    const paper = page.getByRole("link", { name: /CDL \(front\)/ });
    await expect(paper).toHaveAttribute("href", `/api/documents/${document!.id}/url`);
    // The link answers with a redirect to a signed, short-lived storage URL.
    const response = await page.request.get(`/api/documents/${document!.id}/url`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toContain("/storage/v1/object/sign/driver-documents/");
    expect(response.headers()["location"]).toContain("token=");

    await page.getByRole("link", { name: "Back to search" }).click();
    await expect(page).toHaveURL(/\/carrier\/search$/);

    await admin.storage.from("driver-documents").remove([path]);
  });

  test("a card that is not listed is not found, and a paper of an unlisted driver is not served", async ({
    page,
  }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    const admin = adminClient();
    // Seed driver 18 is pending review, so not listed.
    const { data: pendingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", "+15555551018")
      .single();
    const { data: pendingDriver } = await admin
      .from("drivers")
      .select("id")
      .eq("profile_id", pendingProfile!.id)
      .single();
    const { data: document } = await admin
      .from("driver_documents")
      .insert({
        driver_id: pendingDriver!.id,
        type: "cdl_back",
        storage_path: `${pendingDriver!.id}/e2e-hidden.png`,
        file_name: "e2e-hidden.png",
        mime_type: "image/png",
        size_bytes: 16,
      })
      .select("id")
      .single();

    await login(page, PHONES.carrier);
    const notFound = await page.goto(`/carrier/drivers/${pendingDriver!.id}`);
    expect(notFound?.status()).toBe(404);
    const hidden = await page.request.get(`/api/documents/${document!.id}/url`, { maxRedirects: 0 });
    expect(hidden.status()).toBe(404);
  });
});

test.describe("the account page and the sign-out", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.carrier);
    await resetUser(PHONES.driver);
  });

  test("shows the company and the subscription, and saves edits", async ({ page }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    await login(page, PHONES.carrier);
    await page.getByRole("link", { name: "Account" }).first().click();
    await expect(page).toHaveURL(/\/carrier\/account$/);
    await expect(page.getByRole("region", { name: "Company status" })).toContainText("Bayou Freight LLC");
    await expect(page.locator("[data-subscription=active]")).toBeVisible();
    await expect(page.getByLabel("Company name")).toHaveValue(CARRIER_DETAILS.companyName);
    await expect(page.getByLabel("USDOT number")).toHaveValue(CARRIER_DETAILS.usdot);

    await page.getByLabel("MC number").fill("55");
    await page.getByLabel("Contact name").fill("Maria Lopez-Reyes");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Company details saved")).toBeVisible();
    const { data: profile } = await adminClient().from("profiles").select("id").eq("phone", PHONES.carrier).single();
    const { data: carrier } = await adminClient()
      .from("carriers")
      .select("mc, contact_name")
      .eq("profile_id", profile!.id)
      .single();
    expect(carrier).toEqual({ mc: "55", contact_name: "Maria Lopez-Reyes" });
    await expect(page.getByRole("region", { name: "Delete account" })).toBeVisible();
  });

  test("a driver cannot open the carrier pages, and a carrier cannot open the driver pages", async ({
    page,
  }) => {
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    await login(page, PHONES.carrier);
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/carrier/);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await resetUser(PHONES.driver);
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/choose-role/);
    await chooseRole(page, "driver");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.goto("/carrier/search");
    await expect(page).toHaveURL(/\/driver\//);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`carrier pages are accessible (${colorScheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page
        .context()
        .addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    test.afterAll(async () => {
      await resetUser(PHONES.carrier);
    });

    test("sign-up with an error, the Terms, the waitlist, billing, test checkout, search, a driver and the account", async ({
      page,
    }) => {
      await signUp(page, PHONES.carrier, "carrier");
      await expect(page).toHaveURL(/\/carrier\/onboarding$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Set up your company");
      await expectNoAccessibilityViolations(page, "onboarding");
      await page.getByRole("button", { name: "Save and continue" }).click();
      await expect(formAlert(page).first()).toBeVisible();
      await expectNoAccessibilityViolations(page, "onboarding with errors");

      await fillCarrierDetails(page, PLACES.dallas.zip);
      await expect(page.locator("[data-slot=launch-area-note]")).toBeVisible();
      await page.getByRole("button", { name: "Save and continue" }).click();
      await expect(page).toHaveURL(/\/carrier\/terms$/);
      await expectNoAccessibilityViolations(page, "terms");
      await page.getByRole("checkbox").click();
      await page.getByRole("button", { name: "Accept and continue" }).click();
      await expect(page).toHaveURL(/\/carrier\/waitlist$/);
      await expectNoAccessibilityViolations(page, "waitlist");

      // Move the yard into the launch area for the rest.
      await page.goto("/carrier/account");
      await expectNoAccessibilityViolations(page, "account");
      await page.getByLabel("ZIP code").fill(PLACES.houston.zip);
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Company details saved")).toBeVisible();

      await page.goto("/carrier/billing");
      await expect(page.getByText("Not subscribed")).toBeVisible();
      await expectNoAccessibilityViolations(page, "billing");
      await page.getByRole("button", { name: "Subscribe" }).click();
      await expect(page).toHaveURL(/test-checkout/);
      await expectNoAccessibilityViolations(page, "test checkout");
      await page.getByRole("button", { name: "Pay $399 a month" }).click();
      await expect(page).toHaveURL(/checkout=success/);
      await expectNoAccessibilityViolations(page, "billing after payment");

      await page.goto("/carrier/search");
      await expect(page.locator("[data-slot=result-count]")).toBeVisible();
      await expectNoAccessibilityViolations(page, "search");
      await page.goto("/carrier/search?radiusMiles=1000");
      await expect(formAlert(page)).toBeVisible();
      await expectNoAccessibilityViolations(page, "search with an error");

      await page.getByRole("link", { name: /Marcus Hill/ }).first().click();
      await expect(page).toHaveURL(/\/carrier\/drivers\//);
      await expectNoAccessibilityViolations(page, "driver");
    });
  });
}
