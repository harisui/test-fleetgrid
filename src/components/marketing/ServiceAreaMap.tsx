import { HOME } from "@/content/marketing";

/**
 * A diagram, not a map tile: the two 50-mile launch rings around downtown Houston and
 * Pasadena, with the places carriers know inside them. Positions come from the ZIP centres
 * (src/data/us-zips.tsv) projected flat: 2 units per mile, east and north from Houston.
 */

const MILE = 2;
const HOUSTON = { lat: 29.7594, lng: -95.3594 };

/** Miles east and north of downtown Houston, as SVG units (y grows southward). */
function at(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng - HOUSTON.lng) * 60 * MILE,
    y: -(lat - HOUSTON.lat) * 69 * MILE,
  };
}

const PLACES = [
  { name: "Houston", ...at(29.7594, -95.3594), anchor: "end" as const, dx: -8, dy: -6 },
  { name: "Pasadena", ...at(29.7009, -95.1989), anchor: "start" as const, dx: 6, dy: 16 },
  { name: "Port of Houston", ...at(29.7301, -95.2663), anchor: "start" as const, dx: 6, dy: -6 },
  { name: "La Porte", ...at(29.6884, -95.0513), anchor: "start" as const, dx: 6, dy: 4 },
  { name: "Baytown", ...at(29.7461, -94.9653), anchor: "start" as const, dx: 6, dy: -4 },
];

/** The two ring roads, as circles around downtown: Beltway 8 at about 12 miles, the Grand Parkway at about 30. */
const RINGS = [
  { name: "Beltway 8", miles: 12 },
  { name: "Grand Parkway", miles: 30 },
];

const PASADENA = at(29.7009, -95.1989);
const RADIUS = 50 * MILE;

export function ServiceAreaMap() {
  return (
    <svg
      role="img"
      aria-label={HOME.area.mapLabel}
      viewBox="-150 -140 320 280"
      width={320}
      height={280}
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
      {/* The ring roads. */}
      {RINGS.map((ring) => (
        <g key={ring.name}>
          <circle cx="0" cy="0" r={ring.miles * MILE} fill="none" className="stroke-lane-line" strokeWidth="3" />
          <circle cx="0" cy="0" r={ring.miles * MILE} fill="none" className="stroke-border-strong" strokeWidth="1" />
          <text
            x={ring.miles * MILE * 0.72}
            y={-ring.miles * MILE * 0.72}
            className="fill-muted-foreground font-heading uppercase"
            fontSize="10"
            fontWeight="600"
            letterSpacing="0.08em"
          >
            {ring.name}
          </text>
        </g>
      ))}
      {/* The places. */}
      {PLACES.map((place) => (
        <g key={place.name}>
          <circle cx={place.x} cy={place.y} r="4" className="fill-foreground" />
          <text
            x={place.x + place.dx}
            y={place.y + place.dy}
            textAnchor={place.anchor}
            className="fill-foreground"
            fontSize="11"
            fontWeight="600"
          >
            {place.name}
          </text>
        </g>
      ))}
      <text x="-146" y="130" className="fill-muted-foreground" fontSize="10">
        Rings: 50 miles. Not to scale for roads.
      </text>
    </svg>
  );
}
