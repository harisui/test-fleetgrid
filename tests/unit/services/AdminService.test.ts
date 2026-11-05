// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import type { DocumentType as DriverDocumentType } from "@/types/domain";
import { AppError } from "@/server/errors/AppError";
import type { DriverReviewRow } from "@/server/repositories/AdminRepository";
import { AdminService } from "@/server/services/AdminService";
import { FakeAdminRepository } from "../../fakes/FakeAdminRepository";
import { FakeDocumentRepository } from "../../fakes/FakeDocumentRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeQrLinkRepository } from "../../fakes/FakeQrRepositories";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import {
  buildDocument,
  buildDriver,
  buildProfile,
  CARRIER_USER_ID,
  OTHER_USER_ID,
  PLACES,
  USER_ID,
} from "../../setup/factories";

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_PHONE = "+15555550102";
const THIRD_USER_ID = "55555555-5555-4555-8555-555555555555";
const D1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const D3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** No such driver. */
const D9 = "99999999-9999-4999-8999-999999999999";
/** A Tuesday, 10:00 in Houston (15:00 UTC). */
const NOW = new Date("2026-10-27T15:00:00.000Z");
const QR_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const QR_LINK = {
  id: QR_ID,
  slug: "loves-hwy-225",
  locationName: "Love's, Hwy 225",
  campaign: "pasadena-225",
  targetPath: "/",
  utmSource: "flyer",
  utmMedium: "qr",
  isActive: true,
  createdBy: ADMIN_ID,
  createdAt: "2026-10-20T12:00:00.000Z",
  updatedAt: "2026-10-20T12:00:00.000Z",
};
const FROM_QR = {
  utmSource: "flyer",
  utmMedium: "qr",
  utmCampaign: "pasadena-225",
  utmContent: "loves-hwy-225",
  referrer: null,
  landingPath: "/",
  qrLinkId: QR_ID,
};
const FROM_FACEBOOK = {
  utmSource: "facebook",
  utmMedium: "social",
  utmCampaign: "fb-october",
  utmContent: null,
  referrer: "https://l.facebook.com/",
  landingPath: "/drivers",
  qrLinkId: null,
};

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

/** The three documents Roster-Ready needs (CR-5), as rows and stored files. */
function giveDocuments(
  documents: FakeDocumentRepository,
  driverId: string,
  types: readonly DriverDocumentType[] = ["cdl_front", "cdl_back", "medical_card"],
) {
  for (const type of types) {
    const document = buildDocument({
      id: `${driverId.slice(0, 8)}-${type}`,
      driverId,
      type,
      storagePath: `${driverId}/${type}.jpg`,
    });
    documents.rows.set(document.id, document);
    documents.files.set(document.storagePath, { size: 1000, mimeType: "image/jpeg" } as never);
  }
}

