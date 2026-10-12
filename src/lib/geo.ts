/** Mean Earth radius in statute miles, the same figure as miles_between() in the database. */
const EARTH_RADIUS_MILES = 3958.7613;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in miles between two points (haversine). Matches the database
 * function miles_between(), so a distance shown on a driver's page agrees with the search.
 */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distance to a tenth of a mile, the way the search reports it. */
export function milesBetweenRounded(lat1: number, lng1: number, lat2: number, lng2: number) {
  return Math.round(milesBetween(lat1, lng1, lat2, lng2) * 10) / 10;
}
