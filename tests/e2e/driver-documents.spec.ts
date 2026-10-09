import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  expectScreen,
  formAlert,
  login,
  PHONES,
  resetUser,
  seedUser,
} from "./helpers";

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

const fileChooser = (page: Page) => page.getByLabel("Choose a file to upload");
const documentList = (page: Page) => page.getByRole("list", { name: "Uploaded documents" });

/** A driver who has saved step 1, on the documents page. */
async function startWithCard(page: Page): Promise<string> {
  const userId = await seedUser(PHONES.driver, "driver");
  const { data, error } = await adminClient()
    .from("drivers")
    .insert({ profile_id: userId, full_name: "Pat Driver", state: "TX", zip: "75201" })
    .select("id")
    .single();
  if (error) throw error;
  await login(page, PHONES.driver);
  await page.goto("/driver/documents");
  await expect(page.getByRole("heading", { level: 1, name: "My documents" })).toBeVisible();
  return data.id;
}

async function storedFiles(driverId: string) {
  const { data } = await adminClient().storage.from("driver-documents").list(driverId);
  return data ?? [];
}

async function documentRows(driverId: string) {
  const { data } = await adminClient()
    .from("driver_documents")
    .select("type, file_name, mime_type, size_bytes, storage_path")
    .eq("driver_id", driverId);
  return data ?? [];
}

