import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Users } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataTable, pageRangeText, type DataColumn } from "@/components/admin/DataTable";
import { DetailSheet } from "@/components/admin/DetailSheet";
import { activeFilterChips, FilterBar } from "@/components/admin/FilterBar";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/drivers" }));

interface Row {
  id: string;
  name: string;
  phone: string;
  scans: number;
}

const COLUMNS: DataColumn<Row>[] = [
  { key: "name", header: "Driver", cell: (row) => row.name, sortable: true },
  { key: "phone", header: "Phone", cell: (row) => row.phone, mono: true },
  { key: "scans", header: "Scans", cell: (row) => row.scans, align: "right", sortable: true },
];
const ROWS: Row[] = [
  { id: "a", name: "Pat Driver", phone: "(555) 555-0110", scans: 12 },
  { id: "b", name: "Sam Hauler", phone: "(555) 555-0111", scans: 3 },
];
const EMPTY = { icon: Users, title: "No drivers yet.", description: "They appear as they sign up." };

describe("StatTile", () => {
  it("shows the eyebrow, the number with digit grouping and the caption, two to six across", () => {
    render(
      <StatTileGrid label="Driver counts" columns={6}>
        <StatTile label="Total" value={1402} caption="all time" />
        <StatTile label="Complete" value="64%" />
      </StatTileGrid>,
    );
    const grid = screen.getByRole("region", { name: "Driver counts" });
    expect(grid).toHaveClass("grid-cols-2", "lg:grid-cols-4", "xl:grid-cols-6");
    expect(within(grid).getByText("Total")).toBeInTheDocument();
    expect(within(grid).getByText("1,402")).toHaveClass("tabular-nums");
    expect(within(grid).getByText("all time")).toBeInTheDocument();
    expect(within(grid).getByText("64%")).toBeInTheDocument();
  });
});

describe("AdminStatusBadge", () => {
  it.each([
    ["pending", "Pending"],
    ["approved", "Approved"],
    ["blocked", "Blocked"],
    ["incomplete", "Incomplete"],
  ] as const)("shows %s as an icon and the word", (status, label) => {
    render(<AdminStatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute("data-status", status);
    expect(badge.querySelector("svg")).not.toBeNull();
  });
});

describe("DataTable", () => {
  const sortHref = (key: string, direction: string) => `/admin/drivers?sort=${key}&dir=${direction}`;
  const pagination = { page: 2, pageSize: 25, total: 140, hrefFor: (page: number) => `/admin/drivers?page=${page}` };

  it("renders the rows as a table and as cards, with the row linking to its page", () => {
    render(
      <DataTable
        label="Drivers"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        rowHref={(row) => `/admin/drivers?open=${row.id}`}
        renderCard={(row) => <span>{row.name} card</span>}
        empty={EMPTY}
      />,
    );
    const table = screen.getByRole("table", { name: "Drivers" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Driver",
      "Phone",
      "Scans",
    ]);
    expect(within(table).getByRole("link", { name: "Pat Driver" })).toHaveAttribute("href", "/admin/drivers?open=a");
    expect(within(table).getByText("(555) 555-0110")).toHaveClass("font-mono");
    expect(within(table).getByText("12")).toHaveClass("text-right", "tabular-nums");
    const cards = screen.getByRole("list", { name: "Drivers" });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
    expect(within(cards).getByText("Sam Hauler card")).toBeInTheDocument();
  });

  it("opens the row on a click anywhere in it", async () => {
    render(
      <DataTable
        label="Drivers"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        rowHref={(row) => `/admin/drivers?open=${row.id}`}
        renderCard={(row) => <span>{row.name}</span>}
        empty={EMPTY}
      />,
    );
    await userEvent.click(screen.getByRole("table").querySelector("[data-row=b] td:last-child")!);
    expect(router.push).toHaveBeenCalledWith("/admin/drivers?open=b");
  });

  it("marks the sorted column, links the next direction and shows the page range", () => {
    render(
      <DataTable
        label="Drivers"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        renderCard={(row) => <span>{row.name}</span>}
        sort={{ key: "scans", direction: "desc" }}
        sortHref={sortHref}
        pagination={pagination}
        empty={EMPTY}
      />,
    );
    const scans = screen.getByRole("columnheader", { name: /Scans/ });
    expect(scans).toHaveAttribute("aria-sort", "descending");
    expect(within(scans).getByRole("link")).toHaveAttribute("href", "/admin/drivers?sort=scans&dir=asc");
    const driver = screen.getByRole("columnheader", { name: /Driver/ });
    expect(driver).not.toHaveAttribute("aria-sort");
    expect(within(driver).getByRole("link")).toHaveAttribute("href", "/admin/drivers?sort=name&dir=asc");
    expect(screen.queryByRole("columnheader", { name: /Phone/ })?.querySelector("a")).toBeNull();
    expect(document.querySelector("[data-slot=page-range]")).toHaveTextContent("26 to 50 of 140");
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/admin/drivers?page=1");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/admin/drivers?page=3");
  });

  it("disables Next on the last page", () => {
    render(
      <DataTable
        label="Drivers"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        renderCard={(row) => <span>{row.name}</span>}
        pagination={{ ...pagination, page: 6 }}
        empty={EMPTY}
      />,
    );
    expect(document.querySelector("[data-slot=page-range]")).toHaveTextContent("126 to 140 of 140");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/admin/drivers?page=5");
  });

  it("shows the empty state with the icon and the next action, and skeleton rows while loading", () => {
    const { unmount } = render(
      <DataTable
        label="Drivers"
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        renderCard={(row) => <span>{row.name}</span>}
        empty={{ ...EMPTY, action: <a href="/admin/analytics">Make a QR code</a> }}
      />,
    );
    expect(screen.getByText("No drivers yet.")).toBeInTheDocument();
    expect(screen.getByTestId("empty-state-icon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make a QR code" })).toBeInTheDocument();
    unmount();

    render(
      <DataTable
        label="Drivers"
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        renderCard={(row) => <span>{row.name}</span>}
        loading
        empty={EMPTY}
      />,
    );
    expect(document.querySelector("[data-slot=data-table]")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(6);
    expect(screen.queryByText("No drivers yet.")).not.toBeInTheDocument();
  });

  it("words the page range", () => {
    expect(pageRangeText({ page: 1, pageSize: 25, total: 140 })).toBe("1 to 25 of 140");
    expect(pageRangeText({ page: 1, pageSize: 25, total: 3 })).toBe("1 to 3 of 3");
    expect(pageRangeText({ page: 1, pageSize: 25, total: 0 })).toBe("0 of 0");
    expect(pageRangeText({ page: 41, pageSize: 25, total: 1005 })).toBe("1,001 to 1,005 of 1,005");
  });
});

