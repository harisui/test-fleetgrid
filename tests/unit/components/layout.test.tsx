import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, User } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { buildThemeCookie, readThemeCookie, THEME_COOKIE } from "@/lib/theme";
import type { NavItem } from "@/types/domain";

const pathname = vi.hoisted(() => ({ current: "/driver/profile" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const NAV: NavItem[] = [
  { href: "/driver/profile", label: "Profile", icon: <User /> },
  { href: "/driver/documents", label: "Documents", icon: <FileText /> },
];

function stubSystemDark(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches })),
  );
}

beforeEach(() => {
  pathname.current = "/driver/profile";
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
  document.documentElement.classList.remove("dark");
  stubSystemDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("has an accessible name and a 48px tap target", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Toggle dark mode" })).toHaveClass("size-target");
  });

  it("switches to dark mode and persists the choice in the cookie", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(readThemeCookie(document.cookie)).toBe("dark");
  });

  it("switches back to light mode and persists that too", async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Toggle dark mode" });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(document.documentElement).not.toHaveClass("dark");
    expect(readThemeCookie(document.cookie)).toBe("light");
  });

  it("restores the persisted choice when mounted again", () => {
    document.cookie = buildThemeCookie("dark");
    render(<ThemeToggle />);
    expect(document.documentElement).toHaveClass("dark");
  });

  it("defaults to light when nothing is stored, even on a dark system", () => {
    stubSystemDark(true);
    render(<ThemeToggle />);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(readThemeCookie(document.cookie)).toBe("light");
  });
});

describe("Header", () => {
  it("shows the brand link and the dark mode toggle", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "FleetGrid" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Toggle dark mode" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("renders nav items and actions", () => {
    render(<Header navItems={NAV} actions={<button>Log out</button>} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/driver/profile",
    );
    expect(within(nav).getByRole("link", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});

describe("MobileNav", () => {
  it("renders nothing without items", () => {
    const { container } = render(<MobileNav navItems={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the current page", () => {
    render(<MobileNav navItems={NAV} />);
    const nav = screen.getByRole("navigation", { name: "Main mobile" });
    expect(within(nav).getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Documents" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("treats nested routes as active", () => {
    pathname.current = "/driver/documents/upload";
    render(<MobileNav navItems={NAV} />);
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("aria-current", "page");
  });

  it("works without icons", () => {
    render(<MobileNav navItems={[{ href: "/driver/profile", label: "Profile" }]} />);
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  it("links are at least 44px tall", () => {
    render(<MobileNav navItems={NAV} />);
    expect(screen.getByRole("link", { name: "Profile" })).toHaveClass("min-h-14");
  });
});

describe("Footer", () => {
  it("links to the legal pages", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: "Legal" });
    expect(within(nav).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(within(nav).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(nav).getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
      "href",
      "/sms-terms",
    );
  });

  it("names FleetGrid LLC with the current year, the support email and the business address", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} FleetGrid LLC`);
    expect(within(footer).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(footer.querySelector("[data-slot=footer-contact]")).toHaveTextContent(
      "8401 Mayland Dr. STE A, Richmond, VA 23294",
    );
  });
});

describe("AppShell", () => {
  it("renders header, main content, footer and a skip link", () => {
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveClass("max-w-5xl");
    expect(within(main).getByText("Page content")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.queryByRole("navigation", { name: "Main mobile" })).not.toBeInTheDocument();
  });

  it("supports a narrow layout, nav items, header actions and hiding the footer", () => {
    render(
      <AppShell
        width="narrow"
        navItems={NAV}
        headerActions={<button>Log out</button>}
        showFooter={false}
      >
        <p>Form</p>
      </AppShell>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveClass("max-w-xl");
    // Leaves room for the fixed bottom nav on phones.
    expect(main).toHaveClass("pb-24");
    expect(screen.getByRole("navigation", { name: "Main mobile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });
});
