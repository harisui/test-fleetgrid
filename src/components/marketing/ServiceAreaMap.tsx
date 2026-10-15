import { HOME } from "@/content/marketing";

/**
 * A diagram, not a map tile: the two 50-mile launch rings around downtown Houston and
 * Pasadena, the two ring roads, Galveston Bay for bearings, and the places carriers know.
 * Positions come from the ZIP centres (src/data/us-zips.tsv) projected flat: 2.6 units per
 * mile, east and north from downtown Houston. The places sit close together on the ship
 * channel, so each label is pushed to its own side of the cluster and tied to its dot with
 * a short leader line; no two labels share a spot.
 */

const MILE = 2.6;
const HOUSTON = { lat: 29.7594, lng: -95.3594 };

/** Miles east and north of downtown Houston, as SVG units (y grows southward). */
function at(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng - HOUSTON.lng) * 60 * MILE,
    y: -(lat - HOUSTON.lat) * 69 * MILE,
  };
}

/** Miles east and north, for shapes sketched by hand. */
function miles(east: number, north: number): { x: number; y: number } {
  return { x: east * MILE, y: -north * MILE };
}

interface Place {
  name: string;
  x: number;
  y: number;
  /** Where the label sits, in SVG units, with the anchor that keeps it clear of the others. */
  label: { x: number; y: number; anchor: "start" | "middle" | "end" };
}

const PLACES: readonly Place[] = [
  { name: "Houston", ...at(29.7594, -95.3594), label: { x: -8, y: 4, anchor: "end" } },
  { name: "Port of Houston", ...at(29.7301, -95.2663), label: { x: 16, y: -26, anchor: "start" } },
  { name: "Pasadena", ...at(29.7009, -95.1989), label: { x: 22, y: 34, anchor: "end" } },
  { name: "La Porte", ...at(29.6884, -95.0513), label: { x: 56, y: 32, anchor: "start" } },
  { name: "Baytown", ...at(29.7461, -94.9653), label: { x: 70, y: 6, anchor: "start" } },
];

/** The two ring roads, as circles around downtown: Beltway 8 at about 12 miles, the Grand Parkway at about 30. */
const RINGS = [
  { name: "Beltway 8", miles: 12 },
  { name: "Grand Parkway", miles: 30 },
];

/** Galveston Bay, sketched in miles east and north of downtown, from the ship channel mouth to the island. */
const BAY = [
  [22, -2],
  [27, -1],
  [31, -4],
  [36, -6],
  [40, -10],
  [41, -16],
  [38, -22],
  [36, -28],
  [34, -32],
  [29, -33],
  [26, -29],
  [25, -24],
  [22, -18],
  [19, -12],
  [19, -6],
].map(([east, north]) => miles(east, north));

const PASADENA = at(29.7009, -95.1989);
const RADIUS = 50 * MILE;

export function ServiceAreaMap() {
  return (
    <svg
      role="img"
      aria-label={HOME.area.mapLabel}
      viewBox="-150 -150 320 300"
      width={320}
      height={300}
      className="h-auto w-full max-w-md"
      data-slot="service-area-map"
    >
      <title>{HOME.area.mapLabel}</title>
      {/* The launch areas. */}
      {[{ x: 0, y: 0 }, PASADENA].map((center, index) => (
        <circle
          key={index}
          cx={center.x}
          cy={center.y}
          r={RADIUS}
          className="fill-selection-tint stroke-border-strong"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          fillOpacity="0.6"
        />
      ))}
      {/* The bay, so the cluster reads as the ship channel running to the water. */}
      <path
        d={`M${BAY.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join("L")}Z`}
        className="fill-info-subtle stroke-info"
        strokeWidth="1"
        strokeOpacity="0.5"
        data-slot="map-bay"
      />
      <text x={miles(31, -25).x} y={miles(31, -25).y} textAnchor="middle" className="fill-info" fontSize="9" fontStyle="italic">
        Galveston Bay
      </text>
      {/* The ring roads, named on their upper-left arc, away from the labels. */}
      {RINGS.map((ring) => (
        <g key={ring.name}>
          <circle cx="0" cy="0" r={ring.miles * MILE} fill="none" className="stroke-lane-line" strokeWidth="3" />
          <circle cx="0" cy="0" r={ring.miles * MILE} fill="none" className="stroke-border-strong" strokeWidth="1" />
          <text
            x={-ring.miles * MILE * 0.72}
            y={-ring.miles * MILE * 0.72}
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
        const far = Math.hypot(leaderEnd.x - place.x, leaderEnd.y - place.y) > 10;
        return (
          <g key={place.name} data-slot="map-place">
            {far && (
              <line
                x1={place.x}
                y1={place.y}
                x2={leaderEnd.x}
                y2={leaderEnd.y}
                className="stroke-muted-foreground"
                strokeWidth="1"
              />
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
      <text x="-146" y="142" className="fill-muted-foreground" fontSize="10">
        Rings: 50 miles. Not to scale for roads.
      </text>
    </svg>
  );
}