describe("FilterBar", () => {
  const filters = [
    { name: "status", label: "Review", value: "pending", options: [{ value: "", label: "Any" }, { value: "pending", label: "Pending" }] },
    { name: "area", label: "Area", value: "", options: [{ value: "", label: "Any" }, { value: "in", label: "In area" }] },
  ];

  it("is a GET form to the page with the search, the selects, and chips that drop one filter each", () => {
    render(
      <FilterBar
        action="/admin/drivers"
        search={{ name: "q", label: "Search", value: "pat", placeholder: "Name, phone or ZIP" }}
        filters={filters}
        keep={{ sort: "created" }}
      />,
    );
    const form = screen.getAllByRole("form", { name: "Filters" })[0];
    expect(form).toHaveAttribute("action", "/admin/drivers");
    expect(within(form).getByRole("searchbox", { name: "Search" })).toHaveValue("pat");
    expect(form.querySelector("input[name=sort]")).toHaveAttribute("value", "created");
    expect(within(form).getByRole("combobox", { name: "Review" })).toHaveTextContent("Pending");

    const chips = screen.getByRole("list", { name: "Active filters" });
    const chipLinks = within(chips).getAllByRole("link");
    expect(chipLinks.map((link) => link.textContent?.replace("(remove)", "").trim())).toEqual([
      "Search: pat",
      "Review: Pending",
      "Clear filters",
    ]);
    expect(chipLinks[0]).toHaveAttribute("href", "/admin/drivers?sort=created&status=pending");
    expect(chipLinks[1]).toHaveAttribute("href", "/admin/drivers?sort=created&q=pat");
    expect(chipLinks[2]).toHaveAttribute("href", "/admin/drivers");
    expect(screen.getByRole("button", { name: "Filters, 1 on" })).toHaveClass("lg:hidden");
  });

  it("shows no chips when nothing is on", () => {
    render(<FilterBar action="/admin/drivers" filters={filters.map((filter) => ({ ...filter, value: "" }))} />);
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
    expect(activeFilterChips({ action: "/admin/drivers", filters: [] })).toEqual([]);
  });

  it("opens the selects in a sheet on a phone", async () => {
    render(<FilterBar action="/admin/drivers" filters={filters} />);
    await userEvent.click(screen.getByRole("button", { name: "Filters, 1 on" }));
    const sheet = await screen.findByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("combobox", { name: "Area" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Apply filters" })).toBeInTheDocument();
  });
});

describe("DetailSheet", () => {
  it("opens from the right with the title, the body and a footer for the actions", () => {
    render(
      <DetailSheet open onOpenChange={vi.fn()} title="Pat Driver" description="Signed up today" footer={<button type="button">Approve</button>}>
        <p>the card</p>
      </DetailSheet>,
    );
    const sheet = screen.getByRole("dialog", { name: "Pat Driver" });
    expect(document.querySelector("[data-slot=sheet-content]")).toHaveAttribute("data-side", "right");
    expect(within(sheet).getByText("Signed up today")).toBeInTheDocument();
    expect(within(sheet).getByText("the card")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=detail-footer]")).toHaveClass("sticky");
  });
});

describe("ConfirmDialog", () => {
  it("names the record and the effect, confirms once, and cancels", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Block Juan Ramirez?"
        description="He will be signed out and hidden from carriers."
        confirmLabel="Block"
        variant="destructive"
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Block Juan Ramirez?" });
    expect(within(dialog).getByText("He will be signed out and hidden from carriers.")).toBeInTheDocument();
    const block = within(dialog).getByRole("button", { name: "Block" });
    expect(block).toHaveAttribute("data-variant", "destructive");
    await userEvent.click(block);
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("holds both buttons while the action runs", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Approve Pat Driver?"
        description="Subscribed carriers can find them."
        confirmLabel="Approve"
        pendingLabel="Approving..."
        pending
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText("Approving...")).toBeInTheDocument();
  });
});
