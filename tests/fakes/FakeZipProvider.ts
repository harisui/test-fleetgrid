import type { IZipProvider, ZipPlace } from "@/server/providers/ZipProvider";

/** In-memory stand-in for the bundled ZIP dataset. */
export class FakeZipProvider implements IZipProvider {
  readonly calls: string[] = [];

  constructor(private readonly places: ZipPlace[] = []) {}

  find(zip: string): ZipPlace | null {
    this.calls.push(zip);
    return this.places.find((place) => place.zip === zip) ?? null;
  }
}
