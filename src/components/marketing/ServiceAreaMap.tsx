import { HOME } from "@/content/marketing";

/**
 * A diagram, not a map tile: the two 50-mile launch rings around downtown Houston and
 * Pasadena, the two ring roads, Galveston Bay and the ship channel for bearings, and the
 * places carriers know. Positions come from the ZIP centres (src/data/us-zips.tsv)
 * projected flat: 3.2 units per mile, east and north from downtown Houston. The places sit
 * close together along the ship channel, so each label is pushed to its own side and tied
 * to its dot with a leader line; no two labels share a spot. The caption sits under the
 * drawing, clear of the rings.
 */

const MILE = 3.2;
const HOUSTON = { lat: 29.7594, lng: -95.3594 };

/** Miles east and north of downtown Houston, as SVG units (y grows southward). */
function at(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng - HOUSTON.lng) * 60 * MILE,
    y: -(lat - HOUSTON.lat) * 69 * MILE,
  };
}

interface Place {
  name: string;
  x: number;
  y: number;
  /** Where the label sits, in SVG units, with the anchor that keeps it clear of the others. */
  label: { x: number; y: number; anchor: "start" | "middle" | "end" };
}

const PLACES: readonly Place[] = [
  { name: "Houston", ...at(29.7594, -95.3594), label: { x: -10, y: 4, anchor: "end" } },
  { name: "Port of Houston", ...at(29.7301, -95.2663), label: { x: 10, y: -30, anchor: "start" } },
  { name: "Pasadena", ...at(29.7009, -95.1989), label: { x: 26, y: 38, anchor: "middle" } },
  { name: "La Porte", ...at(29.6884, -95.0513), label: { x: 72, y: 40, anchor: "start" } },
  { name: "Baytown", ...at(29.7461, -94.9653), label: { x: 86, y: 6, anchor: "start" } },
];

/** The two ring roads, as circles around downtown: Beltway 8 at about 12 miles, the Grand Parkway at about 30. */
const RINGS = [
  { name: "Beltway 8", miles: 12 },
  { name: "Grand Parkway", miles: 30 },
];

/**
 * Galveston Bay with Trinity Bay, traced clockwise from Morgan's Point: Baytown's shore,
 * Anahuac, Smith Point, Bolivar, Galveston, Texas City, San Leon, Kemah and Seabrook.
 */
const BAY_SHORE: readonly [number, number][] = [
  [29.68, -95.0],
  [29.72, -94.95],
  [29.74, -94.9],
  [29.75, -94.82],
  [29.77, -94.72],
  [29.74, -94.66],
  [29.66, -94.68],
  [29.58, -94.72],
  [29.53, -94.78],
  [29.44, -94.74],
  [29.36, -94.76],
  [29.3, -94.8],
  [29.32, -94.88],
  [29.38, -94.9],
  [29.44, -94.92],
  [29.49, -94.95],
  [29.54, -95.0],
  [29.56, -95.02],
  [29.6, -95.0],
  [29.65, -95.0],
];
const BAY = BAY_SHORE.map(([lat, lng]) => at(lat, lng));
const GALVESTON = at(29.3, -94.8);
/** The bay's name sits off its east shore, where there is room for it. */
const BAY_LABEL = at(29.5, -94.7);

/** The Houston Ship Channel: from the turning basin past Pasadena to Morgan's Point. */
const CHANNEL = [at(29.7301, -95.2663), at(29.72, -95.2), at(29.71, -95.12), at(29.69, -95.04), at(29.68, -95.0)];

const PASADENA = at(29.7009, -95.1989);
const RADIUS = 50 * MILE;

/** Through two points, as one path. */
function pathThrough(points: readonly { x: number; y: number }[], close = false) {
  return `M${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("L")}${close ? "Z" : ""}`;
}