test.describe("driver documents", () => {
  // Leave no users or files behind for other test suites.
  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await resetUser(PHONES.secondDriver);
  });

  test("uploads an image, lists it and previews it", async ({ page }) => {
    const driverId = await startWithCard(page);
    await expect(page.getByText("No documents yet")).toBeVisible();

    await page.getByRole("combobox", { name: "Document type" }).click();
    await page.getByRole("option", { name: "CDL (front)" }).click();
    await fileChooser(page).setInputFiles({ name: "cdl.png", mimeType: "image/png", buffer: PNG });

    const item = documentList(page).getByRole("listitem");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("CDL (front)");
    await expect(item).toContainText("cdl.png");

    const rows = await documentRows(driverId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "cdl_front",
      file_name: "cdl.png",
      mime_type: "image/png",
    });
    expect(rows[0].storage_path).toMatch(new RegExp(`^${driverId}/[0-9a-f-]{36}\\.png$`));
    expect(await storedFiles(driverId)).toHaveLength(1);

    await page.getByRole("button", { name: "Preview cdl.png" }).click();
    const image = page.getByRole("img", { name: "CDL (front) preview" });
    await expect(image).toBeVisible();
    const src = await image.getAttribute("src");
    expect(src).toContain("/storage/v1/object/sign/driver-documents/");
    expect(src).toContain("token=");
    const response = await page.request.get(src!);
    expect(response.status()).toBe(200);
  });

  test("uploads a PDF as it is", async ({ page }) => {
    const driverId = await startWithCard(page);
    await page.getByRole("combobox", { name: "Document type" }).click();
    await page.getByRole("option", { name: "Medical card" }).click();
    await fileChooser(page).setInputFiles({
      name: "medical.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });

    await expect(documentList(page).getByRole("listitem")).toContainText("Medical card");
    const rows = await documentRows(driverId);
    expect(rows[0]).toMatchObject({
      type: "medical_card",
      file_name: "medical.pdf",
      mime_type: "application/pdf",
      size_bytes: PDF.length,
    });

    await page.getByRole("button", { name: "Preview medical.pdf" }).click();
    await expect(page.getByRole("link", { name: "Open PDF" })).toHaveAttribute(
      "href",
      /\/storage\/v1\/object\/sign\/driver-documents\//,
    );
  });

  test("rejects a file over 10 MB", async ({ page }) => {
    const driverId = await startWithCard(page);
    await fileChooser(page).setInputFiles({
      name: "huge.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, "a"),
    });

    await expect(formAlert(page)).toHaveText("File must be 10 MB or smaller");
    await expect(page.getByText("No documents yet")).toBeVisible();
    expect(await storedFiles(driverId)).toHaveLength(0);
    expect(await documentRows(driverId)).toHaveLength(0);
  });

  test("rejects a wrong file type", async ({ page }) => {
    const driverId = await startWithCard(page);
    await fileChooser(page).setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });

    await expect(formAlert(page)).toHaveText("Upload a JPG, PNG, WebP or PDF file");
    expect(await storedFiles(driverId)).toHaveLength(0);
    expect(await documentRows(driverId)).toHaveLength(0);
  });

  test("deletes a document after confirmation", async ({ page }) => {
    const driverId = await startWithCard(page);
    await fileChooser(page).setInputFiles({ name: "cdl.png", mimeType: "image/png", buffer: PNG });
    await expect(documentList(page).getByRole("listitem")).toHaveCount(1);

    // Cancel keeps it.
    await page.getByRole("button", { name: "Delete cdl.png" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(documentList(page).getByRole("listitem")).toHaveCount(1);

    await page.getByRole("button", { name: "Delete cdl.png" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No documents yet")).toBeVisible();

    expect(await documentRows(driverId)).toHaveLength(0);
    expect(await storedFiles(driverId)).toHaveLength(0);
  });

  test("documents survive a reload, and sign-up never asks for them", async ({ page }) => {
    const driverId = await startWithCard(page);
    await fileChooser(page).setInputFiles({ name: "cdl.png", mimeType: "image/png", buffer: PNG });
    await expect(documentList(page).getByRole("listitem")).toHaveCount(1);

    await page.reload();
    await expect(documentList(page).getByRole("listitem")).toHaveCount(1);
    expect(await documentRows(driverId)).toHaveLength(1);

    // Papers left the sign-up (2026-10-09): no page of it has an upload tile or a camera button.
    await adminClient()
      .from("drivers")
      .update({ service_radius_miles: 50, onboarding_step: 4 })
      .eq("id", driverId);
    await page.goto("/driver/onboarding");
    await expectScreen(page, "What class is your CDL?");
    await expect(page.locator("[data-slot=upload-tile]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Take a photo" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Skip for now" })).toHaveCount(0);
  });

  test("Other papers hold several files, up to five", async ({ page }) => {
    const driverId = await startWithCard(page);
    const tile = page.locator("[data-slot=multi-upload-tile]");
    await expect(tile).toContainText("TWIC card, forklift card, other certificates");
    await expect(tile).toHaveAttribute("data-count", "0");

    const chooser = page.getByLabel("Choose a file for other papers");
    await chooser.setInputFiles({ name: "twic.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(tile).toHaveAttribute("data-count", "1");
    await chooser.setInputFiles({ name: "forklift.png", mimeType: "image/png", buffer: PNG });
    await expect(tile).toHaveAttribute("data-count", "2");
    await expect(tile.getByRole("list", { name: "Other papers files" })).toContainText("twic.pdf");
    await expect(tile.getByRole("list", { name: "Other papers files" })).toContainText(
      "forklift.png",
    );
    expect(
      (await documentRows(driverId)).filter((row) => row.type === "certification"),
    ).toHaveLength(2);

    await tile.getByRole("button", { name: "Remove twic.pdf" }).click();
    await expect(tile).toHaveAttribute("data-count", "1");
    await expect(tile).not.toContainText("twic.pdf");
    expect(await storedFiles(driverId)).toHaveLength(1);

    // At five the tile stops taking files, and the server refuses a sixth anyway.
    const admin = adminClient();
    for (let index = 0; index < 4; index += 1) {
      await admin.from("driver_documents").insert({
        driver_id: driverId,
        type: "certification",
        storage_path: `${driverId}/00000000-0000-4000-8000-00000000010${index}.pdf`,
        file_name: `cert-${index}.pdf`,
        mime_type: "application/pdf",
        size_bytes: 1000,
      });
    }
    await page.reload();
    await expect(tile).toHaveAttribute("data-count", "5");
    await expect(tile.getByText(/You can add up to 5 other papers/)).toBeVisible();
    // Exact: the hidden camera input is named "Take a photo of other papers".
    await expect(tile.getByRole("button", { name: "Take a photo", exact: true })).toHaveCount(0);
    const sixth = await admin.from("driver_documents").insert({
      driver_id: driverId,
      type: "certification",
      storage_path: `${driverId}/00000000-0000-4000-8000-000000000199.pdf`,
      file_name: "cert-6.pdf",
      mime_type: "application/pdf",
      size_bytes: 1000,
    });
    expect(sixth.error?.code).toBe("23514");

    // The Documents page shows the same tile.
    await page.goto("/driver/documents");
    await expect(page.locator("[data-slot=multi-upload-tile]")).toHaveAttribute("data-count", "5");
  });

  test("another driver cannot see or fetch the file", async ({ page, browser }) => {
    const driverId = await startWithCard(page);
    await fileChooser(page).setInputFiles({ name: "cdl.png", mimeType: "image/png", buffer: PNG });
    await expect(documentList(page).getByRole("listitem")).toHaveCount(1);
    const [file] = await storedFiles(driverId);
    const path = `${driverId}/${file.name}`;

    // Signed out: the raw storage URL is not readable.
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonymous = await page.request.get(
      `${baseUrl}/storage/v1/object/public/driver-documents/${path}`,
    );
    expect(anonymous.ok()).toBe(false);

    // A second driver sees an empty list.
    const otherId = await seedUser(PHONES.secondDriver, "driver");
    await adminClient()
      .from("drivers")
      .insert({ profile_id: otherId, full_name: "Other Driver", state: "IL", zip: "60601" });
    const context = await browser.newContext();
    const otherPage = await context.newPage();
    await login(otherPage, PHONES.secondDriver);
    await otherPage.goto("/driver/documents");
    await expect(otherPage.getByText("No documents yet")).toBeVisible();
    await context.close();
  });
});
