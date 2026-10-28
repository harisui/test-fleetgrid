import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateQrSheet } from "@/components/admin/GenerateQrSheet";
import { QrDetailSheet } from "@/components/admin/QrDetailSheet";
import { QrTable } from "@/components/admin/QrTable";
import { SignupTiles } from "@/components/admin/SignupTiles";
import { SourcesTable } from "@/components/admin/SourcesTable";
import type { Result } from "@/server/errors/AppError";
import type { QrLinkRow, SourceRow } from "@/server/services/AnalyticsService";
import type { QrLink } from "@/types/domain";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({ createQrLinkAction: vi.fn(), setQrLinkActiveAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/analytics" }));
vi.mock("@/server/actions/qr.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });

const link: QrLink = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
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

const qrRow = (overrides: Partial<QrLinkRow> = {}): QrLinkRow => ({
  link,
  shortLink: "https://fleetgridus.com/q/loves-hwy-225",
  scans7d: 12,
  scansAll: 40,
  signups: 6,
  conversionPercent: 15,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignupTiles", () => {
  it("shows the five counts with percentages", () => {
    render(<SignupTiles tiles={{ today: 3, thisWeek: 12, thisMonth: 40, completePercent: 64, smsPercent: null }} />);
    const grid = screen.getByRole("region", { name: "Sign-ups" });
    expect(within(grid).getByText("40")).toBeInTheDocument();
    expect(within(grid).getByText("64%")).toBeInTheDocument();
    expect(within(grid).getByText("0%")).toBeInTheDocument();
    expect(within(grid).getByText("SMS opt-in")).toBeInTheDocument();
  });
});

describe("SourcesTable", () => {
  const sources: SourceRow[] = [
    { kind: "qr", qrLinkId: link.id, label: "QR: Love's, Hwy 225", visits: 40, signups: 6, completed: 4, conversionPercent: 15 },
    { kind: "direct", label: "Direct or unknown", visits: null, signups: 2, completed: 1, conversionPercent: null },
  ];

  it("lists the rows with dashes where visits cannot be counted, links the codes, and shows the period", () => {
    render(<SourcesTable sources={sources} period="7" />);
    const table = screen.getByRole("table", { name: "Sources" });
    expect(within(table).getByRole("link", { name: "QR: Love's, Hwy 225" })).toHaveAttribute(
      "href",
      "/admin/analytics?period=7&open=aaaaaaaa-0000-4000-8000-000000000001",
    );
    const direct = within(table).getByText("Direct or unknown").closest("tr")!;
    expect(within(direct).getAllByText("—")).toHaveLength(2);
    expect(within(direct).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveTextContent("Last 7 days");
  });

  it("says so when the period has no sign-ups", () => {
    render(<SourcesTable sources={[]} period="30" />);
    expect(screen.getByText("No sign-ups in this period.")).toBeInTheDocument();
  });
});

describe("QrTable", () => {
  it("lists each code with its short link, counts, status and a row link to its sheet", () => {
    render(<QrTable rows={[qrRow(), qrRow({ link: { ...link, id: "aaaaaaaa-0000-4000-8000-000000000002", slug: "pilot", locationName: "Pilot", isActive: false }, scansAll: 0, conversionPercent: null })]} period="30" />);
    const table = screen.getByRole("table", { name: "QR codes" });
    expect(within(table).getByRole("link", { name: "Love's, Hwy 225" })).toHaveAttribute(
      "href",
      "/admin/analytics?open=aaaaaaaa-0000-4000-8000-000000000001",
    );
    expect(within(table).getAllByText("fleetgridus.com/q/loves-hwy-225")).not.toHaveLength(0);
    expect(within(table).getByRole("button", { name: "Copy the short link for Love's, Hwy 225" })).toBeInTheDocument();
    expect(within(table).getByText("Active")).toHaveAttribute("data-qr-status", "active");
    expect(within(table).getByText("Off")).toHaveAttribute("data-qr-status", "off");
    expect(within(table).getByText("15%")).toBeInTheDocument();
  });

  it("invites the first code when there are none", () => {
    render(<QrTable rows={[]} period="30" />);
    expect(screen.getByText("No QR codes yet.")).toBeInTheDocument();
  });
});

describe("GenerateQrSheet", () => {
  it("opens from the top-bar button, makes the slug from the location until edited, and saves", async () => {
    actions.createQrLinkAction.mockResolvedValue(ok(link));
    render(<GenerateQrSheet period="30" />);
    await userEvent.click(screen.getByRole("button", { name: "Generate QR code" }));
    const sheet = await screen.findByRole("dialog", { name: "Generate QR code" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: /Location name/ }), "Love's, Hwy 225");
    expect(within(sheet).getByRole("textbox", { name: /Slug/ })).toHaveValue("loves-hwy-225");
    expect(sheet.querySelector("[data-slot=short-link-preview]")).toHaveTextContent("/q/loves-hwy-225");
    expect(within(sheet).getByRole("textbox", { name: /Campaign/ })).toHaveValue("pasadena-225");

    await userEvent.clear(within(sheet).getByRole("textbox", { name: /Slug/ }));
    await userEvent.type(within(sheet).getByRole("textbox", { name: /Slug/ }), "Loves-225");
    expect(within(sheet).getByRole("textbox", { name: /Slug/ })).toHaveValue("loves-225");
    await userEvent.type(within(sheet).getByRole("textbox", { name: /Location name/ }), " E");
    expect(within(sheet).getByRole("textbox", { name: /Slug/ })).toHaveValue("loves-225");

    await userEvent.click(within(sheet).getByRole("button", { name: "Save and show the code" }));
    await waitFor(() =>
      expect(actions.createQrLinkAction).toHaveBeenCalledWith({
        locationName: "Love's, Hwy 225 E",
        campaign: "pasadena-225",
        targetPath: "/",
        slug: "loves-225",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^QR code made/));
    expect(router.push).toHaveBeenCalledWith("/admin/analytics?open=aaaaaaaa-0000-4000-8000-000000000001");
  });

  it("shows a used slug on the field", async () => {
    actions.createQrLinkAction.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "That short link is already used. Change the slug.", fieldErrors: { slug: "That short link is already used. Change the slug." } },
    });
    render(<GenerateQrSheet period="30" />);
    await userEvent.click(screen.getByRole("button", { name: "Generate QR code" }));
    const sheet = await screen.findByRole("dialog", { name: "Generate QR code" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: /Location name/ }), "Love's");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save and show the code" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("That short link is already used. Change the slug.");
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("QrDetailSheet", () => {
  it("stays closed without a code", () => {
    render(<QrDetailSheet row={null} closeHref="/admin/analytics" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the preview, the short link with copy, the downloads and the counts", () => {
    render(<QrDetailSheet row={qrRow()} closeHref="/admin/analytics" />);
    const sheet = screen.getByRole("dialog", { name: "Love's, Hwy 225" });
    expect(within(sheet).getByRole("img", { name: "QR code for Love's, Hwy 225" })).toHaveAttribute(
      "src",
      "/api/admin/qr/aaaaaaaa-0000-4000-8000-000000000001/svg",
    );
    expect(sheet.querySelector("[data-slot=short-link]")).toHaveTextContent("https://fleetgridus.com/q/loves-hwy-225");
    expect(within(sheet).getByRole("button", { name: "Copy the short link" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Download PNG" })).toHaveAttribute(
      "href",
      "/api/admin/qr/aaaaaaaa-0000-4000-8000-000000000001/png?download=1",
    );
    expect(within(sheet).getByRole("link", { name: "Download SVG" })).toHaveAttribute(
      "href",
      "/api/admin/qr/aaaaaaaa-0000-4000-8000-000000000001/svg?download=1",
    );
    const counts = within(sheet).getByLabelText("Counts");
    expect(within(counts).getByText("40")).toBeInTheDocument();
    expect(within(counts).getByText("15%")).toBeInTheDocument();
    expect(within(sheet).getByText("Active")).toHaveAttribute("data-qr-status", "active");
    expect(within(sheet).getByRole("link", { name: "See the drivers who scanned it" })).toHaveAttribute(
      "href",
      "/admin/drivers?qr=aaaaaaaa-0000-4000-8000-000000000001",
    );
  });

  it("deactivates after a dialog that names the effect, and activates without one", async () => {
    actions.setQrLinkActiveAction.mockResolvedValue(ok({ ...link, isActive: false }));
    const { unmount } = render(<QrDetailSheet row={qrRow()} closeHref="/admin/analytics" />);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("dialog", { name: "Deactivate Love's, Hwy 225?" });
    expect(within(dialog).getByText(/land on the home page without tags/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() =>
      expect(actions.setQrLinkActiveAction).toHaveBeenCalledWith({ qrLinkId: link.id, isActive: false }),
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^The code is off/));
    expect(router.refresh).toHaveBeenCalled();
    unmount();

    actions.setQrLinkActiveAction.mockResolvedValue(ok(link));
    render(<QrDetailSheet row={qrRow({ link: { ...link, isActive: false } })} closeHref="/admin/analytics" />);
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() =>
      expect(actions.setQrLinkActiveAction).toHaveBeenCalledWith({ qrLinkId: link.id, isActive: true }),
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^The code is on again/));
  });

  it("closes back to the list", async () => {
    render(<QrDetailSheet row={qrRow()} closeHref="/admin/analytics?period=7" />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(router.push).toHaveBeenCalledWith("/admin/analytics?period=7");
  });
});
