// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { AccountService } from "@/server/services/AccountService";
import type { SessionUser } from "@/types/domain";
import { FakeAccountRepository } from "../../fakes/FakeAccountRepository";
import { FakeAuthRepository } from "../../fakes/FakeAuthRepository";
import { FakeDocumentRepository } from "../../fakes/FakeDocumentRepository";
import { FakeDriverRepository } from "../../fakes/FakeDriverRepository";
import { buildDocument, buildDriver, DRIVER_ID, USER_ID } from "../../setup/factories";

const USER: SessionUser = { id: USER_ID, phone: "+15555550100" };

describe("AccountService", () => {
  let auth: FakeAuthRepository;
  let drivers: FakeDriverRepository;
  let documents: FakeDocumentRepository;
  let accounts: FakeAccountRepository;
  let built: number;
  let service: AccountService;

  beforeEach(() => {
    auth = new FakeAuthRepository();
    drivers = new FakeDriverRepository();
    documents = new FakeDocumentRepository();
    accounts = new FakeAccountRepository();
    built = 0;
    service = new AccountService(auth, drivers, documents, () => {
      built += 1;
      return accounts;
    });
    auth.currentUser = USER;
    auth.users.set(USER.phone, USER.id);
  });

  it("texts the deletion code to the signed-in number only", async () => {
    await expect(service.requestDeletionCode(USER)).resolves.toEqual({ phone: USER.phone });
    expect(auth.sentTo).toEqual([USER.phone]);
  });

  describe("deleteOwnAccount", () => {
    beforeEach(async () => {
      await service.requestDeletionCode(USER);
    });

    it("checks the code, removes the stored files, then the user, then ends the session", async () => {
      drivers.rows.set(USER_ID, buildDriver({ id: DRIVER_ID, profileId: USER_ID }));
      for (const [index, path] of [`${DRIVER_ID}/a.jpg`, `${DRIVER_ID}/b.pdf`].entries()) {
        const document = buildDocument({
          id: `d0000000-0000-4000-8000-00000000000${index + 1}`,
          driverId: DRIVER_ID,
          storagePath: path,
        });
        documents.rows.set(document.id, document);
        documents.files.set(path, { sizeBytes: 10, mimeType: "image/jpeg" });
      }

      await service.deleteOwnAccount(USER, { code: "123456" });

      expect(documents.files.size).toBe(0);
      expect(accounts.deleted).toEqual([USER_ID]);
      expect(auth.signOutCount).toBe(1);
      expect(auth.currentUser).toBeNull();
    });

    it("refuses a wrong code and touches nothing", async () => {
      drivers.rows.set(USER_ID, buildDriver({ id: DRIVER_ID, profileId: USER_ID }));
      const error = await service.deleteOwnAccount(USER, { code: "000000" }).catch((e) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).fieldErrors?.code).toMatch(/incorrect/);
      expect(accounts.deleted).toEqual([]);
      expect(built).toBe(0);
      expect(auth.currentUser).toEqual(USER);
    });

    it("refuses a malformed code before asking the auth provider", async () => {
      const error = await service.deleteOwnAccount(USER, { code: "12" }).catch((e) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION");
      expect(accounts.deleted).toEqual([]);
    });

    it("works for a user with no card yet, and only then builds the admin repository", async () => {
      await service.deleteOwnAccount(USER, { code: "123456" });
      expect(accounts.deleted).toEqual([USER_ID]);
      expect(built).toBe(1);
    });

    it("does not delete the user when a file cannot be removed", async () => {
      drivers.rows.set(USER_ID, buildDriver({ id: DRIVER_ID, profileId: USER_ID }));
      const document = buildDocument({ driverId: DRIVER_ID, storagePath: `${DRIVER_ID}/a.jpg` });
      documents.rows.set(document.id, document);
      documents.failNextRemoveWith = new Error("storage down");

      await expect(service.deleteOwnAccount(USER, { code: "123456" })).rejects.toThrow(
        "storage down",
      );
      expect(accounts.deleted).toEqual([]);
    });

    it("still succeeds when the sign-out fails because the user is already gone", async () => {
      auth.signOut = async () => {
        throw new Error("session gone");
      };
      await expect(service.deleteOwnAccount(USER, { code: "123456" })).resolves.toBeUndefined();
      expect(accounts.deleted).toEqual([USER_ID]);
    });
  });
});
