import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { checkSummary, SummaryCard } from "@/components/driver/SummaryCard";
import { buildDriver } from "../../setup/factories";

const rows = () =>
  Array.from(document.querySelectorAll("[data-slot=summary-card] dt")).map((dt) => [
    dt.textContent,
    dt.nextElementSibling?.querySelector("span")?.textContent,
  ]);

describe("SummaryCard", () => {
  it("lists every answer of a CDL driver, each with an Edit button", () => {
    render(<SummaryCard driver={buildDriver()} onEdit={vi.fn()} />);
    expect(rows()).toEqual([
      ["Work type", "CDL driver"],
      ["Pay", "W-2 employee"],
      ["Driving", "Local day cab, Regional"],
      ["Equipment", "Dry van, Flatbed · Automatic and manual"],
      ["CDL class", "Class A"],
      ["Endorsements", "H, T"],
      ["Cards", "TWIC, medical card current"],
      ["Record", "In the Clearinghouse, no violations in 3 years"],
      ["Availability", "Full time"],
    ]);
    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(9);
  });

  it("leaves out the driving, equipment and record rows for work without CDL driving", () => {
    render(
      <SummaryCard
        driver={buildDriver({
          operatorTypes: ["yard_spotter", "mechanic"],
          cdlClass: "none",
          endorsements: [],
          employmentType: "either",
          drivingStyles: [],
          transmission: null,
          equipmentTypes: [],
          twicActive: false,
          medicalCardActive: false,
          clearinghouseRegistered: null,
          mvrClean3Years: null,
        })}
        onEdit={vi.fn()}
      />,
    );
    expect(rows()).toEqual([
      ["Work type", "Yard spotter, Mechanic"],
      ["Pay", "Either works"],
      ["CDL class", "No CDL"],
      ["Endorsements", "None"],
      ["Cards", "No TWIC, medical card not current"],
      ["Availability", "Full time"],
    ]);
  });

  it("sends Edit to the screen that collects the row", async () => {
    const onEdit = vi.fn();
    render(<SummaryCard driver={buildDriver()} onEdit={onEdit} />);
    const card = within(document.querySelector("[data-slot=summary-card]") as HTMLElement);
    await userEvent.click(card.getByRole("button", { name: "Edit pay" }));
    await userEvent.click(card.getByRole("button", { name: "Edit equipment" }));
    await userEvent.click(card.getByRole("button", { name: "Edit cards" }));
    await userEvent.click(card.getByRole("button", { name: "Edit record" }));
    expect(onEdit.mock.calls.map((call) => call[0])).toEqual([
      "employmentType",
      "equipment",
      "credentials",
      "compliance",
    ]);
  });

  it("reads an unanswered check as such", () => {
    expect(checkSummary("twicActive", null)).toBe("Not answered");
    expect(checkSummary("twicActive", true)).toBe("TWIC");
    expect(checkSummary("mvrClean3Years", false)).toBe("violations in the last 3 years");
  });
});
