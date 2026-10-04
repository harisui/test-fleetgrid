import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { DocumentRepository } from "@/server/repositories/DocumentRepository";
import {
  cleanupTestUsers,
  createTestDriver,
  DOCUMENTS_BUCKET,
  serviceClient,
  TEST_FILES,
  type TestDriver,
} from "../../setup/supabase";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("DocumentRepository (local Supabase)", () => {
  let driver: TestDriver;
  let otherDriver: TestDriver;
  let repository: DocumentRepository;
  let otherRepository: DocumentRepository;

  const pathFor = (owner: TestDriver, extension: string) =>
    `${owner.driverId}/${randomUUID()}.${extension}`;

  /** The browser side of an upload: send the file with the one-time token. */
  async function uploadWithToken(owner: TestDriver, path: string, token: string, file: Blob) {
    return owner.client.storage.from(DOCUMENTS_BUCKET).uploadToSignedUrl(path, token, file);
  }

  beforeAll(async () => {
    [driver, otherDriver] = await Promise.all([createTestDriver(), createTestDriver()]);
    repository = new DocumentRepository(driver.client);
    otherRepository = new DocumentRepository(otherDriver.client);
  });

  afterAll(cleanupTestUsers);

  describe("storage", () => {
    it("createUploadToken + browser upload + getFileInfo round trip", async () => {
      const path = pathFor(driver, "png");
      const token = await repository.createUploadToken(path);
      expect(token.length).toBeGreaterThan(10);

      await expect(repository.getFileInfo(path)).resolves.toBeNull();

      const upload = await uploadWithToken(driver, path, token, TEST_FILES.png());
      expect(upload.error).toBeNull();

      const info = await repository.getFileInfo(path);
      expect(info).toEqual({ sizeBytes: TEST_FILES.png().size, mimeType: "image/png" });
    });

    it("createUploadToken is FORBIDDEN outside the driver's own folder", async () => {
      const error = await expectAppError(repository.createUploadToken(pathFor(otherDriver, "png")));
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toBe("This file could not be uploaded");
    });

    it("a token cannot be used to store a disallowed type", async () => {
      const path = pathFor(driver, "pdf");
      const token = await repository.createUploadToken(path);
      const upload = await uploadWithToken(driver, path, token, TEST_FILES.text());
      expect(upload.error).not.toBeNull();
      await expect(repository.getFileInfo(path)).resolves.toBeNull();
    });

    it("getFileInfo cannot see another driver's file", async () => {
      const path = pathFor(otherDriver, "png");
      await serviceClient().storage.from(DOCUMENTS_BUCKET).upload(path, TEST_FILES.png());
      await expect(repository.getFileInfo(path)).resolves.toBeNull();
      await expect(otherRepository.getFileInfo(path)).resolves.not.toBeNull();
    });

    it("createSignedUrl gives a working link to an own file", async () => {
      const path = pathFor(driver, "pdf");
      await serviceClient().storage.from(DOCUMENTS_BUCKET).upload(path, TEST_FILES.pdf());

      const url = await repository.createSignedUrl(path, 60);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("%PDF");
    });

    it("createSignedUrl is NOT_FOUND for a missing file or another driver's file", async () => {
      const missing = await expectAppError(repository.createSignedUrl(pathFor(driver, "png"), 60));
      expect(missing.code).toBe("NOT_FOUND");

      const foreignPath = pathFor(otherDriver, "png");
      await serviceClient().storage.from(DOCUMENTS_BUCKET).upload(foreignPath, TEST_FILES.png());
      const foreign = await expectAppError(repository.createSignedUrl(foreignPath, 60));
      expect(foreign.code).toBe("NOT_FOUND");
    });

    it("removeFile deletes an own file and leaves others alone", async () => {
      const ownPath = pathFor(driver, "png");
      const foreignPath = pathFor(otherDriver, "png");
      const bucket = serviceClient().storage.from(DOCUMENTS_BUCKET);
      await bucket.upload(ownPath, TEST_FILES.png());
      await bucket.upload(foreignPath, TEST_FILES.png());

      await repository.removeFile(ownPath);
      await repository.removeFile(foreignPath);

      expect((await bucket.download(ownPath)).error).not.toBeNull();
      expect((await bucket.download(foreignPath)).error).toBeNull();
    });
  });

  describe("records", () => {
    const input = (owner: TestDriver, overrides: Record<string, unknown> = {}) => ({
      driverId: owner.driverId,
      type: "cdl_front" as const,
      storagePath: pathFor(owner, "jpg"),
      fileName: "front.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 250_000,
      ...overrides,
    });

    it("create, findById and listByDriverId (newest first)", async () => {
      const first = await repository.create(input(driver, { fileName: "first.jpg" }));
      const second = await repository.create(
        input(driver, { type: "medical_card", fileName: "second.jpg" }),
      );
      expect(first).toMatchObject({
        driverId: driver.driverId,
        type: "cdl_front",
        fileName: "first.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 250_000,
      });

      await expect(repository.findById(first.id)).resolves.toEqual(first);

      const list = await repository.listByDriverId(driver.driverId);
      expect(list.map((document) => document.id)).toEqual([second.id, first.id]);
    });

    it("findById returns null for an unknown id and for another driver's document", async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();

      const foreign = await otherRepository.create(input(otherDriver));
      await expect(repository.findById(foreign.id)).resolves.toBeNull();
      await expect(repository.listByDriverId(otherDriver.driverId)).resolves.toEqual([]);
    });

    it("create maps a duplicate storage path to CONFLICT", async () => {
      const row = input(driver);
      await repository.create(row);
      const error = await expectAppError(repository.create(row));
      expect(error.code).toBe("CONFLICT");
    });

    it("create is FORBIDDEN for another driver's card", async () => {
      const error = await expectAppError(repository.create(input(otherDriver)));
      expect(error.code).toBe("FORBIDDEN");
    });

    it("create maps an oversize file to VALIDATION", async () => {
      const error = await expectAppError(
        repository.create(input(driver, { sizeBytes: 10 * 1024 * 1024 + 1 })),
      );
      expect(error.code).toBe("VALIDATION");
    });

    it("create refuses a sixth certification document until one is deleted", async () => {
      const certificate = () =>
        input(driver, { type: "certification" as const, storagePath: pathFor(driver, "pdf") });
      const kept = [];
      for (let index = 0; index < 5; index += 1) kept.push(await repository.create(certificate()));

      const error = await expectAppError(repository.create(certificate()));
      expect(error.code).toBe("VALIDATION");

      // Other types are not limited, and a delete frees a slot.
      await expect(repository.create(input(driver, { type: "other" }))).resolves.toBeDefined();
      await repository.delete(kept[0].id);
      await expect(repository.create(certificate())).resolves.toBeDefined();
    });

    it("delete removes an own record", async () => {
      const document = await repository.create(input(driver));
      await repository.delete(document.id);
      await expect(repository.findById(document.id)).resolves.toBeNull();
    });

    it("delete is NOT_FOUND for an unknown id and for another driver's document", async () => {
      expect((await expectAppError(repository.delete(randomUUID()))).code).toBe("NOT_FOUND");

      const foreign = await otherRepository.create(input(otherDriver));
      expect((await expectAppError(repository.delete(foreign.id))).code).toBe("NOT_FOUND");
      await expect(otherRepository.findById(foreign.id)).resolves.not.toBeNull();
    });
  });
});
