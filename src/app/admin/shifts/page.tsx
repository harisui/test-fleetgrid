import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminFilterLinks } from "@/components/admin/AdminFilterLinks";
import { AdminPage } from "@/components/admin/AdminPage";
import { RoutedDetailSheet, SheetRow, SheetSection } from "@/components/admin/RoutedDetailSheet";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import { BookedNotNotifiedBadge } from "@/components/admin/MissingDocumentsBadge";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { ShiftSummary } from "@/components/shifts/ShiftSummary";
import { EmptyState } from "@/components/shared/EmptyState";
import { requireAdmin } from "@/lib/auth/guards";
import { formatE164ForDisplay } from "@/lib/phone";
import { RECIPIENT_STATUS_LABELS, SHIFT_EDIT_FIELD_LABELS, SHIFT_STATUS_LABELS, scheduledLine } from "@/lib/shifts/copy";
import { SHIFT_FILTERS } from "@/lib/validation/admin-ops.schema";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";
import type { AdminShiftDetail } from "@/server/services/AdminOpsService";
import { CalendarClock } from "lucide-react";

export const metadata: Metadata = { title: "Shifts" };

function shiftsHref(status: string, open?: string): string {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (open) query.set("open", open);
  const text = query.toString();
  return `/admin/shifts${text ? `?${text}` : ""}`;
}

/** A phone number in the text log: the sender FleetGrid uses stays as it is. */
const showPhone = (value: string) => (value.startsWith("+") ? formatE164ForDisplay(value) : value);

/**
 * Every shift posted, newest start first, with its state; ?open=<id> shows who was texted in
 * each round and the full text log with the numbers. The list itself shows no phone numbers.
 */
export default async function AdminShiftsPage({ searchParams }: PageProps<"/admin/shifts">) {
  const { user } = await requireAdmin();
  const { adminOpsService } = await getContainer();
  const page = await adminOpsService.getShiftsPage(user.id, await searchParams);
  let detail: AdminShiftDetail | null = null;
  if (page.query.open) {
    detail = await adminOpsService.getShift(user.id, { shiftId: page.query.open }).catch((error: unknown) => {
      if (error instanceof AppError && error.code === "NOT_FOUND") return null;
      throw error;
    });
  }
  const status = page.query.status;

  return (
    <AdminPage title="Shifts" subtitle="Every shift carriers posted, who was texted, and every text in and out.">
      <StatTileGrid label="Shift counts" columns={4}>
        <StatTile label="Total" value={page.tiles.total} />
        <StatTile label="Open" value={page.tiles.open} />
        <StatTile label="Booked" value={page.tiles.booked} />
        <StatTile label="Fill rate" value={page.tiles.fillRate === null ? "None yet" : `${page.tiles.fillRate}%`} caption="booked of booked or expired" />
      </StatTileGrid>
      <AdminFilterLinks
        label="Filter shifts"
        current={status}
        links={SHIFT_FILTERS.map((filter) => ({
          value: filter,
          label: filter ? SHIFT_STATUS_LABELS[filter] : "All",
          href: shiftsHref(filter),
        }))}
      />
      {page.rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No shifts" description="Shifts carriers post show here." />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Shifts">
          {page.rows.map((row) => (
            <li key={row.shift.id}>
              <Link
                href={shiftsHref(status, row.shift.id)}
                className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 hover:border-border-strong"
                data-slot="admin-shift-row"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {row.companyName}, CDL-{row.shift.cdlClass}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {row.status === "booked" && row.shift.bookedNoticeFailedAt && <BookedNotNotifiedBadge />}
                    <ShiftStatusBadge status={row.status} scheduled={row.shift.sendAfter !== null} />
                  </span>
                </span>
                <ShiftSummary shift={row.shift} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <RoutedDetailSheet
          closeHref={shiftsHref(status)}
          title={`${detail.companyName}, CDL-${detail.shift.cdlClass}`}
          description={`Posted ${format(new Date(detail.shift.createdAt), "MMM d, yyyy h:mm a")}`}
        >
          <ShiftStatusBadge status={detail.status} scheduled={detail.shift.sendAfter !== null} />
          {detail.status === "booked" && detail.shift.bookedNoticeFailedAt && <BookedNotNotifiedBadge className="self-start" />}
          {detail.shift.carrierPausedAt && <p data-slot="carrier-paused">Paused: the carrier is blocked. No alerts go and nobody can book it.</p>}
          <ShiftSummary shift={detail.shift} />
          {detail.status === "open" && detail.shift.sendAfter && <p>{scheduledLine(detail.shift.sendAfter)}</p>}
          <SheetSection title="Shift">
            <dl className="divide-y divide-border rounded-card border border-border bg-card">
              <SheetRow label="Code">{detail.shift.shortCode}</SheetRow>
              <SheetRow label="On site">
                {detail.shift.onsiteContactName}, {formatE164ForDisplay(detail.shift.onsiteContactPhone)}
              </SheetRow>
              <SheetRow label="Pay">{detail.shift.payText ?? "Not given"}</SheetRow>
              <SheetRow label="Rounds">{detail.shift.broadcastRound}</SheetRow>
              {detail.shift.cancelReason && <SheetRow label="Cancelled">{detail.shift.cancelReason}</SheetRow>}
            </dl>
          </SheetSection>
          {detail.edits.length > 0 && (
            <SheetSection title={`Edits by the carrier (${detail.edits.length})`}>
              <ol className="flex flex-col gap-1 text-helper leading-helper" aria-label="Edits by the carrier" data-slot="shift-edits">
                {detail.edits.map((edit) => (
                  <li key={edit.at}>
                    {format(new Date(edit.at), "MMM d h:mm a")}: {edit.fields.map((field) => SHIFT_EDIT_FIELD_LABELS[field] ?? field).join(", ")}
                  </li>
                ))}
              </ol>
            </SheetSection>
          )}
          <SheetSection title={`Texted (${detail.recipients.length})`}>
            <ul className="flex flex-col gap-1 text-helper leading-helper" aria-label="Texted drivers">
              {detail.recipients.map((recipient) => (
                <li key={recipient.id} className="flex justify-between gap-2" data-status={recipient.status}>
                  <Link href={`/admin/drivers?open=${recipient.driverId}`} className="underline-offset-4 hover:underline">
                    Round {recipient.round}, number {recipient.position}
                  </Link>
                  <span className="font-semibold">{RECIPIENT_STATUS_LABELS[recipient.status]}</span>
                </li>
              ))}
            </ul>
          </SheetSection>
          <SheetSection title={`Text log (${detail.texts.length})`}>
            <ol className="flex flex-col gap-2" aria-label="Text log">
              {detail.texts.map((text) => (
                <li key={text.id} className="flex flex-col gap-1 rounded-field border border-border bg-card p-3 text-helper leading-helper" data-kind={text.kind}>
                  <span className="text-muted-foreground">
                    {format(new Date(text.createdAt), "MMM d h:mm:ss a")}, {text.direction === "inbound" ? "from" : "to"}{" "}
                    <span className="font-mono">{showPhone(text.direction === "inbound" ? text.fromPhone : text.toPhone)}</span>,{" "}
                    {text.kind}
                    {text.status ? `, ${text.status}` : ""}
                  </span>
                  <span>{text.body}</span>
                </li>
              ))}
            </ol>
          </SheetSection>
        </RoutedDetailSheet>
      )}
    </AdminPage>
  );
}
