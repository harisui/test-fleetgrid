"use client";

import { format } from "date-fns";
import { ExternalLink, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DetailSheet } from "@/components/admin/DetailSheet";
import { DocReminderButton } from "@/components/admin/DocReminderButton";
import { DriverOpsActions } from "@/components/admin/DriverOpsActions";
import { MissingDocumentsBadge, NeedsUpdateBadge, TwicIssueBadge } from "@/components/admin/MissingDocumentsBadge";
import { NotTexasBadge } from "@/components/admin/NotTexasBadge";
import { ShiftReadyReview } from "@/components/admin/ShiftReadyReview";
import { SelfReportBadge } from "@/components/admin/SelfReportBadge";
import { areaLabel, smsLabel } from "@/components/admin/DriversTable";
import { SelfReportedTag } from "@/components/shared/SelfReportedTag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONFIRMATIONS, STATUS_DONE } from "@/lib/admin/options";
import { ROSTER_READY, SHIFT_READY_ITEM_LABELS } from "@/lib/drivers/tiers";
import { twicIssue } from "@/lib/drivers/twic";
import { heardFromLabel, referrerLabel, tagsLabel } from "@/lib/admin/source";
import { summarizeDriver } from "@/lib/carrier/driverSummary";
import { formatFileSize } from "@/lib/image";
import {
  CLEARINGHOUSE_SELF_REPORT_NOTE,
  DRIVING_STYLE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
} from "@/lib/onboarding/options";
import { formatE164ForDisplay } from "@/lib/phone";
import {
  approveDriverAction,
  blockDriverAction,
  markDriverReviewedAction,
  reopenDriverAction,
} from "@/server/actions/admin.actions";
import type { DocReminderPreview } from "@/server/services/DocReminderService";
import type { AdminDriverDetail } from "@/server/services/AdminService";
import {
  AVAILABILITY_LABELS,
  DOCUMENT_TYPE_LABELS,
  type AccountStatus,
  type AdminAction,
} from "@/types/domain";

interface DriverDetailSheetProps {
  /** Null keeps the sheet closed. */
  detail: AdminDriverDetail | null;
  /** The list without the open driver. */
  closeHref: string;
  /** The documents reminder, for a Registered driver missing a document (CR-5). */
  docReminder?: DocReminderPreview | null;
}

const ACTIONS: Record<AccountStatus, typeof approveDriverAction> = {
  approved: approveDriverAction,
  blocked: blockDriverAction,
  pending: reopenDriverAction,
};

const HISTORY_LABELS: Partial<Record<AdminAction, string>> = {
  driver_approved: `Marked ${ROSTER_READY}`,
  driver_blocked: "Blocked",
  driver_reopened: "Moved to Registered",
  driver_rereview_needed: "Back to Registered for re-review",
  driver_rereview_cleared: "Marked as reviewed",
  driver_grace_expired: "Back to Registered: update not made in time",
  driver_auto_paused: "Paused: no-shows",
  driver_twic_flagged: "Turned away at gate: TWIC",
  driver_unpaused: "Shift texts resumed",
};

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

