"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MOTION_CLASS } from "@/lib/motion";

/**
 * The hero's highway, seen from above with the camera riding along it. The ground and the
 * lane dashes scroll left at the road speed (globals.css, `road-scroll`), and trucks drive
 * by: two oncoming lanes across the centre line, a fast lane that overtakes the camera and a
 * slow lane the camera overtakes. Each truck gets a random body (dry van, reefer, flatbed,
 * container on a chassis, or a Class B box truck) and random paint from the theme tokens.
 * A yard sign, a warehouse or a stand of trees passes on the shoulder now and then. Each
 * lane has one speed, and a truck joins a lane only once the previous one is clear of it, so
 * nothing ever drives through anything.
 *
 * The server HTML is a still frame with four trucks and the yard sign. With the page marked
 * for motion the still frame is hidden, the ground starts rolling and the scheduler spawns
 * movers at random moments, pausing while the scene is off screen or the tab is hidden.
 * Reduced motion never marks the page, so it keeps the still frame.
 */

export const ROAD_WIDTH = 480;
export const ROAD_HEIGHT = 320;
/** Ground speed, in viewBox units per second. */
export const ROAD_SPEED = 40;
/** The scrolling ground repeats every 168 units (the grid's 24 and the dashes' 14 both divide it). */
export const ROAD_PERIOD = 168;
export const ROAD_TOP = 176;
export const ROAD_BOTTOM = 288;
export const TRUCK_LENGTH = 64;
/** Clear road between two trucks in the same lane. */
const TRUCK_GAP = 40;
/** Start and end this far off the sides, so a truck is whole before it shows. */
const OFFSCREEN = 100;

export interface Lane {
  y: number;
  /** Speed relative to the camera: negative drifts left, positive drives right. */
  speed: number;
  oncoming: boolean;
}

/** Four lanes, top to bottom: outer and inner oncoming, then the fast lane and the slow lane. */
export const LANES: readonly Lane[] = [
  { y: 190, speed: -80, oncoming: true },
  { y: 218, speed: -110, oncoming: true },
  { y: 246, speed: 24, oncoming: false },
  { y: 274, speed: -16, oncoming: false },
];

export type RoadsideKind = "yard" | "warehouse" | "trees";
const ROADSIDE_WIDTH: Record<RoadsideKind, number> = { yard: 64, warehouse: 96, trees: 72 };
const ROADSIDE_KINDS: readonly RoadsideKind[] = ["yard", "warehouse", "trees"];

/**
 * The bodies on the road: the four kinds of equipment the sign-up asks about, pulled by a
 * Class A tractor, and a straight box truck for Class B.
 */
export type VehicleKind = "dry-van" | "reefer" | "flatbed" | "container" | "box-truck";
export const VEHICLES: readonly VehicleKind[] = ["dry-van", "reefer", "flatbed", "container", "box-truck"];

/** Paint comes from the theme tokens, so every truck holds in light and dark. */
export const CAB_PAINTS = [
  "fill-foreground",
  "fill-progress-fill",
  "fill-info",
  "fill-success",
  "fill-destructive",
  "fill-sign-panel",
] as const;
export const BODY_PAINTS = [
  "fill-progress-fill",
  "fill-info",
  "fill-success",
  "fill-sign-panel",
  "fill-warning",
  "fill-muted-foreground",
] as const;

export interface Look {
  vehicle: VehicleKind;
  cab: (typeof CAB_PAINTS)[number];
  body: (typeof BODY_PAINTS)[number];
}

