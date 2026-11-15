import { createHash, randomBytes } from "node:crypto";
import { CURRENT_TERMS, TERMS_VERSIONS, type TermsVersion } from "@/content/legal/terms";
import {
  DRIVER_TERMS_MESSAGE,
  DRIVER_TERMS_STATEMENT,
  TERMS_LINK_DAYS,
  TERMS_LINK_PREFIX,
  TERMS_TOKEN_PATTERN,
} from "@/lib/legal/terms-acceptance";
import { quietHoursSendAt } from "@/lib/shifts/schedule";
import { termsLinkText } from "@/lib/shifts/texts";
import { AppError } from "@/server/errors/AppError";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { ITermsAdminRepository, ITermsRepository } from "@/server/repositories/TermsRepository";
import type { ITosRepository } from "@/server/repositories/TosRepository";
import type { TextRecipient, TextService } from "@/server/services/TextService";
import type { DriverAwaitingTerms, Profile, TosAcceptance } from "@/types/domain";

export interface AcceptanceContext {
  ip: string | null;
  userAgent: string | null;
}

/** What the link page shows: the Terms to accept, or why the link no longer works. */
export type TermsLinkState =
  | { status: "valid"; terms: TermsVersion }
  | { status: "used" | "expired" | "not_found" };

export interface TermsOverview {
  /** The version everyone must accept again, or null when there is none. */
  requiredVersion: string | null;
  current: { version: string; effectiveLabel: string };
  awaiting: DriverAwaitingTerms[];
  /** Of those, the ones a text can reach (shift texts on, no STOP). */
  textable: number;
}

/** Archived once per server process: the container is built per request. */
let published: Promise<void> | null = null;

/** Tests only: forget that this process archived the versions. */
export function resetTermsPublished(): void {
  published = null;
}

/**
 * Archives every published version (terms_versions). The database refuses different text under
 * a version already archived, and the hash it stores must match this text's. Runs at server
 * start (instrumentation) and before any acceptance; a failure is retried next time.
 */
