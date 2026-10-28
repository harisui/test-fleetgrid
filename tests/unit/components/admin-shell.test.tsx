import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPage } from "@/components/admin/AdminPage";
import { ADMIN_NAV, isAdminNavActive } from "@/lib/admin/nav";

const navigation = vi.hoisted(() => ({ pathname: "/admin/drivers" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/server/actions/auth.actions", () => ({ signOutAction: vi.fn() }));

beforeEach(() => {
  navigation.pathname = "/admin/drivers";
});

describe("admin navigation", () => {
  it("lists Drivers and Analytics, in that order, and marks the page or anything below it", () => {
    expect(ADMIN_NAV.map((item) => item.label)).toEqual(["Drivers", "Analytics"]);
    expect(isAdminNavActive("/admin/drivers", "/admin/drivers")).toBe(true);
    expect(isAdminNavActive("/admin/drivers?status=all", "/admin/drivers")).toBe(false);
    expect(isAdminNavActive("/admin/drivers/abc", "/admin/drivers")).toBe(true);
    expect(isAdminNavActive("/admin/analytics", "/admin/drivers")).toBe(false);
  });
});

describe("AdminFrame", () => {
  it("has the sidebar with the wordmark, the pages, the admin and Log out, and marks the active page", () => {
    render(
      <AdminFrame adminLabel="(555) 555-0102">
        <p>content</p>
      </AdminFrame>,
    );
    const sidebar = document.querySelector("[data-slot=admin-sidebar]") as HTMLElement;
    expect(sidebar).toHaveClass("lg:flex");
    const nav = within(sidebar).getByRole("navigation", { name: "Admin" });
    const drivers = within(nav).getByRole("link", { name: "Drivers" });
    expect(drivers).toHaveAttribute("href", "/admin/drivers");
    expect(drivers).toHaveAttribute("aria-current", "page");
    // The 3px orange bar on the left: the sign-panel stripe token, the one orange besides the button and badge.
    expect(drivers.className).toContain("border-sign-panel-border");
    const analytics = within(nav).getByRole("link", { name: "Analytics" });
    expect(analytics).toHaveAttribute("href", "/admin/analytics");
    expect(analytics).not.toHaveAttribute("aria-current");
    expect(within(sidebar).getByText("(555) 555-0102")).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Toggle dark mode" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
  });

  it("on a phone, the bar's menu button opens the same pages in a sheet from the left, which closes on a choice", async () => {
    navigation.pathname = "/admin/analytics";
    render(
      <AdminFrame adminLabel="(555) 555-0102">
        <p>content</p>
      </AdminFrame>,
    );
    const bar = document.querySelector("[data-slot=admin-mobile-bar]") as HTMLElement;
    expect(bar).toHaveClass("lg:hidden");
    await userEvent.click(within(bar).getByRole("button", { name: "Menu" }));
    const sheet = await screen.findByRole("dialog", { name: "Menu" });
    expect(document.querySelector("[data-slot=sheet-content]")).toHaveAttribute("data-side", "left");
    const link = within(sheet).getByRole("link", { name: "Analytics" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(within(sheet).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("link", { name: "Drivers" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  });
});

describe("AdminPage", () => {
  it("shows the title, the subtitle and the actions in a sticky top bar above the content", () => {
    render(
      <AdminPage title="Drivers" subtitle="Approve or block." actions={<button type="button">Generate QR code</button>}>
        <p>table</p>
      </AdminPage>,
    );
    const bar = document.querySelector("[data-slot=admin-top-bar]") as HTMLElement;
    expect(bar).toHaveClass("sticky");
    expect(within(bar).getByRole("heading", { level: 1, name: "Drivers" })).toBeInTheDocument();
    expect(within(bar).getByText("Approve or block.")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Generate QR code" })).toBeInTheDocument();
    // The top bar sits inside the main landmark, so every part of the page is in a landmark.
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toContainElement(bar);
    expect(main.querySelector("[data-slot=admin-content]")).toHaveClass("max-w-7xl");
    expect(within(main).getByText("table")).toBeInTheDocument();
  });
});