export interface Mover {
  id: number;
  kind: "truck" | RoadsideKind;
  lane: number;
  from: number;
  to: number;
  /** Seconds. */
  duration: number;
  /** When the drive is over (ms, Date.now), and the mover can go. */
  endsAt: number;
  look?: Look;
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

export function randomLook(random: () => number): Look {
  return { vehicle: pick(random, VEHICLES), cab: pick(random, CAB_PAINTS), body: pick(random, BODY_PAINTS) };
}

export interface SpawnTimes {
  /** Earliest moment (ms) each lane accepts the next truck. */
  lanes: number[];
  roadside: number;
}

/** Spawn pauses, in ms: a truck tick and a roadside object. */
export const TRUCK_TICK = { min: 500, max: 1600 };
export const ROADSIDE_TICK = { min: 4000, max: 9000 };

function between(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

function travel(speed: number, startX?: number) {
  const left = -OFFSCREEN;
  const right = ROAD_WIDTH + OFFSCREEN;
  const from = startX ?? (speed > 0 ? left : right);
  const to = speed > 0 ? right : left;
  return { from, to, duration: Math.abs(to - from) / Math.abs(speed) };
}

/** A truck in a lane, with a random body and paint. Returns null when the lane is not clear yet. */
export function spawnTruck(
  lane: number,
  now: number,
  times: SpawnTimes,
  id: number,
  startX?: number,
  random: () => number = Math.random,
): Mover | null {
  if (now < times.lanes[lane]) return null;
  const { speed } = LANES[lane];
  const { from, to, duration } = travel(speed, startX);
  // The lane is clear once this truck and the gap behind it have passed the entry edge.
  times.lanes[lane] = now + ((TRUCK_LENGTH + TRUCK_GAP) / Math.abs(speed)) * 1000;
  return { id, kind: "truck", lane, from, to, duration, endsAt: now + duration * 1000, look: randomLook(random) };
}

/** Something on the shoulder, rolling by at the road speed. */
export function spawnRoadside(kind: RoadsideKind, now: number, times: SpawnTimes, id: number, startX?: number): Mover | null {
  if (now < times.roadside) return null;
  const { from, to, duration } = travel(-ROAD_SPEED, startX);
  times.roadside = now + ((ROADSIDE_WIDTH[kind] + TRUCK_GAP) / ROAD_SPEED) * 1000;
  return { id, kind, lane: -1, from, to, duration, endsAt: now + duration * 1000 };
}

export function freshSpawnTimes(): SpawnTimes {
  return { lanes: LANES.map(() => 0), roadside: 0 };
}

const DEFAULT_LOOK: Look = { vehicle: "dry-van", cab: "fill-foreground", body: "fill-progress-fill" };

/** A Class A tractor from above: roof with its sleeper seam, windshield, mirrors, facing right. */
function Tractor({ paint, x }: { paint: Look["cab"]; x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x={0} y={-8} width={16} height={16} rx={3} className={paint} />
      <rect x={2} y={-6} width={7} height={12} rx={1.5} className="fill-background" opacity={0.18} />
      <rect x={9} y={-6} width={4} height={12} rx={1} className="fill-background" opacity={0.85} />
      <rect x={5} y={-11} width={2} height={3} className={paint} />
      <rect x={5} y={8} width={2} height={3} className={paint} />
    </g>
  );
}

/** The trailer or body behind the cab, in the roof view: no wheels show from above. */
function Body({ look }: { look: Look }) {
  switch (look.vehicle) {
    case "reefer":
      return (
        <g>
          {/* A white box with the reefer unit on its nose and a roof rib. */}
          <rect x={-32} y={-9} width={46} height={18} rx={2} className="fill-card stroke-border-strong" strokeWidth={1} />
          <rect x={-30} y={-0.5} width={38} height={1} className="fill-border-strong" />
          <rect x={10} y={-7} width={5} height={14} rx={1} className={look.body} />
        </g>
      );
    case "flatbed":
      return (
        <g>
          {/* A low deck with three strapped coils. */}
          <rect x={-32} y={-7} width={46} height={14} rx={1} className="fill-sign-panel-muted" />
          {[-24, -10, 4].map((x) => (
            <g key={x}>
              <circle cx={x} cy={0} r={6} className={look.body} />
              <circle cx={x} cy={0} r={2} className="fill-background" opacity={0.6} />
              <rect x={x - 1} y={-8} width={2} height={16} className="fill-foreground" opacity={0.5} />
            </g>
          ))}
        </g>
      );
    case "container":
      return (
        <g>
          {/* A container on its chassis: corrugated roof, corner castings. */}
          <rect x={-30} y={-3} width={44} height={6} className="fill-foreground" opacity={0.7} />
          <rect x={-32} y={-9} width={42} height={18} className={look.body} />
          {Array.from({ length: 9 }, (_, index) => -29 + index * 4.5).map((x) => (
            <rect key={x} x={x} y={-8} width={1} height={16} className="fill-foreground" opacity={0.22} />
          ))}
          {[-32, 8].map((x) =>
            [-9, 7].map((y) => <rect key={`${x}${y}`} x={x} y={y} width={2} height={2} className="fill-foreground" opacity={0.6} />),
          )}
        </g>
      );
    case "box-truck":
      return (
        // A Class B straight truck: the box sits right behind a shorter cab.
        <rect x={-12} y={-8} width={26} height={16} rx={2} className={look.body} />
      );
    default:
      return (
        <g>
          {/* The dry van, with its roof seam and the rear door split. */}
          <rect x={-32} y={-9} width={46} height={18} rx={2} className={look.body} />
          <rect x={-30} y={-0.5} width={42} height={1} className="fill-background" opacity={0.35} />
          <rect x={-31} y={-7} width={1} height={14} className="fill-background" opacity={0.35} />
        </g>
      );
  }
}

/** A truck from above, 64 long, facing right. The look picks the body and the paint. */
function Truck({ flip, look = DEFAULT_LOOK }: { flip?: boolean; look?: Look }) {
  const boxTruck = look.vehicle === "box-truck";
  return (
    <g transform={flip ? "scale(-1 1)" : undefined} data-slot="road-truck" data-vehicle={look.vehicle}>
      {/* The shadow, offset down and right. */}
      <rect
        x={boxTruck ? -10 : -30}
        y={-6}
        width={boxTruck ? 42 : 62}
        height={18}
        rx={3}
        className="fill-foreground"
        opacity={0.12}
      />
      <Body look={look} />
      <Tractor paint={look.cab} x={16} />
    </g>
  );
}

/** A thing on the shoulder, drawn with its bottom edge on the roadside line. */
function Roadside({ kind }: { kind: RoadsideKind }) {
  if (kind === "yard") {
    return (
      <g data-slot="road-yard">
        <rect x={0} y={-44} width={64} height={40} rx={4} className="fill-sign-panel" />
        <rect x={0} y={-44} width={64} height={4} className="fill-sign-panel-border" />
        <text
          x={32}
          y={-18}
          textAnchor="middle"
          className="fill-sign-panel-foreground font-heading"
          fontSize="14"
          fontWeight="700"
        >
          YARD
        </text>
        <rect x={28} y={-4} width={8} height={4} className="fill-sign-panel" />
      </g>
    );
  }
  if (kind === "warehouse") {
    return (
      <g data-slot="road-warehouse">
        <rect x={0} y={-36} width={96} height={36} rx={2} className="fill-muted stroke-border-strong" strokeWidth={1} />
        <rect x={0} y={-36} width={96} height={6} className="fill-sign-panel" />
        {[10, 38, 66].map((x) => (
          <rect key={x} x={x} y={-20} width={20} height={20} rx={1} className="fill-sign-panel-muted" opacity={0.7} />
        ))}
      </g>
    );
  }
  return (
    <g data-slot="road-trees">
      {[12, 36, 60].map((cx, index) => (
        <g key={cx}>
          <circle cx={cx + 2} cy={-12 + 2} r={index === 1 ? 14 : 11} className="fill-foreground" opacity={0.1} />
          <circle cx={cx} cy={-12} r={index === 1 ? 14 : 11} className="fill-success" opacity={0.75} />
        </g>
      ))}
    </g>
  );
}

function MoverView({ mover, animated }: { mover: Mover; animated: boolean }) {
  const y = mover.kind === "truck" ? LANES[mover.lane].y : ROAD_TOP - 4;
  const style = animated
    ? ({ "--from": `${mover.from}px`, "--to": `${mover.to}px`, "--duration": `${mover.duration}s` } as CSSProperties)
    : ({ transform: `translateX(${mover.from}px)` } as CSSProperties);
  return (
    <g transform={`translate(0 ${y})`}>
      <g data-slot={animated ? "road-mover" : undefined} data-kind={mover.kind} style={style}>
        {mover.kind === "truck" ? (
          <Truck flip={LANES[mover.lane].oncoming} look={mover.look} />
        ) : (
          <Roadside kind={mover.kind} />
        )}
      </g>
    </g>
  );
}

/** The still frame: what the page shows without motion, and what the HTML carries. */
export const STILL_FRAME: readonly Mover[] = [
  { id: 1, kind: "truck", lane: 0, from: 96, to: 96, duration: 0, endsAt: 0, look: { vehicle: "reefer", cab: "fill-info", body: "fill-info" } },
  { id: 2, kind: "truck", lane: 1, from: 330, to: 330, duration: 0, endsAt: 0, look: { vehicle: "container", cab: "fill-foreground", body: "fill-success" } },
  { id: 3, kind: "truck", lane: 2, from: 212, to: 212, duration: 0, endsAt: 0, look: { vehicle: "dry-van", cab: "fill-foreground", body: "fill-progress-fill" } },
  { id: 4, kind: "truck", lane: 3, from: 70, to: 70, duration: 0, endsAt: 0, look: { vehicle: "flatbed", cab: "fill-destructive", body: "fill-muted-foreground" } },
  { id: 5, kind: "truck", lane: 3, from: 400, to: 400, duration: 0, endsAt: 0, look: { vehicle: "box-truck", cab: "fill-progress-fill", body: "fill-warning" } },
  { id: 6, kind: "yard", lane: -1, from: 150, to: 150, duration: 0, endsAt: 0 },
  { id: 7, kind: "trees", lane: -1, from: 30, to: 30, duration: 0, endsAt: 0 },
];

interface RoadSceneProps {
  /** Injected by tests for a predictable schedule. */
  random?: () => number;
  className?: string;
}

export function RoadScene({ random = Math.random, className }: RoadSceneProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [movers, setMovers] = useState<Mover[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = svg.current;
    if (!element || !document.documentElement.classList.contains(MOTION_CLASS)) return;

    const times = freshSpawnTimes();
    let nextId = 1;
    let inView = typeof IntersectionObserver === "undefined";
    let truckTimer: ReturnType<typeof setTimeout> | undefined;
    let roadsideTimer: ReturnType<typeof setTimeout> | undefined;

    // Movers leave by their end time rather than animationend: the time is known at spawn,
    // and a drive paused off screen is simply over by the time the scene is back.
    const add = (mover: Mover | null) => {
      if (mover) setMovers((current) => [...current, mover]);
    };
    const sweep = () => {
      const now = Date.now();
      setMovers((current) => (current.some((mover) => mover.endsAt <= now) ? current.filter((mover) => mover.endsAt > now) : current));
    };
    const running = () => inView && document.visibilityState === "visible";

    const truckTick = () => {
      truckTimer = undefined;
      if (!running()) return;
      sweep();
      add(spawnTruck(Math.floor(random() * LANES.length), Date.now(), times, nextId++, undefined, random));
      truckTimer = setTimeout(truckTick, between(random, TRUCK_TICK.min, TRUCK_TICK.max));
    };
    const roadsideTick = () => {
      roadsideTimer = undefined;
      if (!running()) return;
      add(spawnRoadside(ROADSIDE_KINDS[Math.floor(random() * ROADSIDE_KINDS.length)], Date.now(), times, nextId++));
      roadsideTimer = setTimeout(roadsideTick, between(random, ROADSIDE_TICK.min, ROADSIDE_TICK.max));
    };

    let started = false;
    const start = () => {
      if (!started) {
        // The first frame already has traffic: two trucks and the yard sign in view.
        started = true;
        const now = Date.now();
        add(spawnTruck(1, now, times, nextId++, 300, random));
        add(spawnTruck(3, now, times, nextId++, 120, random));
        add(spawnRoadside("yard", now, times, nextId++, 150));
      }
      if (!truckTimer) truckTimer = setTimeout(truckTick, between(random, TRUCK_TICK.min, TRUCK_TICK.max));
      if (!roadsideTimer) roadsideTimer = setTimeout(roadsideTick, between(random, ROADSIDE_TICK.min, ROADSIDE_TICK.max));
    };
    const sync = () => {
      if (running()) {
        setPaused(false);
        sweep();
        start();
      } else {
        setPaused(true);
      }
    };

    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            sync();
          });
    observer?.observe(element);
    document.addEventListener("visibilitychange", sync);
    if (!observer) sync();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      if (truckTimer) clearTimeout(truckTimer);
      if (roadsideTimer) clearTimeout(roadsideTimer);
    };
  }, [random]);

  return (
    <svg
      ref={svg}
      aria-hidden="true"
      viewBox={`0 0 ${ROAD_WIDTH} ${ROAD_HEIGHT}`}
      width={ROAD_WIDTH}
      height={ROAD_HEIGHT}
      className={className}
      data-slot="hero-road"
      data-paused={paused ? "" : undefined}
    >
      <defs>
        <pattern id="road-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" className="stroke-border" strokeWidth="1" />
        </pattern>
        <clipPath id="road-clip">
          <rect x="0" y="0" width={ROAD_WIDTH} height={ROAD_HEIGHT} />
        </clipPath>
      </defs>

      <g clipPath="url(#road-clip)">
        {/* The ground and the lane dashes, one period wider than the view, rolling left. */}
        <g data-slot="road-world">
          <rect x="0" y="0" width={ROAD_WIDTH + ROAD_PERIOD} height={ROAD_HEIGHT} fill="url(#road-grid)" />
          <rect x="0" y={ROAD_TOP} width={ROAD_WIDTH + ROAD_PERIOD} height={ROAD_BOTTOM - ROAD_TOP} className="fill-selection" />
          {[204, 260].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2={ROAD_WIDTH + ROAD_PERIOD}
              y2={y}
              className="stroke-lane-line"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
          ))}
        </g>
        {/* The edges and the double centre line stay put: they run along the camera. */}
        {[ROAD_TOP + 4, ROAD_BOTTOM - 4].map((y) => (
          <line key={y} x1="0" y1={y} x2={ROAD_WIDTH} y2={y} className="stroke-lane-line" strokeWidth="2" />
        ))}
        {[230, 234].map((y) => (
          <line key={y} x1="0" y1={y} x2={ROAD_WIDTH} y2={y} className="stroke-progress-fill" strokeWidth="1.5" />
        ))}

        <g data-slot="road-static">
          {STILL_FRAME.map((mover) => (
            <MoverView key={mover.id} mover={mover} animated={false} />
          ))}
        </g>
        <g data-slot="road-live">
          {movers.map((mover) => (
            <MoverView key={mover.id} mover={mover} animated />
          ))}
        </g>
      </g>
    </svg>
  );
}
