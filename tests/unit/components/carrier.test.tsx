import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingCard, CONFIRM_ATTEMPTS, CONFIRM_INTERVAL_MS } from "@/components/carrier/BillingCard";
import { CarrierDetailsForm } from "@/components/carrier/CarrierDetailsForm";
import { CarrierStatusCard } from "@/components/carrier/CarrierStatusCard";
import { DriverCardView } from "@/components/carrier/DriverCardView";
import { DriverResults } from "@/components/carrier/DriverResults";
import { countActiveFilters, countMoreFilters, SearchFilters } from "@/components/carrier/SearchFilters";
import { TermsAcceptance, TERMS_STATEMENT } from "@/components/carrier/TermsAcceptance";
import { TestCheckout } from "@/components/carrier/TestCheckout";
import { WaitlistCard } from "@/components/carrier/WaitlistCard";
import { CARRIER_OUT_OF_AREA_NOTE, CARRIER_WAITLIST_JOINED } from "@/lib/carrier/options";
import { driverSearchSchema } from "@/lib/validation/carrier.schema";
import {
  BILLING_EMAIL_MESSAGE,
  COMPANY_NAME_MESSAGE,
  TERMS_MESSAGE,
} from "@/lib/validation/carrier.schema";
import { ZIP_UNKNOWN_MESSAGE } from "@/lib/validation/onboarding.schema";
import type { Result } from "@/server/errors/AppError";
import type { DriverSearchPage } from "@/server/services/DriverSearchService";
import {
  buildCarrier,
  buildDocument,
  buildDriver,
  buildSubscription,
  PLACES,
} from "../../setup/factories";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  saveCarrierDetailsAction: vi.fn(),
  updateCarrierDetailsAction: vi.fn(),
  lookupYardZipAction: vi.fn(),
  acceptTermsAction: vi.fn(),
  joinWaitlistAction: vi.fn(),
  startCheckoutAction: vi.fn(),
  openBillingPortalAction: vi.fn(),
  completeTestCheckoutAction: vi.fn(),
  refreshSubscriptionAction: vi.fn(),
  keepSubscriptionAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/carrier.actions", () => actions);
// The ZIP hook's default action is the driver's; the carrier form passes its own.
vi.mock("@/server/actions/driver.actions", () => ({ lookupZipAction: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const failure = (message: string, fieldErrors?: Record<string, string>): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", message, fieldErrors },
});

/** The dataset as the form sees it. */
const LOOKUPS: Record<string, { city: string; state: string; inServiceArea: boolean }> = {
  "77002": { city: "Houston", state: "TX", inServiceArea: true },
  "75201": { city: "Dallas", state: "TX", inServiceArea: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  actions.lookupYardZipAction.mockImplementation(async (zip: string) =>
    ok(LOOKUPS[zip] ? { zip, ...LOOKUPS[zip] } : null),
  );
});

async function fillDetails(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    "Company name": "Bayou Freight LLC",
    "Contact name": "Maria Lopez",
    "Billing email": "billing@bayoufreight.example",
    "USDOT number": "1234567",
    "ZIP code": "77002",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value !== undefined) await userEvent.type(screen.getByLabelText(new RegExp(`^${label}`)), value);
  }
}

