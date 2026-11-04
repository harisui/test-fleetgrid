import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverDetailSheet } from "@/components/admin/DriverDetailSheet";
import { MissingDocumentsBadge } from "@/components/admin/MissingDocumentsBadge";
import { DriversTable } from "@/components/admin/DriversTable";
import { DriverTiles } from "@/components/admin/DriverTiles";
import { adminDriversQuerySchema } from "@/lib/validation/admin.schema";
import type { Result } from "@/server/errors/AppError";
import type { AdminDriverDetail, AdminDriverRow, AdminDriversPage } from "@/server/services/AdminService";
import { buildDocument, buildDriver, buildProfile, OTHER_USER_ID, USER_ID } from "../../setup/factories";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  approveDriverAction: vi.fn(),
  blockDriverAction: vi.fn(),
  reopenDriverAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

const opsActions = vi.hoisted(() => ({
  pauseDriverAction: vi.fn(async () => ({ ok: true as const, data: null })),
  unpauseDriverAction: vi.fn(async () => ({ ok: true as const, data: null })),
  removeAccountAction: vi.fn(async () => ({ ok: true as const, data: null })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/drivers" }));
vi.mock("@/server/actions/admin.actions", () => actions);
vi.mock("@/server/actions/admin-ops.actions", () => opsActions);
vi.mock("sonner", () => ({ toast }));
const reminderActions = vi.hoisted(() => ({
  previewDocReminderAction: vi.fn(),
  sendDocReminderAction: vi.fn(),
}));
vi.mock("@/server/actions/docReminder.actions", () => reminderActions);

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });

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
  createdBy: "admin",
  createdAt: "2026-10-20T12:00:00.000Z",
  updatedAt: "2026-10-20T12:00:00.000Z",
};

const row = (overrides: Partial<AdminDriverRow> = {}): AdminDriverRow => ({
  driver: buildDriver({ profileId: USER_ID, createdAt: "2026-10-27T14:00:00.000Z" }),
  profile: buildProfile({ id: USER_ID, status: "pending" }),
  inServiceArea: true,
  complete: true,
  source: { kind: "direct", label: "Direct or unknown", qrLinkId: null },
  missingDocuments: [],
  ...overrides,
});

const page = (overrides: Partial<AdminDriversPage> = {}): AdminDriversPage => ({
  tiles: { total: 2, pending: 1, approved: 1, blocked: 0, incomplete: 1, missingDocuments: 5, remindersSent: 6, today: 1, thisWeek: 2 },
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  query: adminDriversQuerySchema.parse({}),
  qrLink: null,
  ...overrides,
});

const detail = (overrides: Partial<AdminDriverDetail> = {}): AdminDriverDetail => ({
  ...row(),
  documents: [],
  history: [],
  missing: [],
  photos: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DriverTiles", () => {
  it("shows the seven counts", () => {
    render(<DriverTiles tiles={page().tiles} />);
    const grid = screen.getByRole("region", { name: "Driver counts" });
    for (const label of ["Total", "Registered", "Roster-Ready", "Blocked", "Incomplete", "Today", "This week"]) {
      expect(within(grid).getByText(label)).toBeInTheDocument();
    }
    // Registered, Roster-Ready, Incomplete and Today are each 1.
    expect(within(grid).getAllByText("1")).toHaveLength(4);
    expect(within(grid).getByText("Missing documents").parentElement).toHaveTextContent("5");
    expect(within(grid).getByText("Reminders sent").parentElement).toHaveTextContent("6");
  });
});

describe("MissingDocumentsBadge (CR-5)", () => {
  it.each([
    [["cdl_front"], "Missing: CDL"],
    [["cdl_front", "cdl_back"], "Missing: CDL"],
    [["medical_card"], "Missing: medical card"],
    [["cdl_back", "medical_card"], "Missing: CDL / medical card"],
  ] as const)("%j reads %s, with an icon as well as the word", (missing, label) => {
    render(<MissingDocumentsBadge status="pending" missing={missing} />);
    const badge = document.querySelector("[data-slot=missing-documents]");
    expect(badge).toHaveTextContent(label);
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("shows nothing when all are in, or for a driver who is not Registered", () => {
    const { rerender } = render(<MissingDocumentsBadge status="pending" missing={[]} />);
    expect(document.querySelector("[data-slot=missing-documents]")).toBeNull();
    rerender(<MissingDocumentsBadge status="blocked" missing={["cdl_front"]} />);
    expect(document.querySelector("[data-slot=missing-documents]")).toBeNull();
    rerender(<MissingDocumentsBadge status="approved" missing={["cdl_front"]} />);
    expect(document.querySelector("[data-slot=missing-documents]")).toBeNull();
  });

  it("appears on the list beside the status", () => {
    render(<DriversTable page={page({ rows: [row({ missingDocuments: ["medical_card"] })], total: 1 })} />);
    expect(screen.getAllByText("Missing: medical card").length).toBeGreaterThan(0);
  });
});

describe("DriversTable", () => {
  it("shows the CDL state, with the Not Texas CDL badge for any other state (CR-5)", () => {
    const louisiana = row({
      driver: buildDriver({ id: "d3", profileId: OTHER_USER_ID, fullName: "Lou Isiana", cdlState: "LA" }),
      profile: buildProfile({ id: OTHER_USER_ID, phone: "+15555550108", status: "pending" }),
    });
    const unanswered = row({
      driver: buildDriver({ id: "d4", profileId: "d4", fullName: "No State", cdlState: null }),
      profile: buildProfile({ id: "d4", phone: "+15555550109", status: "pending" }),
    });
    render(<DriversTable page={page({ rows: [row(), louisiana, unanswered], total: 3 })} />);
    const table = screen.getByRole("table", { name: "Drivers" });
    const rowOf = (name: string) => within(table).getByText(name).closest("tr") as HTMLElement;
    expect(rowOf("Lou Isiana")).toHaveTextContent("LANot Texas CDL");
    expect(within(rowOf("Lou Isiana")).getByText("Not Texas CDL").closest("[data-slot=not-texas]")).toHaveAttribute("data-variant", "warning");
    expect(rowOf("No State")).toHaveTextContent("Not answered");
    expect(rowOf("Pat Driver")).not.toHaveTextContent("Not Texas CDL");
    expect(screen.getByRole("combobox", { name: "CDL state" })).toBeInTheDocument();
  });


  it("lists each driver with the phone, the area, the card state and the review status, linking to the sheet", () => {
    const incomplete = row({
      driver: buildDriver({ id: "d2", profileId: OTHER_USER_ID, fullName: "Lee Lead", zip: null, city: null, lat: null, lng: null, cardCompleted: false, smsOptIn: false }),
      profile: buildProfile({ id: OTHER_USER_ID, phone: "+15555550108", status: "approved" }),
      inServiceArea: null,
      complete: false,
      source: { kind: "qr", label: "QR: Love's, Hwy 225", qrLinkId: QR_ID },
    });
    render(<DriversTable page={page({ rows: [row(), incomplete], total: 2 })} />);
    const table = screen.getByRole("table", { name: "Drivers" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent?.trim())).toEqual([
      "Driver",
      "Phone",
      "ZIP and city",
      "Area",
      "Class",
      "Endorsements",
      "Profile",
      "CDL state",
      "Status",
      "SMS",
      "Reminder sent",
      "Clearinghouse and SAP",
      "Source",
      "Signed up",
    ]);
    const first = within(table).getByRole("link", { name: "Pat Driver" });
    expect(first).toHaveAttribute("href", "/admin/drivers?open=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const firstRow = first.closest("tr")!;
    expect(within(firstRow).getByText("(555) 555-0100")).toHaveClass("font-mono");
    expect(within(firstRow).getByText("75201 Dallas")).toBeInTheDocument();
    expect(within(firstRow).getByText("In area")).toBeInTheDocument();
    expect(within(firstRow).getByText("Complete")).toBeInTheDocument();
    expect(within(firstRow).getByText("Registered")).toHaveAttribute("data-status", "pending");
    expect(within(firstRow).getByText("Yes")).toBeInTheDocument();
    expect(within(firstRow).getByText("Direct or unknown")).toBeInTheDocument();
    expect(within(firstRow).getByText("Oct 27, 2026")).toBeInTheDocument();

    const secondRow = within(table).getByRole("link", { name: "Lee Lead" }).closest("tr")!;
    expect(within(secondRow).getByText("Not yet")).toBeInTheDocument();
    expect(within(secondRow).getByText("Unknown")).toBeInTheDocument();
    expect(within(secondRow).getByText("Incomplete")).toHaveAttribute("data-status", "incomplete");
    expect(within(secondRow).getByText("No")).toBeInTheDocument();
    expect(within(secondRow).getByText("QR: Love's, Hwy 225")).toBeInTheDocument();
    // The admin sees the full number in the list (user decision of 2026-10-28); carriers never do.
    expect(within(secondRow).getByText("(555) 555-0108")).toBeInTheDocument();
  });

  it("narrowed to one QR code: the chip names it, no select for it, and the forms carry it", () => {
    const query = adminDriversQuerySchema.parse({ qr: QR_ID, status: "pending" });
    render(<DriversTable page={page({ rows: [row()], total: 1, query, qrLink: QR_LINK })} />);
    expect(screen.getByRole("link", { name: /^QR code: Love's, Hwy 225/ })).toHaveAttribute(
      "href",
      "/admin/drivers?sort=created&dir=desc&status=pending",
    );
    expect(screen.getByRole("link", { name: /^Status: Registered/ })).toHaveAttribute(
      "href",
      `/admin/drivers?sort=created&dir=desc&qr=${QR_ID}`,
    );
    expect(screen.queryByRole("combobox", { name: "QR code" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Source" })).toBeInTheDocument();
    const form = screen.getAllByRole("form", { name: "Filters" })[0];
    expect(form.querySelector("input[name=qr]")).toHaveAttribute("value", QR_ID);
    expect(screen.getByRole("link", { name: "Pat Driver" })).toHaveAttribute(
      "href",
      `/admin/drivers?status=pending&qr=${QR_ID}&open=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    );
  });

  it("shows the self-report badge in its column and on the phone card: neutral, with the shield, never the word Clean", () => {
    const reported = row({ driver: buildDriver({ profileId: USER_ID, clearinghouseSelfReportedAt: "2026-10-29T15:00:00.000Z" }) });
    const silent = row({
      driver: buildDriver({ id: "d2", profileId: OTHER_USER_ID, fullName: "Lee Lead" }),
      profile: buildProfile({ id: OTHER_USER_ID, phone: "+15555550108" }),
    });
    render(<DriversTable page={page({ rows: [reported, silent], total: 2 })} />);
    const table = screen.getByRole("table", { name: "Drivers" });
    const badge = within(within(table).getByRole("link", { name: "Pat Driver" }).closest("tr")!).getByText(
      "Self-reported: No Clearinghouse / No SAP",
    );
    expect(badge).toHaveAttribute("data-variant", "secondary");
    expect(badge.querySelector("svg")).toHaveClass("lucide-shield-check");
    expect(within(within(table).getByRole("link", { name: "Lee Lead" }).closest("tr")!).getByText("Not answered")).toBeInTheDocument();
    const cards = screen.getByRole("list", { name: "Drivers" });
    expect(within(cards).getAllByText("Self-reported: No Clearinghouse / No SAP")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/\bclean\b/i);
    // The filter is in the bar, and a chip names it when it is on.
    expect(screen.getAllByText("Clearinghouse and SAP").length).toBeGreaterThan(0);
  });

  it("keeps the filters, the sort and the page in every link", () => {
    const query = adminDriversQuerySchema.parse({ q: "pat", status: "pending", sort: "name", dir: "asc", page: "2" });
    render(<DriversTable page={page({ rows: [row()], total: 30, page: 2, query })} />);
    expect(screen.getByRole("link", { name: "Pat Driver" })).toHaveAttribute(
      "href",
      "/admin/drivers?q=pat&status=pending&sort=name&dir=asc&page=2&open=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    const name = screen.getByRole("columnheader", { name: /Driver/ });
    expect(name).toHaveAttribute("aria-sort", "ascending");
    // The next direction is desc, the default, so the link leaves it out.
    expect(within(name).getByRole("link")).toHaveAttribute("href", "/admin/drivers?q=pat&status=pending&sort=name");
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/admin/drivers?q=pat&status=pending&sort=name&dir=asc");
    // The chip's name ends with the screen-reader "(remove)".
    expect(screen.getByRole("link", { name: /^Status: Registered/ })).toHaveAttribute("href", "/admin/drivers?sort=name&dir=asc&q=pat");
    const form = screen.getAllByRole("form", { name: "Filters" })[0];
    expect(form.querySelector("input[name=sort]")).toHaveAttribute("value", "name");
  });

  it("tells the admin when the filters match nothing, and when nobody has signed up", () => {
    const { unmount } = render(<DriversTable page={page({ query: adminDriversQuerySchema.parse({ q: "zzz" }) })} />);
    expect(screen.getByText("No drivers match these filters.")).toBeInTheDocument();
    unmount();
    render(<DriversTable page={page()} />);
    expect(screen.getByText("No drivers yet.")).toBeInTheDocument();
  });
});

describe("DriverDetailSheet", () => {
  it("stays closed without a driver", () => {
    render(<DriverDetailSheet detail={null} closeHref="/admin/drivers" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the full phone, the card, the papers through the admin link, the source and the history", () => {
    const document_ = buildDocument({ fileName: "cdl.jpg", sizeBytes: 2000 });
    render(
      <DriverDetailSheet
        detail={detail({
          documents: [document_],
          history: [
            {
              id: "h1",
              adminId: "admin",
              adminPhone: "+15555550102",
              action: "driver_approved",
              targetType: "driver",
              targetId: "d1",
              detail: {},
              createdAt: "2026-10-27T15:00:00.000Z",
            },
          ],
        })}
        closeHref="/admin/drivers"
      />,
    );
    const sheet = screen.getByRole("dialog", { name: "Pat Driver" });
    expect(within(sheet).getByText("Signed up October 27, 2026")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "(555) 555-0100" })).toHaveAttribute("href", "tel:+15555550100");
    const card = sheet.querySelector("[data-slot=driver-card]") as HTMLElement;
    for (const [label, value] of [
      ["CDL class", "Class A"],
      ["Experience", "6 to 10 years"],
      ["Endorsements", "H, T"],
      ["Travels", "Up to 50 miles"],
    ]) {
      expect(within(card).getByText(label).nextElementSibling).toHaveTextContent(value);
    }
    expect(within(sheet).getByRole("link", { name: /CDL \(front\)/ })).toHaveAttribute(
      "href",
      `/api/admin/documents/${document_.id}/url`,
    );
    const source = sheet.querySelector("[data-slot=source]") as HTMLElement;
    expect(within(source).getByText("Came by").nextElementSibling).toHaveTextContent("Direct or unknown");
    expect(within(source).getByText("Driver said").nextElementSibling).toHaveTextContent("Skipped the question");
    expect(within(source).queryByText("Tags")).not.toBeInTheDocument();
    const history = within(sheet).getByRole("list", { name: "History" });
    expect(within(history).getByRole("listitem")).toHaveTextContent(/Marked Roster-Ready by \(555\) 555-0102, Oct 27, 2026/);
    // A Registered driver with nothing missing: Mark Roster-Ready and Block, no Move to Registered.
    expect(within(sheet).getByRole("button", { name: "Mark Roster-Ready" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Block" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Move to Registered" })).not.toBeInTheDocument();
  });

  it("shows the self-report with its date and the note, or Not answered, never as a check", () => {
    const { unmount } = render(
      <DriverDetailSheet
        detail={detail({ driver: buildDriver({ clearinghouseSelfReportedAt: "2026-10-29T15:00:00.000Z" }) })}
        closeHref="/admin/drivers"
      />,
    );
    const answer = screen.getByRole("dialog").querySelector("[data-slot=self-report]") as HTMLElement;
    expect(within(answer).getByText("Self-reported: No Clearinghouse / No SAP")).toHaveAttribute("data-self-report", "yes");
    expect(answer).toHaveTextContent("Confirmed on October 29, 2026");
    expect(answer).toHaveTextContent("Self-reported by the driver. Carriers must run their own Clearinghouse query.");
    expect(answer.textContent).not.toMatch(/clean/i);
    // The profile's account answer is labelled apart.
    expect(within(screen.getByRole("dialog")).queryByText("Clearinghouse")).not.toBeInTheDocument();
    unmount();

    render(<DriverDetailSheet detail={detail()} closeHref="/admin/drivers" />);
    const none = screen.getByRole("dialog").querySelector("[data-slot=self-report]") as HTMLElement;
    expect(none).toHaveTextContent("Not answered");
    expect(none.querySelector("[data-self-report]")).toBeNull();
  });

  it("shows where a driver came from: the code, its campaign, the tags, the landing page and what they said", () => {
    render(
      <DriverDetailSheet
        detail={detail({
          driver: buildDriver({ heardFrom: "other", heardFromOther: "Radio ad" }),
          profile: buildProfile({
            id: USER_ID,
            source: {
              utmSource: "flyer",
              utmMedium: "qr",
              utmCampaign: "pasadena-225",
              utmContent: "loves-hwy-225",
              referrer: "https://www.google.com/search?q=cdl",
              landingPath: "/drivers",
              qrLinkId: QR_ID,
            },
          }),
          source: { kind: "qr", label: "QR: Love's, Hwy 225", qrLinkId: QR_ID },
        })}
        closeHref="/admin/drivers"
      />,
    );
    const source = screen.getByRole("dialog").querySelector("[data-slot=source]") as HTMLElement;
    for (const [label, value] of [
      ["Came by", "QR: Love's, Hwy 225"],
      ["Campaign", "pasadena-225"],
      ["Tags", "flyer / qr / loves-hwy-225"],
      ["Referrer", "www.google.com"],
      ["Landed on", "/drivers"],
      ["Driver said", "Other: Radio ad"],
    ]) {
      expect(within(source).getByText(label).nextElementSibling).toHaveTextContent(value);
    }
  });

  it("marks Roster-Ready after the dialog, with the toast and a refresh", async () => {
    actions.approveDriverAction.mockResolvedValue(ok(buildProfile({ status: "approved" })));
    render(<DriverDetailSheet detail={detail()} closeHref="/admin/drivers" />);
    await userEvent.click(screen.getByRole("button", { name: "Mark Roster-Ready" }));
    const dialog = await screen.findByRole("dialog", { name: "Mark Pat Driver Roster-Ready?" });
    expect(within(dialog).getByText(/Subscribed carriers can find Pat Driver from now on/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark Roster-Ready" }));
    await waitFor(() =>
      expect(actions.approveDriverAction).toHaveBeenCalledWith({ driverId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Roster-Ready\./));
    expect(router.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mark Pat Driver Roster-Ready?" })).not.toBeInTheDocument());
  });

  it("holds Mark Roster-Ready with the checklist of what is missing, and shows the three photos with the note", () => {
    render(
      <DriverDetailSheet
        detail={detail({
          missing: ["cdl_back", "medical_card"],
          photos: [
            { type: "cdl_front", document: buildDocument({ mimeType: "image/jpeg" }), url: "https://storage.test/front.jpg" },
            { type: "cdl_back", document: null, url: null },
            { type: "medical_card", document: null, url: null },
          ],
        })}
        closeHref="/admin/drivers"
      />,
    );
    const mark = screen.getByRole("button", { name: "Mark Roster-Ready" });
    expect(mark).toBeDisabled();
    expect(mark).toHaveAccessibleDescription("Missing: CDL back photo, Medical card.");
    const checklist = screen.getByRole("list", { name: "Roster-Ready checklist" });
    expect(within(checklist).getByText("CDL front photo").closest("li")).toHaveAttribute("data-done", "true");
    expect(within(checklist).getByText("CDL back photo").closest("li")).toHaveAttribute("data-done", "false");
    expect(screen.getByRole("img", { name: "CDL front" })).toHaveAttribute("src", "https://storage.test/front.jpg");
    expect(screen.getAllByText("Not uploaded")).toHaveLength(2);
    expect(screen.getByText("Check the name, state and expiry match the profile.")).toBeInTheDocument();
  });

  it("a CDL from another state needs the typed reason before Mark Roster-Ready, which carries it", async () => {
    actions.approveDriverAction.mockResolvedValue(ok(buildProfile({ status: "approved" })));
    render(
      <DriverDetailSheet
        detail={detail({ missing: ["cdl_state"], driver: buildDriver({ cdlState: "LA" }) })}
        closeHref="/admin/drivers"
      />,
    );
    const mark = screen.getByRole("button", { name: "Mark Roster-Ready" });
    expect(mark).toBeDisabled();
    expect(mark).toHaveAccessibleDescription("Type why a CDL from outside Texas is accepted.");
    await userEvent.type(screen.getByLabelText(/Roster-Ready with a LA CDL state/), "Moving to Houston soon");
    expect(mark).toBeEnabled();
    await userEvent.click(mark);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Mark Roster-Ready" }));
    await waitFor(() =>
      expect(actions.approveDriverAction).toHaveBeenCalledWith({
        driverId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        overrideReason: "Moving to Houston soon",
      }),
    );
  });

  it("shows Re-review needed when a Roster-Ready driver changed a document", () => {
    render(<DriverDetailSheet detail={detail({ driver: buildDriver({ rereviewNeeded: true }) })} closeHref="/admin/drivers" />);
    expect(screen.getByText("Re-review needed")).toBeInTheDocument();
  });

  it("shows the no-shows, pauses shift texts after a dialog, and removes only after REMOVE is typed", async () => {
    const base = detail();
    render(
      <DriverDetailSheet
        detail={{ ...base, driver: { ...base.driver, noShowCount: 2 } }}
        closeHref="/admin/drivers"
      />,
    );
    expect(document.querySelector("[data-slot=no-shows]")).toHaveTextContent("2 no-shows.");
    await userEvent.click(screen.getByRole("button", { name: "Pause shift texts" }));
    const dialog = await screen.findByRole("dialog", { name: "Pause shift texts for Pat Driver?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(opsActions.pauseDriverAction).toHaveBeenCalledWith({ driverId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    const remove = await screen.findByRole("dialog", { name: "Remove Pat Driver?" });
    const confirm = within(remove).getByRole("button", { name: "Remove for good" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(remove).getByLabelText("Type REMOVE to confirm"), "REMOVE");
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(opsActions.removeAccountAction).toHaveBeenCalledWith({ profileId: base.profile.id, confirm: "REMOVE" }),
    );
    expect(router.push).toHaveBeenCalledWith("/admin/drivers");
  });

  it("blocks after a destructive dialog that names the effect, and reports a refusal", async () => {
    actions.blockDriverAction.mockResolvedValue({
      ok: false,
      error: { code: "FORBIDDEN", message: "Only FleetGrid staff can do this" },
    });
    render(<DriverDetailSheet detail={detail()} closeHref="/admin/drivers" />);
    await userEvent.click(screen.getByRole("button", { name: "Block" }));
    const dialog = await screen.findByRole("dialog", { name: "Block Pat Driver?" });
    expect(within(dialog).getByText("Pat Driver will be signed out and hidden from carriers.")).toBeInTheDocument();
    const block = within(dialog).getByRole("button", { name: "Block" });
    expect(block).toHaveAttribute("data-variant", "destructive");
    await userEvent.click(block);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only FleetGrid staff can do this"));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("offers the documents reminder only when the page passes one (a Registered driver missing a document)", () => {
    const { rerender } = render(<DriverDetailSheet detail={detail()} closeHref="/admin/drivers" />);
    expect(screen.queryByRole("button", { name: "Send documents reminder" })).not.toBeInTheDocument();
    rerender(
      <DriverDetailSheet
        detail={detail()}
        closeHref="/admin/drivers"
        docReminder={{
          body: "FleetGrid: To start getting shift offers, please upload your medical card at fleetgridus.com/driver. Reply STOP to opt out.",
          characters: 121,
          segments: 1,
          count: 1,
          excluded: { optedOut: 0, noConsent: 0, recent: 0 },
          byItems: { "CDL photos": 0, "medical card": 1, "CDL photos and medical card": 0 },
          sendAfter: null,
          blocked: null,
          confirmPhrase: "SEND 1",
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Send documents reminder" })).toBeEnabled();
  });

  it("holds Mark Roster-Ready for an unfinished card and says why; Block stays available", () => {
    render(
      <DriverDetailSheet
        detail={detail({ complete: false, missing: ["profile"], driver: buildDriver({ cardCompleted: false }) })}
        closeHref="/admin/drivers"
      />,
    );
    const approve = screen.getByRole("button", { name: "Mark Roster-Ready" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription("Missing: Profile not complete.");
    expect(screen.getByRole("button", { name: "Block" })).toBeEnabled();
    expect(screen.getByText("Incomplete")).toHaveAttribute("data-status", "incomplete");
  });

  it("offers Move to Registered and Mark Roster-Ready to a blocked driver, and closes back to the list", async () => {
    actions.reopenDriverAction.mockResolvedValue(ok(buildProfile({ status: "pending" })));
    render(
      <DriverDetailSheet detail={detail({ profile: buildProfile({ status: "blocked" }) })} closeHref="/admin/drivers?status=blocked" />,
    );
    expect(screen.queryByRole("button", { name: "Block" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move to Registered" }));
    const dialog = await screen.findByRole("dialog", { name: "Move Pat Driver to Registered?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Move to Registered" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Registered. The driver is out of carrier search and gets no shift offers."),
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(router.push).toHaveBeenCalledWith("/admin/drivers?status=blocked");
  });
});