function Row({ label, value, selfReported = false }: { label: string; value: string; selfReported?: boolean }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-3 py-2">
      <dt className="w-32 shrink-0 text-helper leading-helper text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-label leading-label font-semibold">
        {value}
        {selfReported && <SelfReportedTag />}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-eyebrow leading-eyebrow font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * One driver beside the list: the status, the full phone number, the card as the driver
 * answered it, the papers through signed links, the source (part 4), and the history from
 * the audit log. Approve and Block each ask first; Approve is off while the card is not
 * finished, with the reason under it.
 */
export function DriverDetailSheet({ detail, closeHref, docReminder = null }: DriverDetailSheetProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<AccountStatus>();
  const [pending, setPending] = useState(false);
  const [override, setOverride] = useState("");
  const [overrideError, setOverrideError] = useState<string>();

  if (!detail) return null;
  const { driver, profile } = detail;
  const summary = summarizeDriver(driver);
  const name = driver.fullName;
  const optional = [
    driver.employmentType && { label: "W-2 or 1099", value: labelOf(EMPLOYMENT_TYPE_OPTIONS, driver.employmentType) },
    driver.drivingStyles.length > 0 && {
      label: "Driving",
      value: driver.drivingStyles.map((style) => labelOf(DRIVING_STYLE_OPTIONS, style)).join(", "),
    },
    driver.clearinghouseRegistered !== null && {
      label: "Clearinghouse account",
      value: driver.clearinghouseRegistered ? "Registered" : "Not registered",
      selfReported: true,
    },
    driver.availability.length > 0 && {
      label: "Availability",
      value: driver.availability.map((slot) => AVAILABILITY_LABELS[slot]).join(", "),
    },
    driver.certifications.length > 0 && { label: "Certifications", value: driver.certifications.join(", ") },
  ].filter((row): row is { label: string; value: string; selfReported?: boolean } => Boolean(row));
  const { source } = profile;
  const sourceRows = [
    { label: "Came by", value: detail.source.label },
    source.utmCampaign && detail.source.kind === "qr" && { label: "Campaign", value: source.utmCampaign },
    tagsLabel(source) && { label: "Tags", value: tagsLabel(source) as string },
    referrerLabel(source) && { label: "Referrer", value: referrerLabel(source) as string },
    source.landingPath && { label: "Landed on", value: source.landingPath },
    { label: "Driver said", value: heardFromLabel(driver) ?? "Skipped the question" },
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  async function run(status: AccountStatus) {
    setPending(true);
    const result =
      status === "approved"
        ? await ACTIONS.approved({ driverId: driver.id, ...(override.trim() ? { overrideReason: override } : {}) })
        : await ACTIONS[status]({ driverId: driver.id });
    setPending(false);
    setConfirming(undefined);
    if (!result.ok) {
      setOverrideError(result.error.fieldErrors?.overrideReason);
      toast.error(result.error.fieldErrors?.overrideReason ?? result.error.message);
      return;
    }
    toast.success(STATUS_DONE[status]);
    router.refresh();
  }

  async function markReviewed() {
    setPending(true);
    const result = await markDriverReviewedAction({ driverId: driver.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Marked as reviewed");
    router.refresh();
  }

  const canApprove = profile.status !== "approved";
  const canMarkReviewed = profile.status === "approved" && driver.rereviewNeeded;
  // Everything but the CDL state must be in; that one an admin may meet with a typed reason.
  const blocking = detail.missing.filter((item) => item !== "cdl_state");
  const needsReason = detail.missing.includes("cdl_state");
  const ready = blocking.length === 0 && (!needsReason || override.trim().length >= 5);
  const notReadyReason =
    blocking.length > 0
      ? `Missing: ${blocking.map((item) => SHIFT_READY_ITEM_LABELS[item]).join(", ")}.`
      : "Type why a CDL from outside Texas is accepted.";
  const canBlock = profile.status !== "blocked";
  const canReopen = profile.status !== "pending";
  const confirmation = confirming ? CONFIRMATIONS[confirming] : null;

  return (
    <>
      <DetailSheet
        open
        onOpenChange={(open) => {
          if (!open) router.push(closeHref);
        }}
        title={name}
        description={`Signed up ${format(new Date(driver.createdAt), "MMMM d, yyyy")}`}
        footer={
          <>
            {canMarkReviewed && (
              <Button type="button" size="md" onClick={() => void markReviewed()} disabled={pending}>
                Mark as reviewed
              </Button>
            )}
            {canReopen && (
              <Button type="button" variant="secondary" size="md" onClick={() => setConfirming("pending")} disabled={pending}>
                Move to Registered
              </Button>
            )}
            {canBlock && (
              <Button type="button" variant="destructive" size="md" onClick={() => setConfirming("blocked")} disabled={pending}>
                Block
              </Button>
            )}
            {canApprove && (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  size="md"
                  onClick={() => setConfirming("approved")}
                  disabled={pending || !ready}
                  aria-describedby={ready ? undefined : "approve-reason"}
                >
                  {CONFIRMATIONS.approved.label}
                </Button>
                {!ready && (
                  <span id="approve-reason" className="text-small leading-small text-muted-foreground" data-slot="approve-reason">
                    {notReadyReason}
                  </span>
                )}
              </div>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2" data-slot="detail-badges">
          <AdminStatusBadge kind="driver" status={profile.status} />
          {detail.complete ? (
            <Badge variant="outline" data-status="complete">
              Complete
            </Badge>
          ) : (
            <AdminStatusBadge status="incomplete" />
          )}
          {driver.cdlState !== null && driver.cdlState !== "TX" && <NotTexasBadge />}
          <MissingDocumentsBadge status={profile.status} missing={detail.missingDocuments} />
          <NeedsUpdateBadge until={driver.rosterGraceUntil} missing={detail.needsUpdate} />
          <TwicIssueBadge issue={twicIssue(driver)} />
          <Badge variant="secondary" data-area={detail.inServiceArea === null ? "unknown" : detail.inServiceArea ? "inside" : "outside"}>
            {areaLabel(detail)}
          </Badge>
        </div>

        <ShiftReadyReview
          missing={detail.missing}
          photos={detail.photos}
          cdlState={driver.cdlState}
          rereviewNeeded={driver.rereviewNeeded}
          approved={profile.status === "approved"}
          override={override}
          onOverrideChange={(value) => {
            setOverride(value);
            setOverrideError(undefined);
          }}
          overrideError={overrideError}
        />

        {docReminder && <DocReminderButton driverId={driver.id} name={name} initial={docReminder} />}

        <DriverOpsActions
          driverId={driver.id}
          profileId={profile.id}
          name={name}
          noShowCount={driver.noShowCount}
          paused={driver.shiftsPaused}
          pausedReason={driver.shiftsPausedReason}
          afterRemoveHref={closeHref}
        />

        <Section title="Contact">
          <dl className="divide-y divide-border rounded-card border border-border bg-card">
            <div className="flex min-h-12 items-center gap-3 px-3 py-2">
              <dt className="w-32 shrink-0 text-helper leading-helper text-muted-foreground">Phone</dt>
              <dd className="min-w-0 flex-1 font-mono text-code leading-code font-semibold" data-slot="full-phone">
                <a href={`tel:${profile.phone}`} className="underline-offset-4 hover:underline">
                  {formatE164ForDisplay(profile.phone)}
                </a>
              </dd>
            </div>
            <Row label="Location" value={driver.zip ? `${driver.city ?? ""}, ${driver.state ?? ""} ${driver.zip}`.replace(/^, /, "") : "Not yet"} />
            <Row label="CDL state" value={driver.cdlState ?? "Not answered"} />
            <Row label="Shift texts" value={smsLabel(detail)} />
            <Row
              label="Reminder sent"
              value={driver.reminderSentAt ? format(new Date(driver.reminderSentAt), "MMMM d, yyyy h:mm a") : "Not sent"}
            />
            <Row
              label={`${ROSTER_READY} text`}
              value={driver.approvalTextSentAt ? format(new Date(driver.approvalTextSentAt), "MMMM d, yyyy h:mm a") : "Not sent"}
            />
          </dl>
        </Section>

        <Section title="Qualification card">
          <dl className="divide-y divide-border rounded-card border border-border bg-card" data-slot="driver-card">
            <Row label="CDL class" value={summary.cdlClass} />
            <Row label="Experience" value={summary.experience} selfReported />
            <Row label="Record" value={summary.record} />
            <Row label="Cards" value={summary.cards} selfReported />
            <Row label="Endorsements" value={summary.endorsements} />
            <Row label="Transmission" value={summary.transmission} />
            <Row label="Equipment" value={summary.equipment} />
            <Row label="Travels" value={`Up to ${driver.serviceRadiusMiles} miles`} />
            {optional.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} selfReported={row.selfReported} />
            ))}
          </dl>
          {driver.bio && (
            <blockquote className="rounded-card border border-border bg-card p-3 text-helper leading-helper">{driver.bio}</blockquote>
          )}
        </Section>

        <Section title="Clearinghouse and SAP">
          <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-3" data-slot="self-report">
            {driver.clearinghouseSelfReportedAt ? (
              <>
                <SelfReportBadge className="self-start" />
                <p className="text-helper leading-helper">
                  Confirmed on {format(new Date(driver.clearinghouseSelfReportedAt), "MMMM d, yyyy")}
                </p>
              </>
            ) : (
              <p className="text-helper leading-helper font-semibold">Not answered</p>
            )}
            <p className="text-small leading-small text-muted-foreground" data-slot="self-report-note">
              {CLEARINGHOUSE_SELF_REPORT_NOTE}
            </p>
          </div>
        </Section>

        <Section title="Papers">
          {detail.documents.length === 0 ? (
            <p className="text-helper leading-helper text-muted-foreground" data-slot="no-papers">
              No papers uploaded.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Papers">
              {detail.documents.map((document) => (
                <li key={document.id}>
                  <a
                    href={`/api/admin/documents/${document.id}/url`}
                    target="_blank"
                    rel="noopener"
                    className="flex min-h-target items-center gap-3 rounded-card border border-border-strong bg-card px-3 py-2 hover:bg-muted"
                  >
                    <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-label leading-label font-semibold">{DOCUMENT_TYPE_LABELS[document.type]}</span>
                      <span className="truncate text-helper leading-helper text-muted-foreground">
                        {document.fileName}, {formatFileSize(document.sizeBytes)}
                      </span>
                    </span>
                    <ExternalLink aria-hidden="true" className="size-5 shrink-0" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Source">
          <dl className="divide-y divide-border rounded-card border border-border bg-card" data-slot="source">
            {sourceRows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        </Section>

        <Section title="History">
          {detail.history.length === 0 ? (
            <p className="text-helper leading-helper text-muted-foreground" data-slot="no-history">
              No review actions yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-2" aria-label="History">
              {detail.history.map((entry) => (
                <li key={entry.id} className="text-helper leading-helper">
                  <span className="font-semibold">{HISTORY_LABELS[entry.action] ?? entry.action}</span>
                  {entry.detail.overrideReason ? ` (override: ${String(entry.detail.overrideReason)})` : ""} by{" "}
                  {entry.adminPhone === "system" ? (
                    <span>the system</span>
                  ) : (
                    <span className="font-mono">{formatE164ForDisplay(entry.adminPhone)}</span>
                  )}
                  ,{" "}
                  {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
                </li>
              ))}
            </ol>
          )}
        </Section>
      </DetailSheet>

      {confirming && confirmation && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) setConfirming(undefined);
          }}
          title={confirmation.title(name)}
          description={confirmation.description(name)}
          confirmLabel={confirmation.label}
          pendingLabel={confirmation.pending}
          variant={confirming === "blocked" ? "destructive" : "primary"}
          pending={pending}
          onConfirm={() => run(confirming)}
        />
      )}
    </>
  );
}
