import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverDetailSheet } from "@/components/admin/DriverDetailSheet";
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

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/drivers" }));
vi.mock("@/server/actions/admin.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

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
  ...overrides,
});

const page = (overrides: Partial<AdminDriversPage> = {}): AdminDriversPage => ({
  tiles: { total: 2, pending: 1, approved: 1, blocked: 0, incomplete: 1, today: 1, thisWeek: 2 },
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
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DriverTiles", () => {
  it("shows the seven counts", () => {
    render(<DriverTiles tiles={page().tiles} />);
    const grid = screen.getByRole("region", { name: "Driver counts" });
    for (const label of ["Total", "Pending", "Approved", "Blocked", "Incomplete", "Today", "This week"]) {
      expect(within(grid).getByText(label)).toBeInTheDocument();
    }
    // Pending, Approved, Incomplete and Today are each 1.
    expect(within(grid).getAllByText("1")).toHaveLength(4);
  });
});

describe("DriversTable", () => {
  it("lists each driver with the masked phone, the area, the card state and the review status, linking to the sheet", () => {
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
      "Review",
      "SMS",
      "Source",
      "Signed up",
    ]);
    const first = within(table).getByRole("link", { name: "Pat Driver" });
    expect(first).toHaveAttribute("href", "/admin/drivers?open=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const firstRow = first.closest("tr")!;
    expect(within(firstRow).getByText("(***) ***-0100")).toBeInTheDocument();
    expect(within(firstRow).getByText("75201 Dallas")).toBeInTheDocument();
    expect(within(firstRow).getByText("In area")).toBeInTheDocument();
    expect(within(firstRow).getByText("Complete")).toBeInTheDocument();
    expect(within(firstRow).getByText("Pending")).toHaveAttribute("data-status", "pending");
    expect(within(firstRow).getByText("Yes")).toBeInTheDocument();
    expect(within(firstRow).getByText("Direct or unknown")).toBeInTheDocument();
    expect(within(firstRow).getByText("Oct 27, 2026")).toBeInTheDocument();

    const secondRow = within(table).getByRole("link", { name: "Lee Lead" }).closest("tr")!;
    expect(within(secondRow).getByText("Not yet")).toBeInTheDocument();
    expect(within(secondRow).getByText("Unknown")).toBeInTheDocument();
    expect(within(secondRow).getByText("Incomplete")).toHaveAttribute("data-status", "incomplete");
    expect(within(secondRow).getByText("No")).toBeInTheDocument();
    expect(within(secondRow).getByText("QR: Love's, Hwy 225")).toBeInTheDocument();
    // Never the full number.
    expect(document.body.textContent).not.toMatch(/555-0100|555-0108/);
  });

  it("narrowed to one QR code: the chip names it, no select for it, and the forms carry it", () => {
    const query = adminDriversQuerySchema.parse({ qr: QR_ID, status: "pending" });
    render(<DriversTable page={page({ rows: [row()], total: 1, query, qrLink: QR_LINK })} />);
    expect(screen.getByRole("link", { name: /^QR code: Love's, Hwy 225/ })).toHaveAttribute(
      "href",
      "/admin/drivers?sort=created&dir=desc&status=pending",
    );
    expect(screen.getByRole("link", { name: /^Review: Pending/ })).toHaveAttribute(
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
    expect(screen.getByRole("link", { name: /^Review: Pending/ })).toHaveAttribute("href", "/admin/drivers?sort=name&dir=asc&q=pat");
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
    expect(within(history).getByRole("listitem")).toHaveTextContent(/Approved by \(555\) 555-0102, Oct 27, 2026/);
    // A pending driver: Approve and Block, no Set pending.
    expect(within(sheet).getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Block" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Set pending" })).not.toBeInTheDocument();
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

  it("approves after the dialog, with the toast and a refresh", async () => {
    actions.approveDriverAction.mockResolvedValue(ok(buildProfile({ status: "approved" })));
    render(<DriverDetailSheet detail={detail()} closeHref="/admin/drivers" />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve Pat Driver?" });
    expect(within(dialog).getByText("Subscribed carriers can find Pat Driver from now on.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(actions.approveDriverAction).toHaveBeenCalledWith({ driverId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Approved\./));
    expect(router.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Approve Pat Driver?" })).not.toBeInTheDocument());
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

  it("holds Approve for an unfinished card and says why; Block stays available", () => {
    render(<DriverDetailSheet detail={detail({ complete: false, driver: buildDriver({ cardCompleted: false }) })} closeHref="/admin/drivers" />);
    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription("This driver has not finished their card, so they cannot be approved yet.");
    expect(screen.getByRole("button", { name: "Block" })).toBeEnabled();
    expect(screen.getByText("Incomplete")).toHaveAttribute("data-status", "incomplete");
  });

  it("offers Set pending and Approve to a blocked driver, and closes back to the list", async () => {
    actions.reopenDriverAction.mockResolvedValue(ok(buildProfile({ status: "pending" })));
    render(
      <DriverDetailSheet detail={detail({ profile: buildProfile({ status: "blocked" }) })} closeHref="/admin/drivers?status=blocked" />,
    );
    expect(screen.queryByRole("button", { name: "Block" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set pending" }));
    const dialog = await screen.findByRole("dialog", { name: "Put Pat Driver back in review?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Set pending" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Back in the review queue."));

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(router.push).toHaveBeenCalledWith("/admin/drivers?status=blocked");
  });
});
