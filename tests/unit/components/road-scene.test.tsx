import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BODY_PAINTS,
  CAB_PAINTS,
  freshSpawnTimes,
  LANES,
  randomLook,
  ROAD_SPEED,
  RoadScene,
  spawnRoadside,
  spawnTruck,
  STILL_FRAME,
  TRUCK_LENGTH,
  TRUCK_TICK,
  VEHICLES,
} from "@/components/marketing/RoadScene";
import { MOTION_CLASS } from "@/lib/motion";

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

function stubIntersectionObserver() {
  const observers: { callback: IOCallback; observed: Element[] }[] = [];
  class FakeObserver {
    observed: Element[] = [];
    constructor(public callback: IOCallback) {
      observers.push(this);
    }
    observe(element: Element) {
      this.observed.push(element);
    }
    unobserve() {}
    disconnect() {
      this.observed = [];
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return observers;
}

/** A random that always lands in the middle of its range: lane 2, the middle pause. */
const steady = () => 0.5;

const live = () => document.querySelectorAll("[data-slot=road-live] [data-slot=road-mover]");

beforeEach(() => {
  document.documentElement.className = "";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the lanes", () => {
  it("has two oncoming lanes over the centre line and two lanes the camera's way, each with one speed", () => {
    expect(LANES.map((lane) => lane.oncoming)).toEqual([true, true, false, false]);
    expect(LANES.map((lane) => Math.sign(lane.speed))).toEqual([-1, -1, 1, -1]);
    // The inner oncoming lane is the faster one; the fast lane overtakes the camera, the slow lane drifts back.
    expect(Math.abs(LANES[1].speed)).toBeGreaterThan(Math.abs(LANES[0].speed));
    expect(LANES[2].speed).toBeGreaterThan(0);
    expect(Math.abs(LANES[3].speed)).toBeLessThan(ROAD_SPEED);
  });

  it("lets a truck into a lane only once the previous one is clear, so none drive through each other", () => {
    const times = freshSpawnTimes();
    const first = spawnTruck(1, 1_000, times, 1);
    expect(first).toMatchObject({ kind: "truck", lane: 1, from: 580, to: -100 });
    expect(first!.duration).toBeCloseTo(680 / 110);
    expect(first!.endsAt).toBeCloseTo(1_000 + (680 / 110) * 1000);
    expect(spawnTruck(1, 1_100, times, 2)).toBeNull();
    const clear = 1_000 + ((TRUCK_LENGTH + 40) / 110) * 1000;
    expect(spawnTruck(1, clear - 1, times, 2)).toBeNull();
    expect(spawnTruck(1, clear, times, 2)).not.toBeNull();
    // Another lane is free straight away, and a start inside the view shortens the drive.
    const inView = spawnTruck(3, 1_000, times, 3, 120)!;
    expect(inView).toMatchObject({ from: 120, to: -100 });
    expect(inView.duration).toBeCloseTo(220 / 16);
  });

  it("rolls roadside objects by at the road speed with the same clearance rule", () => {
    const times = freshSpawnTimes();
    const yard = spawnRoadside("yard", 0, times, 1)!;
    expect(yard).toMatchObject({ kind: "yard", from: 580, to: -100 });
    expect(yard.duration).toBeCloseTo(680 / ROAD_SPEED);
    expect(spawnRoadside("trees", 1_000, times, 2)).toBeNull();
    expect(spawnRoadside("trees", 2_600, times, 2)).not.toBeNull();
  });
});

describe("RoadScene", () => {
  it("without the motion mark it is the still frame: one of each body, the yard and the trees, nothing live, no observer", () => {
    const observers = stubIntersectionObserver();
    render(<RoadScene random={steady} />);
    const still = document.querySelector("[data-slot=road-static]")!;
    const trucks = still.querySelectorAll("[data-slot=road-truck]");
    expect([...trucks].map((truck) => truck.getAttribute("data-vehicle")).sort()).toEqual([...VEHICLES].sort());
    expect(still.querySelector("[data-slot=road-yard]")).toHaveTextContent("YARD");
    expect(still.querySelector("[data-slot=road-trees]")).not.toBeNull();
    expect(STILL_FRAME.filter((mover) => mover.kind === "truck")).toHaveLength(VEHICLES.length);
    // Oncoming trucks face left.
    expect(trucks[0]).toHaveAttribute("transform", "scale(-1 1)");
    expect(trucks[2]).not.toHaveAttribute("transform");
    expect(live()).toHaveLength(0);
    expect(observers).toHaveLength(0);
    expect(document.querySelector("[data-slot=hero-road]")).toHaveAttribute("aria-hidden", "true");
  });

  it("with motion it starts with traffic once in view, then adds trucks and roadside objects on random ticks", () => {
    document.documentElement.classList.add(MOTION_CLASS);
    const observers = stubIntersectionObserver();
    render(<RoadScene random={steady} />);
    expect(live()).toHaveLength(0);
    expect(observers).toHaveLength(1);

    act(() => observers[0].callback([{ isIntersecting: true }]));
    // Two trucks and the yard sign are already in view on the first frame.
    const first = [...live()].map((el) => ({
      kind: el.getAttribute("data-kind"),
      from: (el as HTMLElement).style.getPropertyValue("--from"),
    }));
    expect(first).toEqual([
      { kind: "truck", from: "300px" },
      { kind: "truck", from: "120px" },
      { kind: "yard", from: "150px" },
    ]);
    expect((live()[0] as HTMLElement).style.getPropertyValue("--duration")).toMatch(/s$/);

    // The steady random picks lane 2 every 1050ms tick; the lane is clear again (64 + 40) / 24 s later.
    act(() => vi.advanceTimersByTime((TRUCK_TICK.min + TRUCK_TICK.max) / 2));
    expect(live()).toHaveLength(4);
    act(() => vi.advanceTimersByTime(1_050));
    expect(live()).toHaveLength(4);
    // t = 4200: the oncoming truck that started at 300 (3.64s drive) has left; lane 2 is still taken.
    act(() => vi.advanceTimersByTime(2_100));
    expect([...live()].map((el) => (el as HTMLElement).style.getPropertyValue("--from"))).not.toContain("300px");
    expect(live()).toHaveLength(3);
    // t = 6300: the yard sign (6.25s) has rolled off, lane 2 is clear and the next truck joins.
    act(() => vi.advanceTimersByTime(2_100));
    expect([...live()].map((el) => el.getAttribute("data-kind"))).toEqual(["truck", "truck", "truck"]);
    // A roadside object arrives on the slower tick (6.5s with the steady random).
    act(() => vi.advanceTimersByTime(1_500));
    expect([...live()].some((el) => el.getAttribute("data-kind") === "warehouse")).toBe(true);
  });

  it("pauses off screen and while the tab is hidden, and resumes without spawning twice", () => {
    document.documentElement.classList.add(MOTION_CLASS);
    const observers = stubIntersectionObserver();
    render(<RoadScene random={steady} />);
    const road = document.querySelector("[data-slot=hero-road]")!;

    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(road).toHaveAttribute("data-paused");
    act(() => vi.advanceTimersByTime(10_000));
    expect(live()).toHaveLength(0);

    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(road).not.toHaveAttribute("data-paused");
    expect(live()).toHaveLength(3);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(road).toHaveAttribute("data-paused");
    act(() => vi.advanceTimersByTime(10_000));
    expect(live()).toHaveLength(3);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(road).not.toHaveAttribute("data-paused");
    // The opening traffic is not added again, and the drives that ended while hidden (the
    // oncoming truck, 3.6s, and the yard, 6.3s) are swept; the slow truck (13.8s) stays.
    expect(live()).toHaveLength(1);
    expect(live()[0]).toHaveAttribute("data-kind", "truck");
    act(() => vi.advanceTimersByTime(1_050));
    expect(live()).toHaveLength(2);
  });

  it("draws every body from the roof: no wheels, a cab with a windshield, and paint from the tokens only", () => {
    render(<RoadScene random={steady} />);
    const still = document.querySelector("[data-slot=road-static]")!;
    for (const truck of still.querySelectorAll("[data-slot=road-truck]")) {
      // Nothing sticks out sideways beyond the mirrors: no wheel rectangles at y -11 or 7 wider than 2.
      const wheels = [...truck.querySelectorAll("rect")].filter(
        (rect) => ["-11", "7"].includes(rect.getAttribute("y") ?? "") && rect.getAttribute("width") !== "2",
      );
      expect(wheels).toHaveLength(0);
      expect(truck.querySelectorAll("rect, circle").length).toBeGreaterThan(3);
      for (const shape of truck.querySelectorAll("rect, circle")) {
        expect(shape.getAttribute("class")).toMatch(/^fill-[a-z-]+( stroke-[a-z-]+)?$/);
        expect(shape).not.toHaveAttribute("fill");
      }
    }
    expect(still.querySelector("[data-vehicle=reefer] rect[x='10']")).toHaveClass("fill-info");
    expect(still.querySelectorAll("[data-vehicle=flatbed] circle")).toHaveLength(6);
    expect(still.querySelectorAll("[data-vehicle=container] rect").length).toBeGreaterThan(10);
    expect(still.querySelector("[data-vehicle=box-truck] rect[width='26']")).toHaveClass("fill-warning");
  });

  it("gives each live truck a random body and paint", () => {
    // Three draws a look (body, cab, paint); a four-value sequence makes each look different.
    const values = [0.05, 0.5, 0.95, 0.3];
    let calls = 0;
    const looks = Array.from({ length: 2 }, () => randomLook(() => values[calls++ % values.length]));
    expect(looks[0]).toEqual({ vehicle: "dry-van", cab: "fill-success", body: "fill-muted-foreground" });
    expect(looks[1]).toEqual({ vehicle: "reefer", cab: "fill-foreground", body: "fill-sign-panel" });
    expect(VEHICLES).toEqual(["dry-van", "reefer", "flatbed", "container", "box-truck"]);
    expect(CAB_PAINTS.length).toBeGreaterThanOrEqual(5);
    expect(BODY_PAINTS.length).toBeGreaterThanOrEqual(5);

    document.documentElement.classList.add(MOTION_CLASS);
    const observers = stubIntersectionObserver();
    render(<RoadScene random={() => 0.95} />);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    const truck = document.querySelector("[data-slot=road-live] [data-slot=road-truck]")!;
    expect(truck).toHaveAttribute("data-vehicle", "box-truck");
    expect(truck.querySelector("rect[width='26']")).toHaveClass("fill-muted-foreground");
  });

  it("runs straight away where there is no IntersectionObserver", () => {
    document.documentElement.classList.add(MOTION_CLASS);
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<RoadScene random={steady} />);
    expect(live()).toHaveLength(3);
  });
});
