// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import { DocumentService } from "@/server/services/DocumentService";
import { FakeDocumentRepository } from "../../fakes/FakeDocumentRepository";
import { FakeDriverRepository } from "../../fakes/FakeDriverRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import {
  buildDocument,
  buildDriver,
  buildProfile,
  DRIVER_ID,
  OTHER_DRIVER_ID,
  OTHER_USER_ID,
  USER_ID,
} from "../../setup/factories";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const FILE_ID = "c0000000-0000-4000-8000-000000000001";
const OWN_PATH = `${DRIVER_ID}/${FILE_ID}.jpg`;

const uploadInput = (overrides: Record<string, unknown> = {}) => ({
  type: "cdl_front",
  fileName: "front.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 250_000,
  ...overrides,
});

describe("DocumentService", () => {
  let documents: FakeDocumentRepository;
  let drivers: FakeDriverRepository;
  let profiles: FakeProfileRepository;
  let service: DocumentService;

  beforeEach(() => {
    documents = new FakeDocumentRepository();
    drivers = new FakeDriverRepository([
      buildDriver(),
      buildDriver({ id: OTHER_DRIVER_ID, profileId: OTHER_USER_ID }),
    ]);
    profiles = new FakeProfileRepository([
      buildProfile(),
      buildProfile({ id: OTHER_USER_ID, phone: "+15555550103" }),
    ]);
    service = new DocumentService(documents, drivers, profiles, () => FILE_ID);
  });

  /** Simulates the browser finishing its upload to storage. */
  function storeFile(path = OWN_PATH, info = { sizeBytes: 250_000, mimeType: "image/jpeg" }) {
    documents.files.set(path, info);
  }

  describe("other papers limit", () => {
    const certificate = (index: number) =>
      buildDocument({
        id: `d0000000-0000-4000-8000-00000000010${index}`,
        driverId: DRIVER_ID,
        type: "certification",
        storagePath: `${DRIVER_ID}/c0000000-0000-4000-8000-00000000010${index}.pdf`,
      });

    function keepCertificates(count: number) {
      for (let index = 0; index < count; index += 1) {
        const document = certificate(index);
        documents.rows.set(document.id, document);
      }
    }

    it("issues a token for the fifth certificate but not the sixth", async () => {
      keepCertificates(4);
      await expect(
        service.prepareUpload(USER_ID, uploadInput({ type: "certification" })),
      ).resolves.toBeDefined();

      keepCertificates(5);
      const error = await expectAppError(
        service.prepareUpload(USER_ID, uploadInput({ type: "certification" })),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("You can add up to 5 other papers");
      expect(documents.issuedTokens).toHaveLength(1);
    });

    it("refuses to record a sixth certificate even when the file already arrived", async () => {
      keepCertificates(5);
      storeFile();
      const error = await expectAppError(
        service.confirmUpload(USER_ID, {
          type: "certification",
          fileName: "sixth.jpg",
          storagePath: OWN_PATH,
        }),
      );
      expect(error.code).toBe("VALIDATION");
      expect(documents.rows.size).toBe(5);
    });

    it("does not limit the other document types", async () => {
      keepCertificates(5);
      await expect(service.prepareUpload(USER_ID, uploadInput())).resolves.toBeDefined();
    });
  });

  describe("authorization", () => {
    it.each(["carrier", "admin"] as const)("rejects a %s on every method", async (role) => {
      profiles.rows.set(USER_ID, buildProfile({ role }));
      for (const call of [
        service.list(USER_ID),
        service.prepareUpload(USER_ID, uploadInput()),
        service.confirmUpload(USER_ID, { type: "other", fileName: "a.jpg", storagePath: OWN_PATH }),
        service.getPreviewUrl(USER_ID, { documentId: buildDocument().id }),
        service.delete(USER_ID, { documentId: buildDocument().id }),
      ]) {
        expect((await expectAppError(call)).code).toBe("FORBIDDEN");
      }
    });

    it("rejects a user without a profile and a blocked driver", async () => {
      expect((await expectAppError(service.list("nobody"))).code).toBe("FORBIDDEN");

      profiles.rows.set(USER_ID, buildProfile({ status: "blocked" }));
      const error = await expectAppError(service.list(USER_ID));
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toMatch(/blocked/);
    });

    it("a driver without a card has an empty list and cannot upload yet", async () => {
      drivers.rows.delete(USER_ID);
      await expect(service.list(USER_ID)).resolves.toEqual([]);

      const error = await expectAppError(service.prepareUpload(USER_ID, uploadInput()));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Save your basic details before uploading documents");
    });
  });

  describe("list", () => {
    it("returns only the driver's own documents, newest first", async () => {
      documents.rows.set("1", buildDocument({ id: "1", createdAt: "2026-10-01T10:00:00.000Z" }));
      documents.rows.set("2", buildDocument({ id: "2", createdAt: "2026-10-02T10:00:00.000Z" }));
      documents.rows.set("3", buildDocument({ id: "3", driverId: OTHER_DRIVER_ID }));

      const list = await service.list(USER_ID);
      expect(list.map((document) => document.id)).toEqual(["2", "1"]);
    });
  });

  describe("prepareUpload", () => {
    it("reserves a path in the driver's own folder and returns an upload token", async () => {
      const prepared = await service.prepareUpload(USER_ID, uploadInput());
      expect(prepared).toEqual({ storagePath: OWN_PATH, token: `token-for-${OWN_PATH}` });
    });

    it.each([
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["application/pdf", "pdf"],
    ])("uses the extension for %s", async (mimeType, extension) => {
      const prepared = await service.prepareUpload(USER_ID, uploadInput({ mimeType }));
      expect(prepared.storagePath).toBe(`${DRIVER_ID}/${FILE_ID}.${extension}`);
    });

    it("never uses the client's file name in the path", async () => {
      const prepared = await service.prepareUpload(
        USER_ID,
        uploadInput({ fileName: "../../etc/passwd.jpg" }),
      );
      expect(prepared.storagePath).toBe(OWN_PATH);
    });

    it.each([
      [{ mimeType: "image/gif" }, "mimeType"],
      [{ mimeType: "application/x-msdownload" }, "mimeType"],
      [{ sizeBytes: MAX_UPLOAD_BYTES + 1 }, "sizeBytes"],
      [{ sizeBytes: 0 }, "sizeBytes"],
      [{ type: "passport" }, "type"],
      [{ fileName: "" }, "fileName"],
    ])("rejects %j before issuing a token", async (overrides, field) => {
      const error = await expectAppError(service.prepareUpload(USER_ID, uploadInput(overrides)));
      expect(error.code).toBe("VALIDATION");
      expect(Object.keys(error.fieldErrors ?? {})).toEqual([field]);
      expect(documents.issuedTokens).toEqual([]);
    });

    it("generates a random id by default", async () => {
      const real = new DocumentService(documents, drivers, profiles);
      const a = await real.prepareUpload(USER_ID, uploadInput());
      const b = await real.prepareUpload(USER_ID, uploadInput());
      expect(a.storagePath).toMatch(new RegExp(`^${DRIVER_ID}/[0-9a-f-]{36}\\.jpg$`));
      expect(a.storagePath).not.toBe(b.storagePath);
    });
  });

  describe("confirmUpload", () => {
    const confirmInput = (overrides: Record<string, unknown> = {}) => ({
      type: "cdl_front",
      fileName: "front.jpg",
      storagePath: OWN_PATH,
      ...overrides,
    });

    it("records the document using the size and type that actually arrived", async () => {
      storeFile(OWN_PATH, { sizeBytes: 123_456, mimeType: "image/jpeg" });
      const document = await service.confirmUpload(USER_ID, confirmInput());
      expect(document).toMatchObject({
        driverId: DRIVER_ID,
        type: "cdl_front",
        storagePath: OWN_PATH,
        fileName: "front.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 123_456,
      });
      expect(await service.list(USER_ID)).toHaveLength(1);
    });

    it("rejects a path in another driver's folder", async () => {
      const foreign = `${OTHER_DRIVER_ID}/${FILE_ID}.jpg`;
      storeFile(foreign);
      const error = await expectAppError(
        service.confirmUpload(USER_ID, confirmInput({ storagePath: foreign })),
      );
      expect(error.code).toBe("FORBIDDEN");
      expect(documents.rows.size).toBe(0);
      // The other driver's file is left alone.
      expect(documents.files.has(foreign)).toBe(true);
    });

    it("rejects when no file was uploaded", async () => {
      const error = await expectAppError(service.confirmUpload(USER_ID, confirmInput()));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Upload did not finish. Please try again.");
    });

    it.each([
      [{ sizeBytes: MAX_UPLOAD_BYTES + 1, mimeType: "image/jpeg" }, "sizeBytes"],
      [{ sizeBytes: 0, mimeType: "image/jpeg" }, "sizeBytes"],
      [{ sizeBytes: 1000, mimeType: "text/html" }, "mimeType"],
      [{ sizeBytes: 1000, mimeType: "" }, "mimeType"],
    ])("removes a stored file that fails server validation (%j)", async (info, field) => {
      storeFile(OWN_PATH, info);
      const error = await expectAppError(service.confirmUpload(USER_ID, confirmInput()));
      expect(error.code).toBe("VALIDATION");
      expect(Object.keys(error.fieldErrors ?? {})).toEqual([field]);
      expect(documents.files.has(OWN_PATH)).toBe(false);
      expect(documents.rows.size).toBe(0);
    });

    it.each([
      [{ storagePath: "not-a-path" }, "storagePath"],
      [{ storagePath: `${DRIVER_ID}/../x.jpg` }, "storagePath"],
      [{ type: "passport" }, "type"],
      [{ fileName: "" }, "fileName"],
    ])("rejects malformed input %j", async (overrides, field) => {
      storeFile();
      const error = await expectAppError(service.confirmUpload(USER_ID, confirmInput(overrides)));
      expect(error.code).toBe("VALIDATION");
      expect(Object.keys(error.fieldErrors ?? {})).toEqual([field]);
    });

    it("confirming the same upload twice returns the first record", async () => {
      storeFile();
      const first = await service.confirmUpload(USER_ID, confirmInput());
      const second = await service.confirmUpload(USER_ID, confirmInput());
      expect(second).toEqual(first);
      expect(documents.rows.size).toBe(1);
      expect(documents.files.has(OWN_PATH)).toBe(true);
    });

    it("removes the file when the record cannot be saved", async () => {
      storeFile();
      documents.failNextCreateWith = AppError.internal(new Error("db down"));
      const error = await expectAppError(service.confirmUpload(USER_ID, confirmInput()));
      expect(error.code).toBe("INTERNAL");
      expect(documents.files.has(OWN_PATH)).toBe(false);
    });

    it("still reports the original error when cleanup also fails", async () => {
      storeFile();
      documents.failNextCreateWith = AppError.internal(new Error("db down"));
      documents.failNextRemoveWith = new Error("storage down");
      const error = await expectAppError(service.confirmUpload(USER_ID, confirmInput()));
      expect(error.code).toBe("INTERNAL");

      storeFile(OWN_PATH, { sizeBytes: 0, mimeType: "image/jpeg" });
      documents.failNextRemoveWith = new Error("storage down");
      const invalid = await expectAppError(service.confirmUpload(USER_ID, confirmInput()));
      expect(invalid.code).toBe("VALIDATION");
    });

    it("a conflict with no matching record is treated as a failure and cleaned up", async () => {
      storeFile();
      documents.failNextCreateWith = AppError.conflict();
      const error = await expectAppError(service.confirmUpload(USER_ID, confirmInput()));
      expect(error.code).toBe("CONFLICT");
      expect(documents.files.has(OWN_PATH)).toBe(false);
    });
  });

  describe("getPreviewUrl", () => {
    it("returns a 60 second signed URL for the driver's own document", async () => {
      const document = buildDocument();
      documents.rows.set(document.id, document);
      storeFile(document.storagePath);

      const url = await service.getPreviewUrl(USER_ID, { documentId: document.id });
      expect(url).toBe(`https://storage.test/${document.storagePath}?expires=60`);
    });

    it("answers NOT_FOUND for another driver's document", async () => {
      const foreign = buildDocument({
        driverId: OTHER_DRIVER_ID,
        storagePath: `${OTHER_DRIVER_ID}/${FILE_ID}.jpg`,
      });
      documents.rows.set(foreign.id, foreign);
      storeFile(foreign.storagePath);

      const error = await expectAppError(
        service.getPreviewUrl(USER_ID, { documentId: foreign.id }),
      );
      expect(error.code).toBe("NOT_FOUND");
    });

    it("answers NOT_FOUND for an unknown id and VALIDATION for a malformed one", async () => {
      const unknown = await expectAppError(
        service.getPreviewUrl(USER_ID, { documentId: "d0000000-0000-4000-8000-00000000ffff" }),
      );
      expect(unknown.code).toBe("NOT_FOUND");

      const malformed = await expectAppError(service.getPreviewUrl(USER_ID, { documentId: "1" }));
      expect(malformed.code).toBe("VALIDATION");
    });
  });

  describe("delete", () => {
    it("removes the file and the record", async () => {
      const document = buildDocument();
      documents.rows.set(document.id, document);
      storeFile(document.storagePath);

      await service.delete(USER_ID, { documentId: document.id });
      expect(documents.rows.size).toBe(0);
      expect(documents.files.size).toBe(0);
    });

    it("cannot delete another driver's document", async () => {
      const foreign = buildDocument({
        driverId: OTHER_DRIVER_ID,
        storagePath: `${OTHER_DRIVER_ID}/${FILE_ID}.jpg`,
      });
      documents.rows.set(foreign.id, foreign);
      storeFile(foreign.storagePath);

      const error = await expectAppError(service.delete(USER_ID, { documentId: foreign.id }));
      expect(error.code).toBe("NOT_FOUND");
      expect(documents.rows.has(foreign.id)).toBe(true);
      expect(documents.files.has(foreign.storagePath)).toBe(true);
    });

    it("keeps the record when the file cannot be removed", async () => {
      const document = buildDocument();
      documents.rows.set(document.id, document);
      storeFile(document.storagePath);
      documents.failNextRemoveWith = AppError.internal(new Error("storage down"));

      const error = await expectAppError(service.delete(USER_ID, { documentId: document.id }));
      expect(error.code).toBe("INTERNAL");
      expect(documents.rows.has(document.id)).toBe(true);
    });

    it("deleting twice answers NOT_FOUND the second time", async () => {
      const document = buildDocument();
      documents.rows.set(document.id, document);
      storeFile(document.storagePath);

      await service.delete(USER_ID, { documentId: document.id });
      const error = await expectAppError(service.delete(USER_ID, { documentId: document.id }));
      expect(error.code).toBe("NOT_FOUND");
    });
  });
});