describe("AdminService", () => {
  let admin: FakeAdminRepository;
  let profiles: FakeProfileRepository;
  let documents: FakeDocumentRepository;
  let service: AdminService;

  const pending = buildProfile({ id: USER_ID, status: "pending", source: FROM_QR });
  const approved = buildProfile({ id: OTHER_USER_ID, phone: "+15555550108", status: "approved", source: FROM_FACEBOOK });
  const lead = buildProfile({ id: THIRD_USER_ID, phone: "+15555550109", status: "pending" });

  const rows = (): DriverReviewRow[] => [
    {
      driver: buildDriver({
        id: D1,
        profileId: USER_ID,
        fullName: "Pat Driver",
        city: PLACES.houston.city,
        zip: PLACES.houston.zip,
        lat: PLACES.houston.lat,
        lng: PLACES.houston.lng,
        createdAt: "2026-10-27T14:00:00.000Z", // today, 9:00 Houston
      }),
      profile: pending,
    },
    {
      driver: buildDriver({
        id: D2,
        profileId: OTHER_USER_ID,
        fullName: "Dallas Driver",
        city: PLACES.dallas.city,
        zip: PLACES.dallas.zip,
        lat: PLACES.dallas.lat,
        lng: PLACES.dallas.lng,
        createdAt: "2026-10-26T20:00:00.000Z", // Monday afternoon Houston: this week, not today
      }),
      profile: approved,
    },
    {
      // A lead: name only, no ZIP yet, card not finished.
      driver: buildDriver({
        id: D3,
        profileId: THIRD_USER_ID,
        fullName: "Lee Lead",
        zip: null,
        city: null,
        lat: null,
        lng: null,
        cardCompleted: false,
        smsOptIn: false,
        createdAt: "2026-10-20T12:00:00.000Z", // last week
      }),
      profile: lead,
    },
  ];

  beforeEach(() => {
    profiles = new FakeProfileRepository([
      buildProfile({ id: ADMIN_ID, role: "admin", phone: ADMIN_PHONE, status: "approved" }),
      buildProfile({ id: CARRIER_USER_ID, role: "carrier", phone: "+15555550101" }),
      pending,
      approved,
      lead,
    ]);
    admin = new FakeAdminRepository(rows(), profiles);
    documents = new FakeDocumentRepository();
    service = new AdminService(
      admin,
      profiles,
      new FakeServiceAreaRepository(),
      documents,
      new FakeQrLinkRepository([QR_LINK]),
      () => NOW,
    );
  });

  it("is for admins only", async () => {
    for (const who of [USER_ID, CARRIER_USER_ID, "nobody"]) {
      expect((await expectAppError(service.getDriversPage(who, {}))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.getDriver(who, { driverId: D1 }))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.approveDriver(who, { driverId: D1 }))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.getDocumentUrl(who, { documentId: "x" }))).code).toBe("FORBIDDEN");
    }
    expect(admin.statusChanges).toEqual([]);
    expect(admin.audit).toEqual([]);
  });

  describe("getDriversPage", () => {
    it("filters by CDL state: Texas, another state, not answered (CR-5)", async () => {
      admin.rows[1].driver = { ...admin.rows[1].driver, cdlState: "LA" };
      admin.rows[2].driver = { ...admin.rows[2].driver, cdlState: null };
      const ids = async (cdl: string) => (await service.getDriversPage(ADMIN_ID, { cdl })).rows.map((row) => row.driver.id);
      expect(await ids("tx")).toEqual([D1]);
      expect(await ids("other")).toEqual([D2]);
      expect(await ids("none")).toEqual([D3]);
      expect((await ids("")).sort()).toEqual([D1, D2, D3].sort());
      expect((await service.getDriversPage(ADMIN_ID, { cdl: "nonsense" })).query.cdl).toBe("");
    });

    it("counts the tiles over every driver, with today and this week in Houston time", async () => {
      const page = await service.getDriversPage(ADMIN_ID, {});
      expect(page.tiles).toEqual({
        total: 3,
        pending: 2,
        approved: 1,
        blocked: 0,
        incomplete: 1,
        missingDocuments: 2,
        remindersSent: 0,
        today: 1,
        thisWeek: 2,
      });
    });

    describe("documents (CR-5)", () => {
      const allThree = (driverId: string) =>
        (["cdl_front", "cdl_back", "medical_card"] as const).map((type) => ({ driverId, type }));

      it("counts Registered drivers missing a document, not an approved row or one with them all", async () => {
        admin.requiredDocuments = allThree(D1);
        const { tiles, rows: listed } = await service.getDriversPage(ADMIN_ID, {});
        expect(tiles.missingDocuments).toBe(1);
        expect(listed.find((row) => row.driver.id === D1)?.missingDocuments).toEqual([]);
        expect(listed.find((row) => row.driver.id === D3)?.missingDocuments).toEqual(["cdl_front", "cdl_back", "medical_card"]);
      });

      it("counts the reminders of the last 7 days only", async () => {
        const at = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
        admin.reminderTimes = [at(1), at(6.9), at(7.1), at(30)];
        expect((await service.getDriversPage(ADMIN_ID, {})).tiles.remindersSent).toBe(2);
      });

      it("filters by what is missing, among Registered drivers only", async () => {
        admin.requiredDocuments = [
          { driverId: D1, type: "cdl_front" },
          { driverId: D1, type: "cdl_back" },
          { driverId: D3, type: "medical_card" },
        ];
        const names = async (query: Record<string, string>) =>
          (await service.getDriversPage(ADMIN_ID, query)).rows.map((row) => row.driver.fullName).sort();
        expect(await names({ docs: "any" })).toEqual(["Lee Lead", "Pat Driver"]);
        expect(await names({ docs: "cdl" })).toEqual(["Lee Lead"]);
        expect(await names({ docs: "medical" })).toEqual(["Pat Driver"]);
        // Dallas Driver has none on file but is not Registered, so never in these lists.
        expect(await names({ docs: "nonsense" })).toEqual(["Dallas Driver", "Lee Lead", "Pat Driver"]);
      });

      it("the grace period: what is missing, the tile and the filter, for an approved driver only until it ends", async () => {
        const row = admin.rows.find((item) => item.driver.id === D2)!;
        row.driver = { ...row.driver, rosterGraceUntil: new Date(NOW.getTime() + 86_400_000).toISOString(), cdlState: null };
        let page = await service.getDriversPage(ADMIN_ID, { docs: "update" });
        expect(page.rows.map((item) => item.driver.id)).toEqual([D2]);
        expect(page.rows[0]!.needsUpdate).toEqual(["cdl_front", "cdl_back", "medical_card", "cdl_state"]);
        expect(page.tiles.missingDocuments).toBe(3);

        row.driver = { ...row.driver, rosterGraceUntil: new Date(NOW.getTime() - 1000).toISOString() };
        page = await service.getDriversPage(ADMIN_ID, { docs: "update" });
        expect(page.rows).toEqual([]);
      });

      it("filters by re-review needed", async () => {
        admin.rows[0]!.driver = { ...admin.rows[0]!.driver, rereviewNeeded: true };
        const page = await service.getDriversPage(ADMIN_ID, { rereview: "yes" });
        expect(page.rows.map((row) => row.driver.id)).toEqual([admin.rows[0]!.driver.id]);
      });

      it("the detail carries the driver's own missing documents", async () => {
        await documents.create({ driverId: D1, type: "cdl_front", storagePath: `${D1}/a.png`, fileName: "a.png", mimeType: "image/png", sizeBytes: 10 });
        const detail = await service.getDriver(ADMIN_ID, { driverId: D1 });
        expect(detail.missingDocuments).toEqual(["cdl_back", "medical_card"]);
      });
    });

    it("lists newest first with the area and the card state, and reports the query it applied", async () => {
      const page = await service.getDriversPage(ADMIN_ID, {});
      expect(page.rows.map((row) => [row.driver.fullName, row.inServiceArea, row.complete])).toEqual([
        ["Pat Driver", true, true],
        ["Dallas Driver", false, true],
        ["Lee Lead", null, false],
      ]);
      expect(page).toMatchObject({ total: 3, page: 1, pageSize: ADMIN_PAGE_SIZE });
      expect(page.query).toEqual({
        status: "",
        complete: "",
        area: "",
        source: "",
        selfReport: "",
        cdl: "",
        docs: "",
        rereview: "",
        twic: "",
        qr: undefined,
        q: "",
        sort: "created",
        dir: "desc",
        page: 1,
        open: undefined,
      });
      expect(page.qrLink).toBeNull();
    });

    it("names the QR code or the campaign each driver came by, and can narrow the list to one code", async () => {
      const page = await service.getDriversPage(ADMIN_ID, {});
      expect(page.rows.map((row) => row.source)).toEqual([
        { kind: "qr", label: "QR: Love's, Hwy 225", qrLinkId: QR_ID },
        { kind: "campaign", label: "Campaign: fb-october", qrLinkId: null },
        { kind: "direct", label: "Direct or unknown", qrLinkId: null },
      ]);
      const names = async (input: Record<string, string>) =>
        (await service.getDriversPage(ADMIN_ID, input)).rows.map((row) => row.driver.fullName);
      expect(await names({ source: "qr" })).toEqual(["Pat Driver"]);
      expect(await names({ source: "campaign" })).toEqual(["Dallas Driver"]);
      expect(await names({ source: "direct" })).toEqual(["Lee Lead"]);
      expect(await names({ source: "tv" })).toEqual(["Pat Driver", "Dallas Driver", "Lee Lead"]);

      const narrowed = await service.getDriversPage(ADMIN_ID, { qr: QR_ID });
      expect(narrowed.rows.map((row) => row.driver.fullName)).toEqual(["Pat Driver"]);
      expect(narrowed.qrLink).toEqual(QR_LINK);
      // An unknown code matches nobody; a non-id is ignored.
      expect(await names({ qr: "99999999-9999-4999-8999-999999999999" })).toEqual([]);
      expect(await names({ qr: "not-an-id" })).toEqual(["Pat Driver", "Dallas Driver", "Lee Lead"]);
    });

    it("counts a code that no longer exists as its campaign", async () => {
      admin.rows[0].profile = { ...pending, source: { ...FROM_QR, qrLinkId: "99999999-9999-4999-8999-999999999999" } };
      const page = await service.getDriversPage(ADMIN_ID, {});
      expect(page.rows[0].source).toEqual({ kind: "campaign", label: "Campaign: pasadena-225", qrLinkId: null });
    });

    it("filters by the self-reported Clearinghouse and SAP answer: given, or not answered", async () => {
      admin.rows[1].driver = { ...admin.rows[1].driver, clearinghouseSelfReportedAt: "2026-10-29T15:00:00.000Z" };
      const names = async (input: Record<string, string>) =>
        (await service.getDriversPage(ADMIN_ID, input)).rows.map((row) => row.driver.fullName);
      expect(await names({ selfReport: "yes" })).toEqual(["Dallas Driver"]);
      expect(await names({ selfReport: "none" })).toEqual(["Pat Driver", "Lee Lead"]);
      expect(await names({ selfReport: "clean" })).toEqual(["Pat Driver", "Dallas Driver", "Lee Lead"]);
    });

    it("filters by review status, card state and area", async () => {
      const names = async (input: Record<string, string>) =>
        (await service.getDriversPage(ADMIN_ID, input)).rows.map((row) => row.driver.fullName);
      expect(await names({ status: "pending" })).toEqual(["Pat Driver", "Lee Lead"]);
      expect(await names({ status: "approved" })).toEqual(["Dallas Driver"]);
      expect(await names({ status: "blocked" })).toEqual([]);
      expect(await names({ complete: "incomplete" })).toEqual(["Lee Lead"]);
      expect(await names({ complete: "complete" })).toEqual(["Pat Driver", "Dallas Driver"]);
      expect(await names({ area: "in" })).toEqual(["Pat Driver"]);
      expect(await names({ area: "out" })).toEqual(["Dallas Driver"]);
      expect(await names({ status: "pending", complete: "complete", area: "in" })).toEqual(["Pat Driver"]);
    });

    it("searches by name, by phone digits and by ZIP", async () => {
      const names = async (q: string) =>
        (await service.getDriversPage(ADMIN_ID, { q })).rows.map((row) => row.driver.fullName);
      expect(await names("pat")).toEqual(["Pat Driver"]);
      expect(await names("DRIVER")).toEqual(["Pat Driver", "Dallas Driver"]);
      expect(await names("(555) 555-0108")).toEqual(["Dallas Driver"]);
      expect(await names("0109")).toEqual(["Lee Lead"]);
      expect(await names("752")).toEqual(["Dallas Driver"]);
      expect(await names("nobody")).toEqual([]);
    });

    it("sorts by name or status in either direction, and pages", async () => {
      const names = async (input: Record<string, string>) =>
        (await service.getDriversPage(ADMIN_ID, input)).rows.map((row) => row.driver.fullName);
      expect(await names({ sort: "name", dir: "asc" })).toEqual(["Dallas Driver", "Lee Lead", "Pat Driver"]);
      expect(await names({ sort: "name", dir: "desc" })).toEqual(["Pat Driver", "Lee Lead", "Dallas Driver"]);
      expect(await names({ sort: "status", dir: "asc" })).toEqual(["Pat Driver", "Lee Lead", "Dallas Driver"]);
      expect(await names({ sort: "created", dir: "asc" })).toEqual(["Lee Lead", "Dallas Driver", "Pat Driver"]);

      for (let n = 0; n < ADMIN_PAGE_SIZE; n += 1) {
        admin.rows.push({
          driver: buildDriver({ id: `x${n}`, profileId: `p${n}`, fullName: `Extra ${n}`, createdAt: `2026-09-01T00:00:${String(n).padStart(2, "0")}.000Z` }),
          profile: buildProfile({ id: `p${n}`, phone: `+1555555${String(1000 + n)}` }),
        });
      }
      const first = await service.getDriversPage(ADMIN_ID, {});
      expect(first.rows).toHaveLength(ADMIN_PAGE_SIZE);
      expect(first.total).toBe(ADMIN_PAGE_SIZE + 3);
      const second = await service.getDriversPage(ADMIN_ID, { page: "2" });
      expect(second.rows).toHaveLength(3);
      expect(second.page).toBe(2);
      // Past the end lands on the last page, unknown filter values fall back quietly.
      const beyond = await service.getDriversPage(ADMIN_ID, { page: "9", status: "weird", sort: "nope" });
      expect(beyond.page).toBe(2);
      expect(beyond.query).toMatchObject({ status: "", sort: "created" });
    });
  });

  describe("getDriver", () => {
    it("returns the driver with the area, the papers, the Roster-Ready review and the history", async () => {
      giveDocuments(documents, D1);
      await service.approveDriver(ADMIN_ID, { driverId: D1 });

      const detail = await service.getDriver(ADMIN_ID, { driverId: D1 });
      expect(detail.driver.fullName).toBe("Pat Driver");
      expect(detail.inServiceArea).toBe(true);
      expect(detail.complete).toBe(true);
      expect(detail.source).toEqual({ kind: "qr", label: "QR: Love's, Hwy 225", qrLinkId: QR_ID });
      expect(detail.documents.map((document) => document.type).sort()).toEqual(["cdl_back", "cdl_front", "medical_card"]);
      expect(detail.missing).toEqual([]);
      expect(detail.photos.map((photo) => [photo.type, photo.url])).toEqual([
        ["cdl_front", `https://storage.test/${D1}/cdl_front.jpg?expires=60`],
        ["cdl_back", `https://storage.test/${D1}/cdl_back.jpg?expires=60`],
        ["medical_card", `https://storage.test/${D1}/medical_card.jpg?expires=60`],
      ]);
      expect(detail.history).toHaveLength(1);
      expect(detail.history[0]).toMatchObject({
        action: "driver_approved",
        adminId: ADMIN_ID,
        adminPhone: ADMIN_PHONE,
        targetType: "driver",
        targetId: D1,
        detail: { from: "pending", to: "approved", name: "Pat Driver" },
      });
    });

    it("answers not found for an unknown driver and refuses a bad id", async () => {
      expect((await expectAppError(service.getDriver(ADMIN_ID, { driverId: D9 }))).code).toBe("NOT_FOUND");
      const bad = await expectAppError(service.getDriver(ADMIN_ID, { driverId: "" }));
      expect(bad.fieldErrors).toEqual({ driverId: "Driver not found" });
    });
  });

  describe("status changes", () => {
    it("marks Roster-Ready, blocks and moves to Registered, writing the audit log each time", async () => {
      giveDocuments(documents, D1);
      expect((await service.approveDriver(ADMIN_ID, { driverId: D1 })).status).toBe("approved");
      expect((await service.blockDriver(ADMIN_ID, { driverId: D1 })).status).toBe("blocked");
      expect((await service.reopenDriver(ADMIN_ID, { driverId: D1 })).status).toBe("pending");
      expect(admin.statusChanges.map((change) => change.status)).toEqual(["approved", "blocked", "pending"]);
      expect(admin.audit.map((entry) => [entry.action, entry.detail.from, entry.detail.to])).toEqual([
        ["driver_approved", "pending", "approved"],
        ["driver_blocked", "approved", "blocked"],
        ["driver_reopened", "blocked", "pending"],
      ]);
      expect(profiles.rows.get(USER_ID)?.status).toBe("pending");
    });

    it("tells the approval hook (the approved text) only on approval, with the driver's consent", async () => {
      const approvals: { driverId: string; smsOptIn: boolean }[] = [];
      const notifying = new AdminService(
        admin,
        profiles,
        new FakeServiceAreaRepository(),
        documents,
        new FakeQrLinkRepository([QR_LINK]),
        () => NOW,
        async (driver) => {
          approvals.push(driver);
          throw new Error("a failed text never fails the approval");
        },
      );
      giveDocuments(documents, D1);
      expect((await notifying.approveDriver(ADMIN_ID, { driverId: D1 })).status).toBe("approved");
      await notifying.blockDriver(ADMIN_ID, { driverId: D1 });
      await notifying.approveDriver(ADMIN_ID, { driverId: D2 });
      expect(approvals).toEqual([{ driverId: D1, smsOptIn: true }]);
    });

    it("does nothing, and logs nothing, when the status is already so", async () => {
      const same = await service.approveDriver(ADMIN_ID, { driverId: D2 });
      expect(same.status).toBe("approved");
      expect(admin.statusChanges).toEqual([]);
      expect(admin.audit).toEqual([]);
    });

    it("refuses to mark a driver whose card is not finished, with the checklist", async () => {
      giveDocuments(documents, D3);
      const error = await expectAppError(service.approveDriver(ADMIN_ID, { driverId: D3 }));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Not Roster-Ready yet: Profile not complete.");
      expect(admin.statusChanges).toEqual([]);
      // Blocking an unfinished card is allowed: a bot can be stopped at once.
      expect((await service.blockDriver(ADMIN_ID, { driverId: D3 })).status).toBe("blocked");
    });

    it("each requirement alone keeps a driver from Roster-Ready (CR-5)", async () => {
      const cases: [string, () => void, string][] = [
        ["CDL front", () => giveDocuments(documents, D1, ["cdl_back", "medical_card"]), "CDL front photo"],
        ["CDL back", () => giveDocuments(documents, D1, ["cdl_front", "medical_card"]), "CDL back photo"],
        ["medical card", () => giveDocuments(documents, D1, ["cdl_front", "cdl_back"]), "Medical card"],
        [
          "last name",
          () => {
            giveDocuments(documents, D1);
            admin.rows[0].driver = { ...admin.rows[0].driver, fullName: "Pat" };
          },
          "Last name missing",
        ],
      ];
      for (const [label, arrange, item] of cases) {
        documents.rows.clear();
        admin.rows[0].driver = { ...admin.rows[0].driver, fullName: "Pat Driver" };
        arrange();
        const error = await expectAppError(service.approveDriver(ADMIN_ID, { driverId: D1 }));
        expect(error.message, label).toBe(`Not Roster-Ready yet: ${item}.`);
      }
      expect(admin.statusChanges).toEqual([]);
    });

    it("a CDL from another state needs a typed reason, kept on the card and in the audit log", async () => {
      giveDocuments(documents, D1);
      admin.rows[0].driver = { ...admin.rows[0].driver, cdlState: "LA" };
      const missing = await expectAppError(service.approveDriver(ADMIN_ID, { driverId: D1 }));
      expect(missing.fieldErrors).toEqual({ overrideReason: expect.stringMatching(/at least 5 characters/) });
      const short = await expectAppError(service.approveDriver(ADMIN_ID, { driverId: D1, overrideReason: "ok" }));
      expect(short.fieldErrors).toEqual({ overrideReason: expect.any(String) });
      expect(admin.statusChanges).toEqual([]);

      await service.approveDriver(ADMIN_ID, { driverId: D1, overrideReason: "Moving to Houston, Texas CDL in progress" });
      expect(admin.overrides).toEqual([{ driverId: D1, reason: "Moving to Houston, Texas CDL in progress" }]);
      expect(admin.audit.at(-1)).toMatchObject({
        action: "driver_approved",
        detail: { cdlState: "LA", overrideReason: "Moving to Houston, Texas CDL in progress" },
      });
    });

    it("a Texas driver needs no reason, and any old override is cleared", async () => {
      giveDocuments(documents, D1);
      await service.approveDriver(ADMIN_ID, { driverId: D1, overrideReason: "Not needed here at all" });
      expect(admin.overrides).toEqual([{ driverId: D1, reason: null }]);
      expect(admin.audit.at(-1)?.detail).not.toHaveProperty("overrideReason");
    });

    it("lists what is missing in the detail, for the checklist", async () => {
      giveDocuments(documents, D1, ["cdl_front"]);
      admin.rows[0].driver = { ...admin.rows[0].driver, cdlState: null };
      const detail = await service.getDriver(ADMIN_ID, { driverId: D1 });
      expect(detail.missing).toEqual(["cdl_back", "medical_card", "cdl_state"]);
      expect(detail.photos.map((photo) => photo.url === null)).toEqual([false, true, true]);
    });

    it("refuses an unknown driver and a bad id", async () => {
      expect((await expectAppError(service.blockDriver(ADMIN_ID, { driverId: D9 }))).code).toBe("NOT_FOUND");
      const bad = await expectAppError(service.approveDriver(ADMIN_ID, { driverId: "x" }));
      expect(bad.fieldErrors).toEqual({ driverId: "Driver not found" });
    });
  });

  describe("getDocumentUrl", () => {
    it("logs the view before the link exists", async () => {
      const document = buildDocument({ driverId: D1, storagePath: `${D1}/v.png` });
      documents.rows.set(document.id, document);
      documents.files.set(document.storagePath, { sizeBytes: 10, mimeType: "image/png" });
      await service.getDocumentUrl(ADMIN_ID, { documentId: document.id });
      expect(documents.adminViews).toEqual([document.id]);
    });

    it("opening the sheet logs each photo it signs a link for", async () => {
      const document = await documents.create({ driverId: D1, type: "medical_card", storagePath: `${D1}/m.png`, fileName: "m.png", mimeType: "image/png", sizeBytes: 10 });
      await service.getDriver(ADMIN_ID, { driverId: D1 });
      expect(documents.adminViews).toContain(document.id);
    });

    it("makes a short-lived link to a driver's file", async () => {
      const document = buildDocument({ driverId: D1, storagePath: "d1/cdl.jpg" });
      documents.rows.set(document.id, document);
      documents.files.set(document.storagePath, { sizeBytes: 10, mimeType: "image/jpeg" });
      await expect(service.getDocumentUrl(ADMIN_ID, { documentId: document.id })).resolves.toBe(
        "https://storage.test/d1/cdl.jpg?expires=60",
      );
    });

    it("answers not found for an unknown document", async () => {
      expect(
        (await expectAppError(service.getDocumentUrl(ADMIN_ID, { documentId: "d0000000-0000-4000-8000-000000000009" }))).code,
      ).toBe("NOT_FOUND");
    });
  });
});
