import { hashIp } from "@/lib/qr/hash";
import { redirectPathFor, shortLinkUrl, UNTAGGED_FALLBACK } from "@/lib/qr/links";
import {
  createQrLinkSchema,
  qrLinkIdSchema,
  setQrLinkActiveSchema,
  slugFor,
  SLUG_MESSAGE,
  SLUG_TAKEN_MESSAGE,
} from "@/lib/validation/qr.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { IQrLinkRepository, IQrScanRepository } from "@/server/repositories/QrLinkRepository";
import type { Profile, QrLink } from "@/types/domain";

export interface QrServiceOptions {
  /** The site's canonical host, for the short link people type and the code encodes. */
  siteUrl: string;
  ipHashSalt?: string;
  now?: () => Date;
}

/** The outcome of a scan: where to send the visitor. */
export interface ScanOutcome {
  /** A relative path. */
  to: string;
  /** True when the code was known and active, so the scan was logged. */
  tagged: boolean;
}

/**
 * The QR codes on the flyers (Milestone 3, part 3): an admin makes one per location, the
 * printed code carries the short link, and a scan is logged and sent on with the UTM tags.
 * Activating or deactivating a code is written to the audit log.
 */
export class QrService {
  constructor(
    private readonly links: IQrLinkRepository,
    private readonly scans: IQrScanRepository,
    private readonly profiles: IProfileRepository,
    private readonly audit: (entry: AuditEntryInput) => Promise<unknown>,
    private readonly options: QrServiceOptions,
  ) {}

  shortLink(link: Pick<QrLink, "slug">): string {
    return shortLinkUrl(this.options.siteUrl, link.slug);
  }

  async listLinks(adminId: string): Promise<QrLink[]> {
    await this.requireAdmin(adminId);
    return this.links.list();
  }

  async getLink(adminId: string, input: unknown): Promise<QrLink> {
    await this.requireAdmin(adminId);
    const { qrLinkId } = parseInput(qrLinkIdSchema, input);
    const link = await this.links.findById(qrLinkId);
    if (!link) throw AppError.notFound("QR code not found");
    return link;
  }

  /** Makes a code. The slug comes from the location name unless given; it must be unused. */
  async createLink(adminId: string, input: unknown): Promise<QrLink> {
    const admin = await this.requireAdmin(adminId);
    const data = parseInput(createQrLinkSchema, input);
    const slug = slugFor(data);
    if (!slug || slug.length < 2) throw AppError.validation(SLUG_MESSAGE, { slug: SLUG_MESSAGE });
    if (await this.links.findBySlug(slug)) {
      throw AppError.validation(SLUG_TAKEN_MESSAGE, { slug: SLUG_TAKEN_MESSAGE });
    }
    const link = await this.links.create({
      slug,
      locationName: data.locationName,
      campaign: data.campaign,
      targetPath: data.targetPath,
      createdBy: admin.id,
    });
    await this.audit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: "qr_link_created",
      targetType: "qr_link",
      targetId: link.id,
      detail: { slug: link.slug, locationName: link.locationName, campaign: link.campaign },
    });
    return link;
  }

  /** Switches a code off (a scan then lands on the untagged home page) or on again. */
  async setActive(adminId: string, input: unknown): Promise<QrLink> {
    const admin = await this.requireAdmin(adminId);
    const { qrLinkId, isActive } = parseInput(setQrLinkActiveSchema, input);
    const existing = await this.links.findById(qrLinkId);
    if (!existing) throw AppError.notFound("QR code not found");
    if (existing.isActive === isActive) return existing;
    const link = await this.links.setActive(qrLinkId, isActive);
    await this.audit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: isActive ? "qr_link_activated" : "qr_link_deactivated",
      targetType: "qr_link",
      targetId: link.id,
      detail: { slug: link.slug, locationName: link.locationName },
    });
    return link;
  }

  /**
   * A visit to /q/<slug>, from anyone: a known, active code logs the scan (address hashed)
   * and sends the visitor to the code's page with the tags; anything else lands on the home
   * page, untagged and unlogged.
   */
  async resolveScan(input: { slug: string; ip: string | null; userAgent: string | null }): Promise<ScanOutcome> {
    const link = await this.links.findBySlug(input.slug.trim().toLowerCase());
    if (!link || !link.isActive) return { to: UNTAGGED_FALLBACK, tagged: false };
    await this.scans.record({
      qrLinkId: link.id,
      ipHash: hashIp(input.ip, this.options.ipHashSalt),
      userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    });
    return { to: redirectPathFor(link), tagged: true };
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only FleetGrid staff can do this");
    }
    return profile;
  }
}