export function ServiceAreaMap() {
  return (
    <figure className="flex w-full max-w-md flex-col gap-2" data-slot="service-area-figure">
      <svg
        role="img"
        aria-label={HOME.area.mapLabel}
        viewBox="-180 -176 390 364"
        width={390}
        height={364}
        className="h-auto w-full"
        data-slot="service-area-map"
      >
        <title>{HOME.area.mapLabel}</title>
        {/* The launch areas: 50 miles around each centre, the overlap reading darker. */}
        {[{ x: 0, y: 0 }, PASADENA].map((center, index) => (
          <circle
            key={index}
            cx={center.x}
            cy={center.y}
            r={RADIUS}
            className="fill-selection-tint stroke-border-strong"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            fillOpacity="0.5"
          />
        ))}
        {/* Each ring named just inside its own edge: Houston's at the top, Pasadena's at the bottom. */}
        <text x={0} y={-RADIUS + 13} textAnchor="middle" className="fill-muted-foreground" fontSize="9.5" fontWeight="600">
          50 miles from Houston
        </text>
        <text
          x={PASADENA.x}
          y={PASADENA.y + RADIUS - 6}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="9.5"
          fontWeight="600"
        >
          50 miles from Pasadena
        </text>

        {/* The water: the bay and the ship channel out to it. */}
        <path d={pathThrough(BAY, true)} className="fill-info-subtle stroke-info" strokeWidth="1" strokeOpacity="0.6" data-slot="map-bay" />
        <path d={pathThrough(CHANNEL)} fill="none" className="stroke-info" strokeWidth="2.5" strokeOpacity="0.5" strokeLinecap="round" data-slot="map-channel" />
        <text x={BAY_LABEL.x} y={BAY_LABEL.y} textAnchor="start" className="fill-info" fontSize="9" fontStyle="italic">
          Galveston Bay
        </text>
        <circle cx={GALVESTON.x} cy={GALVESTON.y} r="2.5" className="fill-muted-foreground" />
        <text x={GALVESTON.x + 5} y={GALVESTON.y + 3} className="fill-muted-foreground" fontSize="9">
          Galveston
        </text>

        {/* The ring roads, named on their upper-left arc, away from the labels. */}
        {RINGS.map((ring) => (
          <g key={ring.name}>
            <circle cx="0" cy="0" r={ring.miles * MILE} fill="none" className="stroke-lane-line" strokeWidth="3" />
            <circle cx="0" cy="0" r={ring.miles * MILE} fill="none" className="stroke-border-strong" strokeWidth="1" />
            <text
              x={-ring.miles * MILE * 0.72}
              y={-ring.miles * MILE * 0.72 - 2}
              textAnchor="end"
              className="fill-muted-foreground font-heading uppercase"
              fontSize="10"
              fontWeight="600"
              letterSpacing="0.08em"
            >
              {ring.name}
            </text>
          </g>
        ))}

        {/* The places: a dot, a leader line and a label on its own side. */}
        {PLACES.map((place) => {
          const labelEdge = {
            start: place.label.x - 3,
            middle: place.label.x,
            end: place.label.x + 3,
          }[place.label.anchor];
          const leaderEnd = { x: labelEdge, y: place.label.y - 4 };
          const far = Math.hypot(leaderEnd.x - place.x, leaderEnd.y - place.y) > 12;
          return (
            <g key={place.name} data-slot="map-place">
              {far && (
                <line x1={place.x} y1={place.y} x2={leaderEnd.x} y2={leaderEnd.y} className="stroke-muted-foreground" strokeWidth="1" />
              )}
              <circle cx={place.x} cy={place.y} r="4.5" className="fill-foreground stroke-background" strokeWidth="1.5" />
              <text
                x={place.label.x}
                y={place.label.y}
                textAnchor={place.label.anchor}
                className="fill-foreground"
                fontSize="11"
                fontWeight="600"
                paintOrder="stroke"
                strokeWidth="3"
                strokeLinejoin="round"
                stroke="var(--background)"
              >
                {place.name}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-small leading-small text-muted-foreground">
        Rings: 50 miles from downtown Houston and from Pasadena. Roads and the shoreline are drawn for bearings, not to scale.
      </figcaption>
    </figure>
  );
}
