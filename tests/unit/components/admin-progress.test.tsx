import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProgressBar } from "@/components/admin/AdminProgressBar";

const navigation = vi.hoisted(() => ({ pathname: "/admin/drivers", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const state = () => (document.querySelector("[data-slot=admin-progress] > div") as HTMLElement).dataset.state;

describe("the admin page-load bar", () => {
  beforeEach(() => {
    navigation.pathname = "/admin/drivers";
    navigation.search = "";
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  });

  it("creeps on an internal link and fills when the new page arrives", () => {
    const view = render(
      <>
        <AdminProgressBar />
        <a href="/admin/carriers">Carriers</a>
        <a href="https://example.com/">Away</a>
        <a href={window.location.pathname}>Here</a>
      </>,
    );
    expect(state()).toBe("idle");
    const click = (name: string) => view.getByText(name).dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    click("Away");
    click("Here");
    expect(state()).toBe("idle");
    click("Carriers");
    expect(state()).toBe("loading");
    navigation.pathname = "/admin/carriers";
    view.rerender(
      <>
        <AdminProgressBar />
        <a href="/admin/carriers">Carriers</a>
      </>,
    );
    expect(state()).toBe("done");
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state()).toBe("idle");
  });

  it("ignores a link opened in a new tab or with a modifier", () => {
    const view = render(
      <>
        <AdminProgressBar />
        <a href="/admin/shifts" target="_blank">
          New tab
        </a>
        <a href="/admin/shifts">Shifts</a>
      </>,
    );
    view.getByText("New tab").dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    view.getByText("Shifts").dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ctrlKey: true }));
    expect(state()).toBe("idle");
  });

  it("is hidden from screen readers", () => {
    render(<AdminProgressBar />);
    expect(document.querySelector("[data-slot=admin-progress]")).toHaveAttribute("aria-hidden", "true");
  });
});
