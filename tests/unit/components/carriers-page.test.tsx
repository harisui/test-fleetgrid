import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CarriersPage from "@/app/(public)/carriers/page";
import { ZipCheck } from "@/components/marketing/ZipCheck";
import { CARRIER_FAQ_EXCERPT } from "@/content/faq";
import { CARRIERS } from "@/content/marketing";
import { SMS_SAMPLE_OFFER, SMS_SAMPLE_REPLY } from "@/content/sms-samples";
import type { Result } from "@/server/errors/AppError";

const actions = vi.hoisted(() => ({
  checkServiceAreaAction: vi.fn(),
  sendContactMessageAction: vi.fn(),
}));
vi.mock("@/server/actions/marketing.actions", () => actions);
vi.mock("next/navigation", () => ({ usePathname: () => "/carriers" }));
vi.mock("@/lib/carrier/availability", () => ({
  CARRIER_COMING_SOON_PATH: "/carriers",
  isCarrierDisabled: () => false,
}));

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/carriers", () => {
  it("has one H1, the two hero buttons and the area line", () => {
    render(<CarriersPage />);
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(CARRIERS.hero.title);
    const hero = screen.getByRole("region", { name: CARRIERS.hero.title });
    expect(within(hero).getByRole("link", { name: "Check your yard's ZIP" })).toHaveAttribute(
      "href",
      "#service-area",
    );
    expect(within(hero).getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "#pricing");
    expect(hero).toHaveTextContent("Within 50 miles of Houston or Pasadena, Texas.");
  });

  it("lists the nine real search filters and nothing the app does not offer", () => {
    render(<CarriersPage />);
    const list = screen.getByRole("list", { name: "Search filters" });
    const labels = within(list)
      .getAllByRole("listitem")
      .map((item) => item.querySelector(".text-label")?.textContent);
    expect(labels).toEqual([
      "Distance from your yard",
      "CDL class",
      "Years of experience",
      "Driving record",
      "Active TWIC card",
      "Current DOT medical card",
      "Manual transmission",
      "Endorsements",
      "Equipment",
    ]);
    expect(list).toHaveTextContent("H, N, T and X");
    expect(list).not.toHaveTextContent(/certification|availability|work type|forklift|OSHA|ASE/i);
  });

  it("shows the four Broadcast Shift steps beside the Twilio sample thread", () => {
    render(<CarriersPage />);
    const steps = screen.getByRole("list", { name: "Broadcast Shift steps" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    expect(steps).toHaveTextContent("random order");
    const thread = screen.getByRole("group", { name: /sample text thread/ });
    expect(thread).toHaveTextContent(SMS_SAMPLE_OFFER);
    expect(thread).toHaveTextContent(SMS_SAMPLE_REPLY);
    expect(thread.querySelector("[data-direction=out]")).toHaveTextContent("YES 4821");
    expect(thread.querySelector("[data-direction=out] span:last-child")).toHaveClass("font-mono");
  });

  it("prices one plan at $399 a month with the verified lines and the Stripe terms", () => {
    render(<CarriersPage />);
    const card = document.querySelector("[data-slot=pricing-card]") as HTMLElement;
    expect(card).toHaveTextContent("FleetGrid Carrier");
    expect(card.querySelector("[data-slot=price]")).toHaveTextContent("$399");
    expect(card).toHaveTextContent("/month");
    const included = within(card).getByRole("list", { name: "Included" });
    expect(within(included).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Unlimited driver searches",
      "Unlimited shift broadcasts",
      "Driver profiles with the papers drivers add",
      "Search up to 250 miles from your yard",
      "Email support at support@fleetgridus.com",
    ]);
    expect(card).toHaveTextContent("Billed monthly through Stripe. No contract. Cancel anytime from your account.");
    expect(screen.getByText(/Compare \$399 to what one missed shift costs you/)).toBeInTheDocument();
  });

  it("says what FleetGrid is and is not", () => {
    render(<CarriersPage />);
    const is = screen.getByRole("region", { name: "FleetGrid is" });
    expect(within(is).getAllByRole("listitem")).toHaveLength(3);
    const isNot = screen.getByRole("region", { name: "FleetGrid is not" });
    expect(isNot).toHaveTextContent("an employer, staffing agency, broker or payroll service");
  });

  it("links five carrier questions and the full list on the FAQ page, then ends with the CTA band", () => {
    render(<CarriersPage />);
    for (const entry of CARRIER_FAQ_EXCERPT) {
      expect(screen.getByRole("link", { name: entry.question })).toHaveAttribute("href", `/faq#${entry.id}`);
    }
    expect(screen.getByRole("link", { name: "All carrier questions" })).toHaveAttribute("href", "/faq#carriers");
    // Styled like the promise cards: an icon tile, the orange stripe that grows on hover, level heights.
    for (const card of document.querySelectorAll("[data-slot=link-card]")) {
      expect(card).toHaveClass("group", "h-full", "hover:border-border-strong");
      expect(card.querySelector("[data-slot=icon-tile] svg")).not.toBeNull();
      expect(card.querySelector("[data-slot=icon-tile]")).toHaveClass("group-hover:bg-progress-fill");
      expect(card.querySelector("[data-slot=link-card-stripe]")).toHaveClass("w-0", "group-hover:w-full", "bg-progress-fill");
    }
    const band = screen.getByRole("region", { name: "Ready when you are." });
    expect(within(band).getByRole("link", { name: "Check your yard's ZIP" })).toHaveAttribute(
      "href",
      "#service-area",
    );
    expect(within(band).getByRole("link", { name: "Ask us a question" })).toHaveAttribute("href", "/contact");
  });

  it("never shows a phone number, a placeholder word or a dash", () => {
    render(<CarriersPage />);
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).not.toMatch(/869-2040|coming soon|placeholder|TODO|TBD|lorem/i);
    expect(text).not.toMatch(/[–—!]/);
  });
});