export function publishTermsVersions(admin: ITermsAdminRepository): Promise<void> {
  published ??= (async () => {
    for (const entry of TERMS_VERSIONS) {
      const { bodySha256 } = await admin.publish(entry);
      if (bodySha256 !== sha256(entry.body)) {
        throw new Error(`Terms ${entry.version}: the archived text differs from the published one`);
      }
    }
  })().catch((error: unknown) => {
    published = null;
    throw error;
  });
  return published;
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** The version a link or a stored acceptance names, from the published list. */
export function termsVersion(version: string): TermsVersion | null {
  return TERMS_VERSIONS.find((entry) => entry.version === version) ?? null;
}

/**
 * The Terms of Service archive and the driver's acceptance (Milestone 6, part 1).
 *
 * Every version in src/content/legal/terms.ts is archived word for word with its SHA-256
 * (terms_versions, 0041) before anyone can accept it. A driver accepts at sign-up; when a
 * version that needs everyone again is published, existing drivers accept on their next visit
 * (the Terms page) or through a one-time link texted by an admin. Opening a link records
 * nothing; accepting uses it up. Profiles, documents and status never change here.
 */
export class TermsService {
  constructor(
    /** The signed-in user's client (RLS). */
    private readonly tos: ITosRepository,
    private readonly terms: ITermsRepository,
    /** The service role's side, built on demand. */
    private readonly admin: () => ITermsAdminRepository,
    private readonly profiles: IProfileRepository,
    private readonly writeAudit: (entry: AuditEntryInput) => Promise<unknown>,
    /** The one sending path, built on demand (the service role logs every text). */
    private readonly texts: () => TextService,
    /** The public site, for the link in the text: https://fleetgridus.com. */
    private readonly siteUrl: string,
    private readonly now: () => Date = () => new Date(),
    private readonly token: () => string = () => randomBytes(16).toString("base64url"),
  ) {}

  /** Archives every published version (see publishTermsVersions). */
  ensurePublished(): Promise<void> {
    return publishTermsVersions(this.admin());
  }

  /** True when the signed-in driver must accept the Terms before going on. */
  async needsAcceptance(): Promise<boolean> {
    return !(await this.terms.myTermsOk());
  }

  /**
   * The signed-in driver accepts the current Terms: at sign-up (the box on the first screen)
   * or on the Terms page. Recorded with the version, the words, the address and the browser.
   */
  async accept(
    userId: string,
    method: "signup" | "gate",
    accepted: unknown,
    context: AcceptanceContext,
  ): Promise<TosAcceptance> {
    if (accepted !== true) throw AppError.validation(DRIVER_TERMS_MESSAGE, { accepted: DRIVER_TERMS_MESSAGE });
    await this.ensurePublished();
    return this.tos.record({
      profileId: userId,
      version: CURRENT_TERMS.version,
      ip: context.ip,
      userAgent: context.userAgent,
      method,
      statement: DRIVER_TERMS_STATEMENT,
    });
  }

  /** What the link page shows. Opening a link records nothing. */
  async linkState(token: string): Promise<TermsLinkState> {
    if (!TERMS_TOKEN_PATTERN.test(token)) return { status: "not_found" };
    const link = await this.admin().findLink(sha256(token));
    if (!link) return { status: "not_found" };
    if (link.usedAt) return { status: "used" };
    if (new Date(link.expiresAt) <= this.now()) return { status: "expired" };
    const terms = termsVersion(link.version);
    return terms ? { status: "valid", terms } : { status: "not_found" };
  }

  /** The driver ticks the box on the link page and accepts. The link is used up. */
  async acceptByLink(token: string, accepted: unknown, context: AcceptanceContext): Promise<void> {
    if (accepted !== true) throw AppError.validation(DRIVER_TERMS_MESSAGE, { accepted: DRIVER_TERMS_MESSAGE });
    if (!TERMS_TOKEN_PATTERN.test(token)) throw AppError.notFound("This link does not work");
    const { outcome } = await this.admin().acceptByLink({
      tokenHash: sha256(token),
      ip: context.ip,
      userAgent: context.userAgent,
      statement: DRIVER_TERMS_STATEMENT,
    });
    if (outcome === "used") throw AppError.conflict("This link was used already");
    if (outcome === "expired") throw AppError.conflict("This link has expired");
    if (outcome === "not_found") throw AppError.notFound("This link does not work");
  }

  /** The admin's view: which version needs everyone again and who has not accepted it. */
  async overview(adminId: string): Promise<TermsOverview> {
    await this.requireAdmin(adminId);
    await this.ensurePublished();
    const admin = this.admin();
    const [requiredVersion, awaiting] = await Promise.all([admin.requiredVersion(), admin.driversAwaiting()]);
    return {
      requiredVersion,
      current: { version: CURRENT_TERMS.version, effectiveLabel: CURRENT_TERMS.effectiveLabel },
      awaiting,
      textable: awaiting.filter(canText).length,
    };
  }

  /**
   * Texts a fresh one-time link to every driver still waiting who has shift texts on, or to
   * one driver when `driverId` is given. Not between 9 PM and 7 AM Houston time.
   */
  async sendLinks(adminId: string, driverId?: string): Promise<{ sent: number; failed: number }> {
    const admin = await this.requireAdmin(adminId);
    await this.ensurePublished();
    const later = quietHoursSendAt(this.now());
    if (later) throw AppError.conflict("Texts go out between 7 AM and 9 PM Houston time. Try again then.");

    const repo = this.admin();
    const version = await repo.requiredVersion();
    if (!version) throw AppError.conflict("No Terms version needs drivers to accept it again");
    const awaiting = (await repo.driversAwaiting()).filter((driver) => !driverId || driver.driverId === driverId);
    if (driverId && awaiting.length === 0) throw AppError.conflict("This driver has nothing to accept");
    const targets = awaiting.filter(canText);
    if (targets.length === 0) throw AppError.conflict("No driver waiting has shift texts on");

    const texts = this.texts();
    let sent = 0;
    let failed = 0;
    for (const driver of targets) {
      const token = this.token();
      await repo.createLink({
        profileId: driver.profileId,
        version,
        tokenHash: sha256(token),
        expiresAt: new Date(this.now().getTime() + TERMS_LINK_DAYS * 86_400_000).toISOString(),
        createdBy: admin.id,
      });
      const recipient: TextRecipient = { driverId: driver.driverId, phone: driver.phone!, smsOptedOut: driver.smsOptedOut };
      const outcome = await texts.send(recipient, "terms_link", termsLinkText(this.linkFor(token)));
      if (outcome.sent) sent += 1;
      else failed += 1;
      await this.writeAudit({
        adminId: admin.id,
        adminPhone: admin.phone,
        action: "terms_link_sent",
        targetType: "driver",
        targetId: driver.driverId,
        detail: { version, sent: outcome.sent },
      });
    }
    return { sent, failed };
  }

  /** "fleetgridus.com/t/<token>": the host without the scheme, as in the booked text. */
  private linkFor(token: string): string {
    return `${new URL(this.siteUrl).host}${TERMS_LINK_PREFIX}/${token}`;
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin") throw AppError.forbidden();
    return profile;
  }
}

const canText = (driver: DriverAwaitingTerms) => driver.smsOptIn && !driver.smsOptedOut && Boolean(driver.phone);
