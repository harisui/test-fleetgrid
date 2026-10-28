import { AppError } from "@/server/errors/AppError";
import type {
  CreateQrLinkInput,
  IQrLinkRepository,
  IQrScanRepository,
  RecordScanInput,
} from "@/server/repositories/QrLinkRepository";
import type { QrLink, QrScan } from "@/types/domain";

/** In-memory stand-in for the QR links: unique slugs, newest first. */
export class FakeQrLinkRepository implements IQrLinkRepository {
  readonly rows = new Map<string, QrLink>();
  private sequence = 0;

  constructor(seed: QrLink[] = []) {
    for (const link of seed) this.rows.set(link.id, link);
  }

  async list(): Promise<QrLink[]> {
    return [...this.rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<QrLink | null> {
    return this.rows.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<QrLink | null> {
    return [...this.rows.values()].find((link) => link.slug === slug) ?? null;
  }

  async create(input: CreateQrLinkInput): Promise<QrLink> {
    if (await this.findBySlug(input.slug)) throw AppError.conflict("Slug in use");
    this.sequence += 1;
    const link: QrLink = {
      id: `aaaaaaaa-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      slug: input.slug,
      locationName: input.locationName,
      campaign: input.campaign,
      targetPath: input.targetPath,
      utmSource: "flyer",
      utmMedium: "qr",
      isActive: true,
      createdBy: input.createdBy,
      createdAt: new Date(Date.UTC(2026, 9, 28, 12, 0, this.sequence)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 9, 28, 12, 0, this.sequence)).toISOString(),
    };
    this.rows.set(link.id, link);
    return link;
  }

  async setActive(id: string, isActive: boolean): Promise<QrLink> {
    const link = this.rows.get(id);
    if (!link) throw AppError.notFound("QR code not found");
    const updated = { ...link, isActive };
    this.rows.set(id, updated);
    return updated;
  }
}

/** In-memory stand-in for the scans, with what was recorded for each. */
export class FakeQrScanRepository implements IQrScanRepository {
  readonly recorded: RecordScanInput[] = [];
  rows: QrScan[] = [];
  private sequence = 0;

  constructor(seed: QrScan[] = []) {
    this.rows = [...seed];
  }

  async record(input: RecordScanInput): Promise<QrScan> {
    this.recorded.push(input);
    this.sequence += 1;
    const scan: QrScan = {
      id: `bbbbbbbb-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      qrLinkId: input.qrLinkId,
      scannedAt: new Date(Date.UTC(2026, 9, 28, 13, 0, this.sequence)).toISOString(),
    };
    this.rows.push(scan);
    return scan;
  }

  async listSince(since?: Date): Promise<QrScan[]> {
    return this.rows
      .filter((scan) => !since || Date.parse(scan.scannedAt) >= since.getTime())
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  }
}