describe("ZipCheck", () => {
  const input = () => screen.getByLabelText("Your yard's ZIP code");
  const check = () => screen.getByRole("button", { name: "Check" });

  it("uses the code font, a 56px field and a 56px button", () => {
    render(<ZipCheck />);
    expect(input()).toHaveClass("font-mono", "h-target-lg");
    expect(input()).toHaveAttribute("inputmode", "numeric");
    expect(check()).toHaveClass("h-target-lg");
  });

  it("asks for five digits before it asks the server", async () => {
    render(<ZipCheck />);
    await userEvent.type(input(), "770");
    await userEvent.click(check());
    expect(screen.getByRole("alert")).toHaveTextContent("We do not know that ZIP code. Check the five digits.");
    expect(actions.checkServiceAreaAction).not.toHaveBeenCalled();
  });

  it("a yard inside the launch area gets the good news and the carrier sign-up", async () => {
    actions.checkServiceAreaAction.mockResolvedValue(
      ok({ zip: "77506", city: "Pasadena", state: "TX", inServiceArea: true }),
    );
    render(<ZipCheck />);
    await userEvent.type(input(), "77506");
    await userEvent.click(check());
    const answer = await screen.findByRole("status");
    expect(actions.checkServiceAreaAction).toHaveBeenCalledWith("77506");
    expect(answer).toHaveAttribute("data-area", "inside");
    expect(answer).toHaveTextContent("Pasadena, TX 77506. Good news, your yard is in the launch area.");
    expect(within(answer).getByRole("link", { name: "Create your carrier account" })).toHaveAttribute(
      "href",
      "/login?role=carrier",
    );
  });

  it("a yard outside gets the waitlist, through the same sign-up", async () => {
    actions.checkServiceAreaAction.mockResolvedValue(
      ok({ zip: "75201", city: "Dallas", state: "TX", inServiceArea: false }),
    );
    render(<ZipCheck />);
    await userEvent.type(input(), "75201");
    await userEvent.click(check());
    const answer = await screen.findByRole("status");
    expect(answer).toHaveAttribute("data-area", "outside");
    expect(answer).toHaveTextContent("FleetGrid is not in your area yet.");
    expect(within(answer).getByRole("link", { name: "Join the waitlist" })).toHaveAttribute(
      "href",
      "/login?role=carrier",
    );
  });

  it("an unknown ZIP and a failed check each get their own message, and typing clears it", async () => {
    actions.checkServiceAreaAction.mockResolvedValueOnce(ok(null));
    render(<ZipCheck />);
    await userEvent.type(input(), "00000");
    await userEvent.click(check());
    expect(await screen.findByRole("alert")).toHaveTextContent("We do not know that ZIP code.");
    expect(input()).toHaveAttribute("aria-invalid", "true");

    actions.checkServiceAreaAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
    });
    await userEvent.clear(input());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.type(input(), "77002");
    await userEvent.click(check());
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not check that ZIP just now.");
  });
});
