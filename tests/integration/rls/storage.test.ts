import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  cleanupTestUsers,
  createTestDriver,
  createTestUser,
  DOCUMENTS_BUCKET,
  serviceClient,
  TEST_FILES,
  type TestDriver,
  type TestUser,
  type TypedClient,
} from "../../setup/supabase";

const bucket = (client: TypedClient) => client.storage.from(DOCUMENTS_BUCKET);

describe("Storage policies through the real Storage API", () => {
  let driverA: TestDriver;
  let driverB: TestDriver;
  let carrier: TestUser;
  let admin: TestUser;
  let fileA: string;
  let fileB: string;

  beforeAll(async () => {
    [driverA, driverB, carrier, admin] = await Promise.all([
      createTestDriver(),
      createTestDriver(),
      createTestUser({ role: "carrier", status: "approved" }),
      createTestUser({ role: "admin", status: "approved" }),
    ]);
    fileA = `${driverA.driverId}/seed.png`;
    fileB = `${driverB.driverId}/seed.png`;
    for (const path of [fileA, fileB]) {
      const { error } = await bucket(serviceClient()).upload(path, TEST_FILES.png());
      if (error) throw error;
    }
  });

  afterAll(cleanupTestUsers);

  it("the bucket is private: public URLs do not serve files", async () => {
    const { data } = bucket(anonClient()).getPublicUrl(fileA);
    const response = await fetch(data.publicUrl);
    expect(response.ok).toBe(false);
  });

  describe("driver", () => {
    it("uploads images and PDFs into their own folder", async () => {
      const png = await bucket(driverA.client).upload(
        `${driverA.driverId}/cdl.png`,
        TEST_FILES.png(),
      );
      expect(png.error).toBeNull();

      const pdf = await bucket(driverA.client).upload(
        `${driverA.driverId}/medical.pdf`,
        TEST_FILES.pdf(),
      );
      expect(pdf.error).toBeNull();
    });

    it("lists, downloads and signs only their own files", async () => {
      const list = await bucket(driverA.client).list(driverA.driverId);
      expect(list.data?.map((file) => file.name).sort()).toEqual([
        "cdl.png",
        "medical.pdf",
        "seed.png",
      ]);

      const download = await bucket(driverA.client).download(fileA);
      expect(download.error).toBeNull();
      expect(download.data?.size).toBeGreaterThan(0);

      const signed = await bucket(driverA.client).createSignedUrl(fileA, 60);
      expect(signed.error).toBeNull();
      const response = await fetch(signed.data!.signedUrl);
      expect(response.status).toBe(200);
    });

    it("cannot list, download or sign another driver's files", async () => {
      const list = await bucket(driverA.client).list(driverB.driverId);
      expect(list.data ?? []).toEqual([]);

      const download = await bucket(driverA.client).download(fileB);
      expect(download.error).not.toBeNull();

      const signed = await bucket(driverA.client).createSignedUrl(fileB, 60);
      expect(signed.error).not.toBeNull();
    });

    it("cannot upload into another driver's folder, the root, or a nested folder", async () => {
      for (const path of [
        `${driverB.driverId}/intruder.png`,
        "root.png",
        `${driverA.driverId}/nested/deep.png`,
      ]) {
        const { error } = await bucket(driverA.client).upload(path, TEST_FILES.png());
        expect(error, path).not.toBeNull();
      }
      const list = await bucket(serviceClient()).list(driverB.driverId);
      expect(list.data?.map((file) => file.name)).toEqual(["seed.png"]);
    });

    it("cannot upload a disallowed type", async () => {
      const wrongMime = await bucket(driverA.client).upload(
        `${driverA.driverId}/notes.pdf`,
        TEST_FILES.text(),
      );
      expect(wrongMime.error).not.toBeNull();

      const wrongExtension = await bucket(driverA.client).upload(
        `${driverA.driverId}/script.exe`,
        TEST_FILES.png(),
      );
      expect(wrongExtension.error).not.toBeNull();
    });

    it("cannot upload a file over 10 MB", async () => {
      const big = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "application/pdf" });
      const { error } = await bucket(driverA.client).upload(`${driverA.driverId}/big.pdf`, big);
      expect(error).not.toBeNull();
    });

    it("cannot overwrite an existing file", async () => {
      const { error } = await bucket(driverA.client).upload(fileA, TEST_FILES.png(), {
        upsert: true,
      });
      expect(error).not.toBeNull();
    });

    it("cannot delete another driver's file", async () => {
      await bucket(driverA.client).remove([fileB]);
      const stillThere = await bucket(serviceClient()).download(fileB);
      expect(stillThere.error).toBeNull();
    });

    it("deletes their own file", async () => {
      const path = `${driverA.driverId}/cdl.png`;
      const { data, error } = await bucket(driverA.client).remove([path]);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      const gone = await bucket(serviceClient()).download(path);
      expect(gone.error).not.toBeNull();
    });
  });

  describe("anonymous visitor", () => {
    it("cannot list, download, sign, upload or delete", async () => {
      const anon = anonClient();
      expect((await bucket(anon).list(driverA.driverId)).data ?? []).toEqual([]);
      expect((await bucket(anon).download(fileA)).error).not.toBeNull();
      expect((await bucket(anon).createSignedUrl(fileA, 60)).error).not.toBeNull();
      expect(
        (await bucket(anon).upload(`${driverA.driverId}/anon.png`, TEST_FILES.png())).error,
      ).not.toBeNull();

      await bucket(anon).remove([fileA]);
      expect((await bucket(serviceClient()).download(fileA)).error).toBeNull();
    });
  });

  describe("carrier (Milestone 1)", () => {
    it("cannot read or upload driver files", async () => {
      expect((await bucket(carrier.client).list(driverA.driverId)).data ?? []).toEqual([]);
      expect((await bucket(carrier.client).download(fileA)).error).not.toBeNull();
      expect(
        (await bucket(carrier.client).upload(`${driverA.driverId}/c.png`, TEST_FILES.png())).error,
      ).not.toBeNull();
    });
  });

  describe("admin", () => {
    it("reads every driver's files", async () => {
      expect((await bucket(admin.client).download(fileA)).error).toBeNull();
      expect((await bucket(admin.client).download(fileB)).error).toBeNull();
      const signed = await bucket(admin.client).createSignedUrl(fileB, 60);
      expect(signed.error).toBeNull();
    });

    it("can delete any file", async () => {
      const { data, error } = await bucket(admin.client).remove([fileB]);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  });
});
