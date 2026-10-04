import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ZipPlace {
  zip: string;
  city: string;
  state: string;
  /** Centre of the ZIP area, decimal degrees. */
  lat: number;
  lng: number;
}

export interface IZipProvider {
  find(zip: string): ZipPlace | null;
}

/** Repo-relative path of the bundled dataset. */
export const ZIP_DATA_PATH = "src/data/us-zips.tsv";

/**
 * Reads the bundled US ZIP dataset (GeoNames, CC BY 4.0) into memory the first time it is
 * needed. 41,000 rows of zip, city, state, latitude and longitude, about 1 MB, server only.
 * The data goes stale slowly, which is why the driver can always edit the city and state it
 * fills in.
 */
export class FileZipProvider implements IZipProvider {
  private places: Map<string, ZipPlace> | null = null;

  constructor(private readonly path = resolve(process.cwd(), ZIP_DATA_PATH)) {}

  find(zip: string): ZipPlace | null {
    return this.load().get(zip) ?? null;
  }

  private load(): Map<string, ZipPlace> {
    if (this.places) return this.places;
    const places = new Map<string, ZipPlace>();
    for (const line of readFileSync(this.path, "utf8").split("\n")) {
      if (!line) continue;
      const [zip, city, state, lat, lng] = line.split("\t");
      places.set(zip, { zip, city, state, lat: Number(lat), lng: Number(lng) });
    }
    this.places = places;
    return places;
  }
}
