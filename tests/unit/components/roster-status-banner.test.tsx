import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RosterStatusBanner } from "@/components/driver/RosterStatusBanner";
import { FAQ_GROUPS } from "@/content/faq";

const banner = () => document.querySelector("[data-slot=roster-status]") as HTMLElement;

describe("RosterStatusBanner (CR-5 part 5)", () => {
  it("a Roster-Ready driver with texts on reads the client's sentence", () => {
    render(<RosterStatusBanner status="approved" missing={[]} textsOn />);
    expect(banner()).toHaveTextContent("You're Roster-Ready. We'll text you when matching shifts open.");
    expect(within(banner()).queryByRole("link")).toBeNull();
  });

  it("a Roster-Ready driver with texts off is pointed to the profile", () => {
    render(<RosterStatusBanner status="approved" missing={[]} textsOn={false} />);
    expect(within(banner()).getByRole("link", { name: "Turn on texts in your profile to get shift offers." })).toHaveAttribute(
      "href",
      "/driver/profile",
    );
    expect(banner()).not.toHaveTextContent("We'll text you");
  });

  it("a Registered driver sees exactly what is missing, each linked to where it is added", () => {
    render(<RosterStatusBanner status="pending" missing={["cdl_back", "medical_card"]} textsOn />);
    expect(banner()).toHaveTextContent("Upload your CDL and medical card to start getting shift offers.");
    const links = within(screen.getByRole("list", { name: "What is missing" })).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["CDL back photo", "/driver/documents?type=cdl_back"],
      ["Medical card", "/driver/documents?type=medical_card"],
    ]);
  });

  it("does not ask for documents when only something else is missing", () => {
    render(<RosterStatusBanner status="pending" missing={["cdl_state", "last_name"]} textsOn />);
    expect(banner()).toHaveTextContent("To start getting shift offers, we still need:");
    expect(banner()).not.toHaveTextContent("Upload your CDL");
    expect(within(banner()).getByRole("link", { name: "A Texas CDL" })).toHaveAttribute("href", "/driver/profile");
    expect(within(banner()).getByRole("link", { name: "Your last name" })).toHaveAttribute("href", "/driver/profile");
  });

  it("says the review is under way when nothing is missing", () => {
    render(<RosterStatusBanner status="pending" missing={[]} textsOn />);
    expect(banner()).toHaveTextContent("Your documents are in. FleetGrid staff are reviewing your profile.");
  });

  it("shows nothing to a blocked driver", () => {
    render(<RosterStatusBanner status="blocked" missing={["cdl_front"]} textsOn />);
    expect(banner()).toBeNull();
  });
});

describe("the driver FAQ (CR-5 part 5)", () => {
  it("explains Registered and Roster-Ready, and that it is no background check", () => {
    const entries = FAQ_GROUPS.flatMap((group) => group.entries);
    const entry = entries.find((item) => item.question === "What do Registered and Roster-Ready mean?");
    expect(entry?.answer).toMatch(/It is not a background check\.$/);
  });
});
