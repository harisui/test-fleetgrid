import { expect, test } from "@playwright/test";
import {
  adminClient,
  chooseRole,
  displayPhone,
  enterCode,
  formAlert,
  login,
  OTP,
  PHONES,
  requestCode,
  resetUser,
  seedDriverAtStep,
  seedUser,
  WRONG_OTP,
} from "./helpers";

test.describe("phone login", () => {
  test("formats the number as typed and rejects invalid numbers", async ({ page }) => {
    await page.goto("/login");
    const phone = page.getByLabel("Mobile number");

    // No test hints on the page itself, whatever ENABLE_TEST_LOGIN put in the field.
    await expect(page.getByText(/555-01|123456/)).toHaveCount(0);
    // ENABLE_TEST_LOGIN may have filled the field; this test types from empty.
    await phone.fill("");
    await phone.pressSequentially("5555550100");
    await expect(phone).toHaveValue("(555) 555-0100");

    await phone.fill("555");
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(formAlert(page)).toHaveText("Enter a valid US mobile number");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a new driver signs up, chooses a role and lands in the driver area", async ({ page }) => {
    await resetUser(PHONES.driver);
    await requestCode(page, PHONES.driver);

    await expect(page.getByText(displayPhone(PHONES.driver))).toBeVisible();
    await expect(page.getByLabel("6-digit code")).toHaveAttribute("autocomplete", "one-time-code");
    await expect(page.getByText(/Resend in \d:\d\d/)).toBeVisible();

    await enterCode(page, OTP);
    await expect(page).toHaveURL(/\/choose-role/);

    await chooseRole(page, "driver");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/driver\//);

    const { data } = await adminClient()
      .from("profiles")
      .select("role, status, phone")
      .eq("phone", PHONES.driver)
      .single();
    expect(data).toEqual({ role: "driver", status: "pending", phone: PHONES.driver });
  });

  test("a wrong code shows an error and the right code still works", async ({ page }) => {
    await seedUser(PHONES.driver, "driver");
    await requestCode(page, PHONES.driver);

    await enterCode(page, WRONG_OTP);
    await expect(formAlert(page)).toHaveText("That code is incorrect or has expired");
    await expect(page).toHaveURL(/\/verify/);

    await enterCode(page, OTP);
    await expect(page).toHaveURL(/\/driver\//);
  });

  test("a pasted code with a dash is accepted", async ({ page }) => {
    await seedUser(PHONES.driver, "driver");
    await requestCode(page, PHONES.driver);

    const code = page.getByLabel("6-digit code");
    // Start empty: ENABLE_TEST_LOGIN may have filled the code already.
    await code.fill("");
    await code.focus();
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[name="code"]')!;
      const data = new DataTransfer();
      data.setData("text/plain", "123-456");
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });
    // Browsers that ignore synthetic paste still get the value through a fill.
    if ((await code.inputValue()) === "") await code.fill("123-456");
    await expect(page).toHaveURL(/\/driver\//);
  });

  test("the role picked on the landing link is preselected for a new carrier", async ({ page }) => {
    await resetUser(PHONES.carrier);
    await login(page, PHONES.carrier, "/login?role=carrier");

    await expect(page).toHaveURL(/\/choose-role\?role=carrier/);
    await expect(page.getByRole("radio", { name: /I hire for my company/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/carrier\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Set up your company" })).toBeVisible();
  });

  test("/verify without a phone number goes back to /login", async ({ page }) => {
    await page.goto("/verify");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/verify?phone=not-a-number");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("role routing", () => {
  test("returning users go straight to their own area", async ({ page }) => {
    await seedUser(PHONES.driver, "driver", "approved");
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\//);
  });

  test("the seeded admin lands in the admin area", async ({ page }) => {
    // The admin from supabase/seed.sql, on a number people also use by hand. Signing in only
    // reads the account, so this never disturbs their session; nothing here resets it.
    await login(page, "+15555550102");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Driver review" })).toBeVisible();
  });

  test("signed-out visitors are sent to /login from every protected area", async ({ page }) => {
    for (const path of [
      "/driver/profile",
      "/driver/onboarding",
      "/driver/documents",
      "/carrier",
      "/admin",
      "/choose-role",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
  });

  test("a driver cannot open carrier or admin pages", async ({ page }) => {
    await seedUser(PHONES.driver, "driver");
    await login(page, PHONES.driver);

    for (const path of ["/carrier", "/admin", "/choose-role", "/login"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/driver\//);
    }
  });

  test("a carrier cannot open driver or admin pages", async ({ page }) => {
    await seedUser(PHONES.carrier, "carrier");
    await login(page, PHONES.carrier);

    for (const path of ["/driver/profile", "/driver/onboarding", "/admin", "/choose-role"]) {
      await page.goto(path);
      // The carrier home, which sends a carrier without company details to the sign-up form.
      await expect(page, path).toHaveURL(/\/carrier\/onboarding$/);
    }
  });

  test("a signed-in user without a profile is held at the role picker", async ({ page }) => {
    await resetUser(PHONES.driver);
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/choose-role/);

    for (const path of ["/driver/profile", "/carrier", "/admin"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/choose-role$/);
    }
  });

  test("a blocked user cannot log in", async ({ page }) => {
    await seedUser(PHONES.driver, "driver", "blocked");
    await requestCode(page, PHONES.driver);
    await enterCode(page, OTP);

    await expect(formAlert(page)).toContainText("blocked");
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("session", () => {
  test("logout ends the session", async ({ page }) => {
    // Log out lives in the app shell, which opens once the card is complete.
    await seedDriverAtStep(PHONES.driver, 12);
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\/profile$/);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an expired session redirects to /login", async ({ page, context }) => {
    await seedUser(PHONES.driver, "driver");
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\//);

    // The session cookies are gone, as after expiry.
    await context.clearCookies();
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a session whose account was deleted goes to /login once, with its dead cookie cleared", async ({
    page,
    context,
  }) => {
    await seedDriverAtStep(PHONES.driver, 12);
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\/profile$/);
    const authCookies = async () =>
      (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-") && cookie.value);
    expect((await authCookies()).length).toBeGreaterThan(0);

    // The account disappears while the browser stays signed in, as when the test suite or an
    // admin deletes it.
    await resetUser(PHONES.driver);
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/login$/);
    // The proxy cleared the dead session, so the login page is a clean start, not a loop.
    expect(await authCookies()).toEqual([]);
    await expect(page.getByRole("heading", { level: 1, name: "What is your mobile number?" })).toBeVisible();
  });

  test("the browser tests never use the numbers people sign in with by hand", () => {
    for (const manual of ["+15555550100", "+15555550101", "+15555550102"]) {
      expect(Object.values(PHONES)).not.toContain(manual);
    }
  });

  test("the session survives a reload", async ({ page }) => {
    await seedDriverAtStep(PHONES.driver, 12);
    await login(page, PHONES.driver);
    await page.reload();
    await expect(page).toHaveURL(/\/driver\/profile$/);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });
});
