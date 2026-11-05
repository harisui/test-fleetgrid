import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestUsers, createListedDriver, createTestCarrier, serviceClient, type TestCarrier, type TestDriver } from "../../setup/supabase";

const BUCKET = "driver-documents";
const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** The file itself: private, and an address alone opens nothing. */
describe("driver documents are private", () => {
  let driver: TestDriver;
  let other: TestDriver;
  let carrier: TestCarrier;
  let path: string;

  beforeAll(async () => {
    [driver, other] = await Promise.all([createListedDriver({ fullName: "Priya Private" }), createListedDriver({ fullName: "Omar Other" })]);
    carrier = await createTestCarrier({ subscription: "active" });
    path = `${driver.driverId}/private-${Date.now()}.png`;
    const { error } = await serviceClient().storage.from(BUCKET).upload(path, Buffer.from("not really a png"), { contentType: "image/png" });
    if (error) throw error;
  });

  afterAll(async () => {
    await serviceClient().storage.from(BUCKET).remove([path]);
    await cleanupTestUsers();
  });

  it("the bucket is private", async () => {
    const { data } = await serviceClient().storage.getBucket(BUCKET);
    expect(data?.public).toBe(false);
  });

  it("an unsigned address fails, public or not", async () => {
    expect((await fetch(`${base()}/storage/v1/object/public/${BUCKET}/${path}`)).ok).toBe(false);
    expect((await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`)).ok).toBe(false);
  });

  it("a signed link opens it", async () => {
    const { data } = await serviceClient().storage.from(BUCKET).createSignedUrl(path, 60);
    expect((await fetch(data!.signedUrl)).ok).toBe(true);
  });

  it("a signed link stops working after it expires, and a changed token never works", async () => {
    const { data } = await serviceClient().storage.from(BUCKET).createSignedUrl(path, 1);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect((await fetch(data!.signedUrl)).ok).toBe(false);
    const { data: fresh } = await serviceClient().storage.from(BUCKET).createSignedUrl(path, 60);
    expect((await fetch(`${fresh!.signedUrl}x`)).ok).toBe(false);
  });

  it("only the driver's own folder: not another driver, and no carrier without a booking", async () => {
    const own = await driver.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(own.error).toBeNull();
    const stranger = await other.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(stranger.error).not.toBeNull();
    const company = await carrier.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(company.error).not.toBeNull();
    const list = await carrier.client.storage.from(BUCKET).list(driver.driverId);
    expect(list.data ?? []).toEqual([]);
  });
});