describe("CarrierDetailsForm", () => {
  it("asks for the company, contact, email, optional numbers and the yard ZIP, then continues", async () => {
    actions.saveCarrierDetailsAction.mockResolvedValue(ok(buildCarrier()));
    render(<CarrierDetailsForm />);
    for (const label of ["Company name", "Contact name", "Billing email", "ZIP code"]) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeRequired();
    }
    expect(screen.getByLabelText(/^USDOT number/)).not.toBeRequired();
    expect(screen.getByLabelText(/^MC number/)).not.toBeRequired();

    await fillDetails();
    await waitFor(() =>
      expect(document.querySelector("[data-slot=zip-place]")).toHaveTextContent("Houston, TX"),
    );
    expect(screen.queryByText(CARRIER_OUT_OF_AREA_NOTE)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() =>
      expect(actions.saveCarrierDetailsAction).toHaveBeenCalledWith({
        companyName: "Bayou Freight LLC",
        contactName: "Maria Lopez",
        billingEmail: "billing@bayoufreight.example",
        usdot: "1234567",
        mc: null,
        zip: "77002",
      }),
    );
    expect(router.push).toHaveBeenCalledWith("/carrier");
  });

  it("shows the errors in place and sends nothing", async () => {
    render(<CarrierDetailsForm />);
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText(COMPANY_NAME_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(BILLING_EMAIL_MESSAGE)).toBeInTheDocument();
    expect(actions.saveCarrierDetailsAction).not.toHaveBeenCalled();
  });

  it("warns when the yard is outside the launch area, and rejects a ZIP that is not on file", async () => {
    render(<CarrierDetailsForm />);
    await userEvent.type(screen.getByLabelText(/^ZIP code/), "75201");
    expect(await screen.findByText(CARRIER_OUT_OF_AREA_NOTE)).toBeInTheDocument();
    expect(document.querySelector("[data-slot=zip-place]")).toHaveTextContent("Dallas, TX");

    await userEvent.clear(screen.getByLabelText(/^ZIP code/));
    await userEvent.type(screen.getByLabelText(/^ZIP code/), "99999");
    expect(await screen.findByText(ZIP_UNKNOWN_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(CARRIER_OUT_OF_AREA_NOTE)).not.toBeInTheDocument();
  });

  it("maps a server field error back onto its field", async () => {
    actions.saveCarrierDetailsAction.mockResolvedValue(
      failure("Check the fields", { zip: ZIP_UNKNOWN_MESSAGE }),
    );
    render(<CarrierDetailsForm />);
    await fillDetails();
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText(ZIP_UNKNOWN_MESSAGE)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("edits the saved details on the account page and confirms with a toast", async () => {
    const carrier = buildCarrier({ mc: "55" });
    actions.updateCarrierDetailsAction.mockResolvedValue(ok(carrier));
    render(<CarrierDetailsForm carrier={carrier} />);
    expect(screen.getByLabelText(/^Company name/)).toHaveValue("Bayou Freight LLC");
    expect(screen.getByLabelText(/^MC number/)).toHaveValue("55");
    expect(document.querySelector("[data-slot=zip-place]")).toHaveTextContent("Houston, TX");

    await userEvent.clear(screen.getByLabelText(/^Company name/));
    await userEvent.type(screen.getByLabelText(/^Company name/), "Bayou Freight Group");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(actions.updateCarrierDetailsAction).toHaveBeenCalledWith(
        expect.objectContaining({ companyName: "Bayou Freight Group", mc: "55" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Company details saved");
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("TermsAcceptance", () => {
  it("starts unchecked, refuses without the check, then records and continues", async () => {
    actions.acceptTermsAction.mockResolvedValue(ok({ id: "t1" }));
    render(<TermsAcceptance />);
    const box = screen.getByRole("checkbox", { name: new RegExp(TERMS_STATEMENT.slice(0, 20)) });
    expect(box).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");

    await userEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByText(TERMS_MESSAGE)).toBeInTheDocument();
    expect(actions.acceptTermsAction).not.toHaveBeenCalled();

    await userEvent.click(box);
    expect(screen.queryByText(TERMS_MESSAGE)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    await waitFor(() => expect(actions.acceptTermsAction).toHaveBeenCalledWith({ accepted: true }));
    expect(router.push).toHaveBeenCalledWith("/carrier");
  });

  it("shows a server error", async () => {
    actions.acceptTermsAction.mockResolvedValue(failure("Save your company details first"));
    render(<TermsAcceptance />);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save your company details first");
  });
});

describe("WaitlistCard", () => {
  it("explains the launch area, joins once, and links to the yard", async () => {
    actions.joinWaitlistAction.mockResolvedValue(ok({ id: "w1" }));
    render(<WaitlistCard yard="Dallas, TX 75201" joined={false} />);
    expect(screen.getByText(/isn't available in your area yet/)).toBeInTheDocument();
    expect(screen.getByText("Dallas, TX 75201")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change your yard" })).toHaveAttribute(
      "href",
      "/carrier/account",
    );

    await userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(await screen.findByText(new RegExp(CARRIER_WAITLIST_JOINED))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join the waitlist" })).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows the joined state from the start, and a server error", async () => {
    const { unmount } = render(<WaitlistCard yard="Dallas, TX 75201" joined />);
    expect(screen.getByText(new RegExp(CARRIER_WAITLIST_JOINED))).toBeInTheDocument();
    unmount();

    actions.joinWaitlistAction.mockResolvedValue(failure("FleetGrid is already available in your area"));
    render(<WaitlistCard yard="Houston, TX 77002" joined={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already available");
  });
});

describe("BillingCard", () => {
  const assign = vi.fn();
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
  });

  it("offers Subscribe before any subscription and sends the browser to checkout", async () => {
    actions.startCheckoutAction.mockResolvedValue(ok({ url: "https://checkout.test/s" }));
    render(<BillingCard subscription={null} subscribed={false} portalAvailable={false} testMode={false} />);
    expect(screen.getByText("Not subscribed")).toHaveAttribute("data-subscription", "none");
    expect(screen.getByText("$399 a month")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot=test-mode]")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.test/s"));
  });

  it("shows an active subscription with the next billing date and the portal button", async () => {
    actions.openBillingPortalAction.mockResolvedValue(ok({ url: "https://billing.test/p" }));
    render(
      <BillingCard
        subscription={buildSubscription()}
        subscribed
        portalAvailable
        testMode
        checkoutResult="success"
      />,
    );
    expect(screen.getByText("Active")).toHaveAttribute("data-subscription", "active");
    expect(screen.getByText("Payment received. Thank you. Your subscription is active.")).toBeInTheDocument();
    expect(actions.refreshSubscriptionAction).not.toHaveBeenCalled();
    expect(screen.getByText(/Next billing date/)).toBeInTheDocument();
    expect(document.querySelector("[data-slot=period-end]")).toHaveTextContent("November 13, 2026");
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot=test-mode]")).toHaveTextContent("Test mode");

    await userEvent.click(screen.getByRole("button", { name: "Manage billing" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://billing.test/p"));
  });

  it("explains a failed payment and offers to subscribe again, and shows a cancelled checkout", () => {
    const { unmount } = render(
      <BillingCard
        subscription={buildSubscription({ status: "past_due" })}
        subscribed={false}
        portalAvailable
        testMode={false}
        checkoutResult="cancelled"
      />,
    );
    expect(screen.getByText("Payment failed")).toHaveAttribute("data-subscription", "past_due");
    expect(screen.getByText(/last payment failed/)).toBeInTheDocument();
    expect(screen.getByText("Checkout was cancelled. Nothing was charged.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.queryByText(/Next billing date/)).not.toBeInTheDocument();
    unmount();

    render(
      <BillingCard
        subscription={buildSubscription({ cancelAtPeriodEnd: true })}
        subscribed
        portalAvailable
        testMode={false}
      />,
    );
    expect(screen.getByText(/Access ends on/)).toBeInTheDocument();
  });

  it("a subscription set to end shows Ending with the date and a Keep button, which clears it", async () => {
    actions.keepSubscriptionAction.mockResolvedValue(ok(buildSubscription()));
    render(
      <BillingCard
        subscription={buildSubscription({ cancelAtPeriodEnd: true, canceledAt: "2026-10-16T06:56:24.000Z" })}
        subscribed
        portalAvailable
        testMode={false}
      />,
    );
    const badge = screen.getByText("Ending");
    expect(badge).toHaveAttribute("data-subscription", "active");
    expect(badge).toHaveAttribute("data-ending", "true");
    expect(screen.getByText(/set to end/)).toBeInTheDocument();
    expect(screen.getByText(/Access ends on/)).toBeInTheDocument();
    expect(document.querySelector("[data-slot=period-end]")).toHaveTextContent("November 13, 2026");
    expect(screen.queryByText(/Next billing date/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subscribe/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Keep my subscription" }));
    await waitFor(() => expect(actions.keepSubscriptionAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("Your subscription continues");
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("shows the provider's refusal in place when keeping fails", async () => {
    actions.keepSubscriptionAction.mockResolvedValue(failure("Your subscription is not set to end."));
    render(
      <BillingCard subscription={buildSubscription({ cancelAtPeriodEnd: true })} subscribed portalAvailable testMode={false} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Keep my subscription" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not set to end");
    expect(router.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("Ending")).toBeInTheDocument();
  });

  describe("after a paid checkout the webhook has not recorded yet", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const renderReturned = () =>
      render(
        <BillingCard
          subscription={null}
          subscribed={false}
          portalAvailable
          testMode={false}
          checkoutResult="success"
        />,
      );

    it("asks the provider until the subscription is live, then reloads, with Subscribe held meanwhile", async () => {
      actions.refreshSubscriptionAction
        .mockResolvedValueOnce(ok({ subscribed: false }))
        .mockResolvedValueOnce(failure("Network"))
        .mockResolvedValueOnce(ok({ subscribed: true }));
      renderReturned();
      expect(document.querySelector("[data-confirm=checking]")).toHaveTextContent(
        "Confirming your subscription with Stripe",
      );
      expect(screen.queryByText(/Your subscription is active/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
      expect(actions.refreshSubscriptionAction).not.toHaveBeenCalled();

      await act(() => vi.advanceTimersByTimeAsync(CONFIRM_INTERVAL_MS * 3));
      expect(actions.refreshSubscriptionAction).toHaveBeenCalledTimes(3);
      expect(router.refresh).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(CONFIRM_INTERVAL_MS * 5));
      expect(actions.refreshSubscriptionAction).toHaveBeenCalledTimes(3);
    });

    it("stops after the last attempt, says not to pay twice, and checks again on request", async () => {
      actions.refreshSubscriptionAction.mockResolvedValue(ok({ subscribed: false }));
      renderReturned();

      await act(() => vi.advanceTimersByTimeAsync(CONFIRM_INTERVAL_MS * (CONFIRM_ATTEMPTS + 5)));
      expect(actions.refreshSubscriptionAction).toHaveBeenCalledTimes(CONFIRM_ATTEMPTS);
      expect(router.refresh).not.toHaveBeenCalled();
      const late = document.querySelector("[data-confirm=late]");
      expect(late).toHaveTextContent("Stripe has not confirmed your payment yet");
      expect(late).toHaveTextContent("before you try to pay again");
      expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();

      act(() => screen.getByRole("button", { name: "Check again" }).click());
      expect(document.querySelector("[data-confirm=checking]")).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(CONFIRM_INTERVAL_MS));
      expect(actions.refreshSubscriptionAction).toHaveBeenCalledTimes(CONFIRM_ATTEMPTS + 1);
    });

    it("does not ask after a cancelled checkout", async () => {
      render(
        <BillingCard
          subscription={null}
          subscribed={false}
          portalAvailable
          testMode={false}
          checkoutResult="cancelled"
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(CONFIRM_INTERVAL_MS * 3));
      expect(actions.refreshSubscriptionAction).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled();
    });
  });

  it("shows a checkout error in place", async () => {
    actions.startCheckoutAction.mockResolvedValue(failure("Payments are not set up yet"));
    render(<BillingCard subscription={null} subscribed={false} portalAvailable={false} testMode={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Payments are not set up yet");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("TestCheckout", () => {
  it("pays with one button and returns to billing, or cancels", async () => {
    actions.completeTestCheckoutAction.mockResolvedValue(ok(buildSubscription()));
    render(<TestCheckout customerId="cus_test_0001" />);
    expect(screen.getByText("cus_test_0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/carrier/billing?checkout=cancelled",
    );
    await userEvent.click(screen.getByRole("button", { name: "Pay $399 a month" }));
    await waitFor(() => expect(actions.completeTestCheckoutAction).toHaveBeenCalledWith("cus_test_0001"));
    expect(router.push).toHaveBeenCalledWith("/carrier/billing?checkout=success");
  });

  it("shows a refusal", async () => {
    actions.completeTestCheckoutAction.mockResolvedValue(failure("This checkout is not yours"));
    render(<TestCheckout customerId="cus_other" />);
    await userEvent.click(screen.getByRole("button", { name: "Pay $399 a month" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This checkout is not yours");
  });
});

describe("SearchFilters", () => {
  it("is a form to the search page with every filter named for the schema", () => {
    render(<SearchFilters filters={driverSearchSchema.parse({})} />);
    const form = screen.getByRole("form", { name: "Search filters" });
    // next/form: a GET to the search page, made as a client-side navigation.
    expect(form).toHaveAttribute("action", "/carrier/search");
    expect(form).not.toHaveAttribute("method", "post");
    for (const name of ["H", "N", "T", "X"]) {
      expect(within(form).getByRole("checkbox", { name: new RegExp(`^${name}`) })).not.toBeChecked();
    }
    expect(within(form).getByRole("checkbox", { name: "Must drive a manual" })).not.toBeChecked();
    expect(within(form).getByRole("checkbox", { name: "Reefer" })).toHaveAttribute("value", "reefer");
    expect(within(form).getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/carrier/search");
    expect(within(form).getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
  });

  it("starts from the filters as applied", () => {
    render(
      <SearchFilters
        filters={driverSearchSchema.parse({
          radiusMiles: "100",
          endorsements: ["H", "T"],
          equipmentTypes: ["reefer"],
          manualOnly: "true",
        })}
      />,
    );
    expect(screen.getByRole("checkbox", { name: /^H/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^T/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^N/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Reefer" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Must drive a manual" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: /Distance from yard/ })).toHaveTextContent("100 miles");
  });

  it("folds the box filters under More filters, open when one is on, with the counts", async () => {
    const { unmount } = render(<SearchFilters filters={driverSearchSchema.parse({})} />);
    const more = screen.getByRole("button", { name: "More filters" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(more.getAttribute("aria-controls")!);
    expect(panel).toHaveAttribute("data-slot", "more-filters");
    expect(panel).toHaveClass("hidden");
    expect(document.querySelector("[data-slot=active-filters]")).toBeNull();
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveClass("hidden");
    unmount();

    render(
      <SearchFilters
        filters={driverSearchSchema.parse({ radiusMiles: "100", cdlClass: "A", endorsements: ["H"], manualOnly: "true" })}
      />,
    );
    expect(screen.getByRole("button", { name: "More filters (2 on)" })).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector("[data-slot=active-filters]")).toHaveTextContent("(4 on)");
  });

  it("folds the whole form behind Filters on a phone", async () => {
    render(<SearchFilters filters={driverSearchSchema.parse({})} />);
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    expect(toggle).toHaveClass("md:hidden");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(panel).toHaveClass("max-md:hidden");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveClass("max-md:hidden");
  });

  it("counts the filters that differ from the plain search", () => {
    expect(countActiveFilters(driverSearchSchema.parse({}))).toBe(0);
    expect(
      countActiveFilters(
        driverSearchSchema.parse({ twicActive: "false", minYears: "3", equipmentTypes: ["reefer", "flatbed"] }),
      ),
    ).toBe(4);
    expect(countMoreFilters(driverSearchSchema.parse({ equipmentTypes: ["reefer"], manualOnly: "true" }))).toBe(2);
  });
});

const page = (overrides: Partial<DriverSearchPage> = {}): DriverSearchPage => ({
  matches: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
  filters: driverSearchSchema.parse({}),
  ...overrides,
});

describe("DriverResults", () => {
  it("says so when nothing matches", () => {
    render(<DriverResults page={page()} query={new URLSearchParams()} />);
    expect(screen.getByText("No drivers match")).toBeInTheDocument();
  });

  it("lists each driver once for phones and once for desktops, linking to the driver", () => {
    const driver = buildDriver({ fullName: "Near Driver" });
    render(
      <DriverResults
        page={page({ matches: [{ driver, distanceMiles: 3.2 }], total: 1 })}
        query={new URLSearchParams()}
      />,
    );
    expect(document.querySelector("[data-slot=result-count]")).toHaveTextContent(
      "Showing 1 to 1 of 1 driver, nearest first.",
    );
    const links = screen.getAllByRole("link", { name: /Near Driver/ });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", `/carrier/drivers/${driver.id}`);
    expect(screen.getAllByText("3.2 miles")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Endorsements" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "H, T" })).toBeInTheDocument();
    // The two card answers sit one per line in the table.
    const cards = screen.getByRole("cell", { name: /^TWIC\s*medical card current$/ });
    expect([...cards.querySelectorAll("span")].map((line) => line.textContent)).toEqual([
      "TWIC",
      "medical card current",
    ]);
    // Never the phone number.
    expect(document.body.textContent).not.toMatch(/555-0100|\+1555/);
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("pages, keeping the filters in the links", () => {
    const query = new URLSearchParams("radiusMiles=100&endorsements=H&page=2");
    render(
      <DriverResults
        page={page({
          matches: [{ driver: buildDriver(), distanceMiles: 0 }],
          total: 45,
          page: 2,
          pageCount: 3,
        })}
        query={query}
      />,
    );
    expect(document.querySelector("[data-slot=result-count]")).toHaveTextContent("Showing 21 to 40 of 45 drivers");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/carrier/search?radiusMiles=100&endorsements=H&page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/carrier/search?radiusMiles=100&endorsements=H&page=3",
    );
  });
});

describe("DriverCardView", () => {
  it("shows the card in the sign-up's words, the optional answers given, and the papers as links", () => {
    const driver = buildDriver({ certifications: ["OSHA 10"], bio: "Reliable and on time." });
    const document_ = buildDocument({ fileName: "cdl-front.jpg", sizeBytes: 250_000 });
    render(<DriverCardView driver={driver} distanceMiles={12.4} documents={[document_]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Pat Driver" })).toBeInTheDocument();
    expect(screen.getByText("12.4 miles from your yard")).toBeInTheDocument();
    expect(screen.getByText(/Travels up to 50 miles/)).toBeInTheDocument();
    const card = document.querySelector("[data-slot=driver-card]") as HTMLElement;
    for (const [label, value] of [
      ["CDL class", "Class A"],
      ["Experience", "6 to 10 years"],
      ["Record", "No violations in 3 years"],
      ["Cards", "TWIC, medical card current"],
      ["Endorsements", "H, T"],
      ["Transmission", "Automatic and manual"],
      ["Equipment", "Dry van, Flatbed"],
      ["W-2 or 1099", "W-2 employee"],
      ["Driving", "Local day cab, Regional"],
      ["Clearinghouse", "Registered"],
      ["Availability", "Full time"],
      ["Certifications", "OSHA 10"],
    ]) {
      expect(within(card).getByText(label).nextElementSibling).toHaveTextContent(value);
    }
    expect(document.querySelector("[data-slot=bio]")).toHaveTextContent("Reliable and on time.");
    const paper = screen.getByRole("link", { name: /CDL \(front\)/ });
    expect(paper).toHaveAttribute("href", `/api/documents/${document_.id}/url`);
    expect(paper).toHaveAttribute("target", "_blank");
    expect(paper).toHaveTextContent("cdl-front.jpg");
    expect(document.body.textContent).not.toMatch(/555-0100|\+1555/);
  });

  it("leaves out the optional answers that were not given, and says when there are no papers", () => {
    const driver = buildDriver({
      employmentType: null,
      drivingStyles: [],
      clearinghouseRegistered: null,
      availability: [],
      certifications: [],
      bio: null,
    });
    render(<DriverCardView driver={driver} distanceMiles={0} documents={[]} />);
    for (const label of ["W-2 or 1099", "Driving", "Clearinghouse", "Availability", "Certifications"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(document.querySelector("[data-slot=no-papers]")).toHaveTextContent("No papers uploaded yet");
  });
});

describe("CarrierStatusCard", () => {
  it("says Ending with the date while a cancellation is scheduled, and the search stays open", () => {
    render(
      <CarrierStatusCard
        carrier={buildCarrier()}
        access={{ subscription: buildSubscription({ cancelAtPeriodEnd: true }), subscribed: true }}
      />,
    );
    const badge = screen.getByText("Ending");
    expect(badge).toHaveAttribute("data-ending", "true");
    expect(badge).toHaveAttribute("data-subscription", "active");
    expect(screen.getByText(/Driver search is open until November 13, 2026/)).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("shows the company, the yard, the launch-area badge and the subscription", () => {
    const { unmount } = render(
      <CarrierStatusCard
        carrier={buildCarrier({ inServiceArea: false, city: "Dallas", zip: "75201" })}
        access={{ subscription: null, subscribed: false }}
      />,
    );
    expect(screen.getByText("Bayou Freight LLC")).toBeInTheDocument();
    expect(screen.getByText(/Yard at Dallas, TX 75201/)).toBeInTheDocument();
    expect(screen.getByText("Outside launch area")).toBeInTheDocument();
    expect(screen.getByText("Not subscribed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute("href", "/carrier/billing");
    unmount();

    render(
      <CarrierStatusCard
        carrier={buildCarrier()}
        access={{ subscription: buildSubscription(), subscribed: true }}
      />,
    );
    expect(screen.queryByText("Outside launch area")).not.toBeInTheDocument();
    expect(screen.getByText("Active")).toHaveAttribute("data-subscription", "active");
    expect(screen.getByText(/Driver search is open/)).toBeInTheDocument();
    expect(PLACES.houston.zip).toBe("77002");
  });
});
