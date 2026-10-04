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

  test("documents survive a reload and can be added from the Papers screen", async ({ page }) => {
    const driverId = await startWithCard(page);
    await fileChooser(page).setInputFiles({ name: "cdl.png", mimeType: "image/png", buffer: PNG });
    await expect(documentList(page).getByRole("listitem")).toHaveCount(1);

    await page.reload();
    await expect(documentList(page).getByRole("listitem")).toHaveCount(1);

    // Screen 10 (Papers) shows the same file in its tile and takes new ones.
    await adminClient()
      .from("drivers")
      .update({
        service_radius_miles: 50,
        operator_types: ["mechanic"],
        years_experience: 3,
        availability: ["on_call"],
        cdl_class: "none",
        certifications: [],
        onboarding_step: 10,
      })
      .eq("id", driverId);
    await page.goto("/driver/onboarding");
    // Phones show the question as the sign title; wide screens group the mile under "Papers".
    await expectScreen(page, "Do you want to add your papers now?");
    const front = page.locator("[data-slot=upload-tile]").filter({ hasText: "Front of your CDL" });
    await expect(front).toHaveAttribute("data-state", "done");
    await expect(front).toContainText("cdl.png");

    await page
      .getByLabel("Choose a file for medical card")
      .setInputFiles({ name: "medical.pdf", mimeType: "application/pdf", buffer: PDF });
    const medical = page.locator("[data-slot=upload-tile]").filter({ hasText: "Medical card" });
    await expect(medical).toHaveAttribute("data-state", "done");
    await expect(medical).toContainText("medical.pdf");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    expect(await documentRows(driverId)).toHaveLength(2);

    // Remove takes the file away again.
    await medical.getByRole("button", { name: "Remove" }).click();
    await expect(medical).toHaveAttribute("data-state", "empty");
    expect(await documentRows(driverId)).toHaveLength(1);
    expect(await storedFiles(driverId)).toHaveLength(1);
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
