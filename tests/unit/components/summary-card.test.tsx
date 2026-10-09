import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  checkSummary,
  experienceSummary,
  mvrSummary,
  SummaryCard,
} from "@/components/driver/SummaryCard";
import { buildDriver, buildPartialDriver } from "../../setup/factories";

const rows = () =>
  Array.from(document.querySelectorAll("[data-slot=summary-card] dt")).map((dt) => [
    dt.textContent,
    dt.nextElementSibling?.querySelector("span")?.textContent,
  ]);

describe("SummaryCard", () => {
  it("lists every sign-up answer in flow order, each with an Edit button", () => {
    render(<SummaryCard driver={buildDriver()} onEdit={vi.fn()} />);
    expect(rows()).toEqual([
      ["CDL class", "Class A"],
      ["Experience", "6 to 10 years"],
      ["Record", "No violations in 3 years"],
      ["Cards", "TWIC, medical card current"],
      ["Endorsements", "H, T"],
      ["Transmission", "Automatic and manual"],
      ["Equipment", "Dry van, Flatbed"],
    ]);
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(7);
  });

  it("leaves the profile-only answers out: W-2 or 1099, driving style, the Clearinghouse, availability", () => {
    render(<SummaryCard driver={buildDriver()} onEdit={vi.fn()} />);
    const text = document.querySelector("[data-slot=summary-card]")?.textContent ?? "";
    for (const absent of ["W-2", "Local day cab", "Clearinghouse", "Full time", "Work type"]) {
      expect(text, absent).not.toContain(absent);
    }
  });

  it("reads unanswered rows as such, and no endorsements as None", () => {
    render(<SummaryCard driver={buildPartialDriver()} onEdit={vi.fn()} />);
    expect(rows()).toEqual([
      ["CDL class", "Not answered"],
      ["Experience", "Not answered"],
      ["Record", "Not answered"],
      ["Cards", "Not answered, Not answered"],
      ["Endorsements", "None"],
      ["Transmission", "Not answered"],
      ["Equipment", "Not answered"],
    ]);
  });

  it("sends Edit to the page that collects the row", async () => {
    const onEdit = vi.fn();
    render(<SummaryCard driver={buildDriver()} onEdit={onEdit} />);
    const card = within(document.querySelector("[data-slot=summary-card]") as HTMLElement);
    await userEvent.click(card.getByRole("button", { name: "Edit experience" }));
    await userEvent.click(card.getByRole("button", { name: "Edit record" }));
    await userEvent.click(card.getByRole("button", { name: "Edit cards" }));
    await userEvent.click(card.getByRole("button", { name: "Edit transmission" }));
    await userEvent.click(card.getByRole("button", { name: "Edit equipment" }));
    expect(onEdit.mock.calls.map((call) => call[0])).toEqual([
      "experience",
      "record",
      "credentials",
      "transmission",
      "equipment",
    ]);
  });

  it("reads each answer in a sentence", () => {
    expect(checkSummary("twicActive", null)).toBe("Not answered");
    expect(checkSummary("twicActive", true)).toBe("TWIC");
    expect(checkSummary("medicalCardActive", false)).toBe("medical card not current");
    expect(mvrSummary(null)).toBe("Not answered");
    expect(mvrSummary("clean")).toBe("No violations in 3 years");
    expect(mvrSummary("minor_1_2")).toBe("1 or 2 minor violations in 3 years");
    expect(mvrSummary("major_3_plus")).toBe("3 or more or a major violation in 3 years");
    expect(experienceSummary(null)).toBe("Not answered");
    expect(experienceSummary(0)).toBe("Under 1 years");
    expect(experienceSummary(25)).toBe("10 or more years");
  });

  it("shows the MVR level on the record row", () => {
    render(<SummaryCard driver={buildDriver({ mvrStatus: "major_3_plus" })} onEdit={vi.fn()} />);
    expect(rows()).toContainEqual(["Record", "3 or more or a major violation in 3 years"]);
  });
});
