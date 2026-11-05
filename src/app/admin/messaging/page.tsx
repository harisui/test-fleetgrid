import { formatInTimeZone } from "date-fns-tz";
import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminFilterLinks } from "@/components/admin/AdminFilterLinks";
import { AdminPage } from "@/components/admin/AdminPage";
import { FormSelect } from "@/components/admin/FormSelect";
import { MessagingLiveRefresh } from "@/components/admin/MessagingLiveRefresh";
import { ResendButton } from "@/components/admin/ResendButton";
import { RoutedDetailSheet, SheetRow, SheetSection } from "@/components/admin/RoutedDetailSheet";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/auth/guards";
import { formatE164ForDisplay, maskPhone } from "@/lib/phone";
import { RECIPIENT_STATUS_LABELS, shiftTimeRange } from "@/lib/shifts/copy";
import { SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import { MESSAGING_PERIODS, MESSAGE_STATUS_FILTERS, type MessagingQuery } from "@/lib/validation/messaging.schema";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";
import type { MessageDetail, MessageRow, ShiftBroadcastDetail } from "@/server/services/MessagingService";

export const metadata: Metadata = { title: "Messaging activity" };

const PERIOD_LABELS = { today: "Today", "7d": "7 days", "30d": "30 days" } as const;
const TAB_LABELS = {
  broadcasts: "Shift broadcasts",
  account: "Account texts",
  notices: "Notices",
  unmatched: "Unmatched inbound",
} as const;
const STATUS_LABELS = { "": "Any status", sent: "Sent", delivered: "Delivered", failed: "Failed", held: "Held" } as const;
const CATEGORY_LABELS = {
  policy_change: "Policy change",
  service_notice: "Service notice",
  service_restored: "Service restored",
  account_security: "Account security",
  doc_reminder: "Documents reminder",
} as const;

type Link = Partial<Record<keyof MessagingQuery, string | undefined>>;

/** The page's address with the current filters and the given changes; sheets close on any change. */
function hrefOf(query: MessagingQuery, change: Link): string {
  const params = new URLSearchParams();
  const merged: Link = {
    period: query.period,
    tab: query.tab,
    status: query.status || undefined,
    type: query.type,
    shift: query.shift,
    driver: query.driver,
    batch: query.batch,
    from: query.from,
    to: query.to,
    ...change,
  };
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  if (params.get("period") === "7d") params.delete("period");
  if (params.get("tab") === "broadcasts") params.delete("tab");
  const text = params.toString();
  return `/admin/messaging${text ? `?${text}` : ""}`;
}

const when = (iso: string | null) => (iso ? formatInTimeZone(new Date(iso), SHIFT_TIME_ZONE, "MMM d, h:mm a") : "Not yet");
const stateVariant = { sent: "secondary", delivered: "success", failed: "destructive", held: "warning" } as const;

function MessageList({ rows, query, label }: { rows: MessageRow[]; query: MessagingQuery; label: string }) {
  if (rows.length === 0) return <p className="text-body leading-body text-muted-foreground">No texts here.</p>;
  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {rows.map(({ message, driverName, state }) => (
        <li key={message.id}>
          <Link
            href={hrefOf(query, { message: message.id })}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-card p-3 hover:border-border-strong"
            data-slot="message-row"
          >
            <span className="flex flex-col gap-1">
              <span className="font-semibold">
                {driverName ?? "Unknown number"}{" "}
                <span className="font-mono text-helper font-normal" data-slot="masked-phone">
                  {maskPhone(message.direction === "inbound" ? message.fromPhone : message.toPhone)}
                </span>
              </span>
              <span className="text-helper leading-helper text-muted-foreground">
                {when(message.createdAt)}, {message.kind}
                {message.errorCode ? `, error ${message.errorCode}` : ""}
              </span>
            </span>
            {message.direction === "outbound" ? (
              <Badge variant={stateVariant[state]}>{STATUS_LABELS[state]}</Badge>
            ) : (
              <Badge variant="secondary">Reply</Badge>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Messaging activity (Milestone 3 part 6): what went out, what was delivered or failed, what
 * came back, by shift broadcast, account text, notice and unmatched reply. Every filter is in
 * the URL. Phones are masked in the lists and whole in the sheets.
 */
export default async function MessagingActivityPage({ searchParams }: PageProps<"/admin/messaging">) {
  const { user } = await requireAdmin();
  const { messagingService } = await getContainer();
  const params = await searchParams;
  const page = await messagingService.getActivity(user.id, params);
  const { query, tiles } = page;

  const notFound = (error: unknown) => {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "VALIDATION")) return null;
    throw error;
  };
  let shiftSheet: ShiftBroadcastDetail | null = null;
  let messageSheet: MessageDetail | null = null;
  if (query.message) messageSheet = await messagingService.getMessage(user.id, { messageId: query.message }).catch(notFound);
  else if (query.shift && query.tab === "broadcasts")
    shiftSheet = await messagingService.getShiftBroadcast(user.id, { shiftId: query.shift }).catch(notFound);
  const closeHref = hrefOf(query, { message: undefined, shift: undefined });

  return (
    <AdminPage title="Messaging" subtitle="Every text FleetGrid sent and received: shift broadcasts, account texts, notices and replies.">
      <MessagingLiveRefresh />
      <AdminFilterLinks
        label="Period"
        current={query.from || query.to ? "" : query.period}
        links={MESSAGING_PERIODS.map((period) => ({
          value: period,
          label: PERIOD_LABELS[period],
          href: hrefOf(query, { period, from: undefined, to: undefined }),
        }))}
      />
      <StatTileGrid label="Messaging counts" columns={4}>
        <StatTile label="Sent" value={tiles.sent} />
        <StatTile label="Delivered" value={tiles.delivered} />
        <StatTile label="Failed" value={tiles.failed} />
        <StatTile label="Replies received" value={tiles.replies} />
        <StatTile label="Shifts booked" value={tiles.shiftsBooked} />
        <StatTile label="Notices sent" value={tiles.noticesSent} />
      </StatTileGrid>

      <AdminFilterLinks
        label="Message types"
        current={query.tab}
        links={(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((tab) => ({
          value: tab,
          label: TAB_LABELS[tab],
          href: hrefOf(query, { tab, type: undefined, batch: undefined }),
        }))}
      />

      <form action="/admin/messaging" className="flex flex-wrap items-end gap-3" aria-label="Filters" data-slot="messaging-filters">
        <input type="hidden" name="tab" value={query.tab} />
        <input type="hidden" name="period" value={query.period} />
        {query.type && <input type="hidden" name="type" value={query.type} />}
        {query.batch && <input type="hidden" name="batch" value={query.batch} />}
        {query.driver && <input type="hidden" name="driver" value={query.driver} />}
        {query.shift && query.tab !== "broadcasts" && <input type="hidden" name="shift" value={query.shift} />}
        <div className="w-48">
          <FormSelect
            name="status"
            label="Status"
            initial={query.status || "any"}
            options={MESSAGE_STATUS_FILTERS.map((status) => ({ value: status || "any", label: STATUS_LABELS[status] }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="messaging-from">From</Label>
          <Input id="messaging-from" type="date" name="from" defaultValue={query.from} className="w-auto" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="messaging-to">To</Label>
          <Input id="messaging-to" type="date" name="to" defaultValue={query.to} className="w-auto" />
        </div>
        <Button type="submit" variant="secondary" size="md">
          Apply
        </Button>
        {(query.driver || query.shift || query.from || query.to || query.status) && (
          <Link href={hrefOf(query, { driver: undefined, shift: undefined, from: undefined, to: undefined, status: undefined })} className="flex min-h-target items-center text-label underline underline-offset-4">
            Clear filters
          </Link>
        )}
      </form>

      {query.tab === "broadcasts" &&
        (page.broadcasts.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="No broadcasts in this period" />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Shift broadcasts">
            {page.broadcasts.map((row) => (
              <li key={row.shift.id}>
                <Link
                  href={hrefOf(query, { shift: row.shift.id })}
                  className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 hover:border-border-strong"
                  data-slot="broadcast-row"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {row.companyName}, {shiftTimeRange(row.shift)}
                    </span>
                    <ShiftStatusBadge status={row.status} />
                  </span>
                  <span className="text-helper leading-helper text-muted-foreground" data-slot="broadcast-counts">
                    {row.sent} sent, {row.delivered} delivered, {row.failed} failed, {row.yesReplies} YES replies,{" "}
                    {row.tooLate} too late{row.bookedBy ? `. Booked by ${row.bookedBy}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {query.tab === "account" && (
        <>
          <ul className="grid gap-2 md:grid-cols-2" aria-label="Account texts by template">
            {page.accountGroups.map((group) => (
              <li key={group.kind}>
                <Link
                  href={hrefOf(query, { type: group.kind })}
                  aria-current={query.type === group.kind ? "true" : undefined}
                  className="flex items-center justify-between gap-2 rounded-card border border-border bg-card p-4 hover:border-border-strong aria-[current=true]:border-foreground"
                  data-slot="account-group"
                >
                  <span className="font-semibold">{group.label}</span>
                  <span className="text-helper leading-helper text-muted-foreground">
                    {group.total} sent, {group.delivered} delivered, {group.failed} failed
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {query.type && <MessageList rows={page.messages} query={query} label="Account texts" />}
        </>
      )}

      {query.tab === "notices" && (
        <>
          {page.notices.length === 0 ? (
            <EmptyState icon={MessagesSquare} title="No notices in this period" description="Send one from Messaging, Send notice." />
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Notices">
              {page.notices.map(({ batch, delivered, failed }) => (
                <li key={batch.id}>
                  <Link
                    href={hrefOf(query, { batch: batch.id })}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-card p-4 hover:border-border-strong"
                    data-slot="notice-row"
                  >
                    <span className="flex flex-col gap-1">
                      <span className="font-semibold">{CATEGORY_LABELS[batch.category]}</span>
                      <span className="text-helper leading-helper text-muted-foreground">
                        {when(batch.createdAt)}, {batch.recipientCount} recipients, {delivered} delivered, {failed} failed
                        {batch.status === "queued" && batch.sendAfter ? `, sends at ${when(batch.sendAfter)}` : ""}
                      </span>
                    </span>
                    <Badge variant={batch.status === "sent" ? "success" : "warning"}>{batch.status === "sent" ? "Sent" : batch.status === "queued" ? "Queued" : "Sending"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {query.batch && <MessageList rows={page.messages} query={query} label="Notice texts" />}
        </>
      )}

      {query.tab === "unmatched" && <MessageList rows={page.messages} query={query} label="Unmatched inbound" />}

      {shiftSheet && (
        <RoutedDetailSheet closeHref={closeHref} title={`${shiftSheet.companyName}, CDL-${shiftSheet.shift.cdlClass}`} description={shiftTimeRange(shiftSheet.shift)}>
          <ShiftStatusBadge status={shiftSheet.status} />
          <p className="text-body leading-body">
            {shiftSheet.sent} sent, {shiftSheet.delivered} delivered, {shiftSheet.failed} failed, {shiftSheet.yesReplies} YES replies
            {shiftSheet.bookedBy ? `. Booked by ${shiftSheet.bookedBy}.` : "."}
          </p>
          <SheetSection title={`Recipients (${shiftSheet.recipients.length})`}>
            <ul className="flex flex-col gap-2" aria-label="Recipients">
              {shiftSheet.recipients.map(({ recipient, driverName, reply }) => (
                <li key={recipient.id} className="flex flex-col gap-1 rounded-field border border-border bg-card p-3 text-helper leading-helper" data-status={recipient.status}>
                  <span className="flex justify-between gap-2">
                    <Link href={`/admin/drivers?open=${recipient.driverId}`} className="font-semibold underline-offset-4 hover:underline">
                      {driverName ?? "Removed driver"}
                    </Link>
                    <span className="font-semibold">{RECIPIENT_STATUS_LABELS[recipient.status]}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Round {recipient.round}, sent {when(recipient.sentAt)}, delivered {when(recipient.deliveredAt)}
                  </span>
                  {reply && (
                    <span>
                      Replied &quot;{reply.body}&quot; at {when(reply.createdAt)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </SheetSection>
        </RoutedDetailSheet>
      )}

      {messageSheet && (
        <RoutedDetailSheet
          closeHref={closeHref}
          title={messageSheet.driverName ?? "Unknown number"}
          description={`${messageSheet.message.direction === "inbound" ? "Received" : "Sent"} ${when(messageSheet.message.createdAt)}`}
          footer={
            messageSheet.message.direction === "outbound" ? (
              <ResendButton messageId={messageSheet.message.id} allowed={messageSheet.resend.allowed} reason={messageSheet.resend.reason} />
            ) : undefined
          }
        >
          <SheetSection title="Text">
            <dl className="divide-y divide-border rounded-card border border-border bg-card">
              <SheetRow label={messageSheet.message.direction === "inbound" ? "From" : "To"}>
                <span className="font-mono" data-slot="full-phone">
                  {formatE164ForDisplay(messageSheet.message.direction === "inbound" ? messageSheet.message.fromPhone : messageSheet.message.toPhone)}
                </span>
              </SheetRow>
              <SheetRow label="Type">{messageSheet.message.kind}</SheetRow>
              <SheetRow label="Status">{messageSheet.message.status ?? "Received"}</SheetRow>
              {messageSheet.message.errorCode && <SheetRow label="Error">{messageSheet.message.errorCode}</SheetRow>}
              {messageSheet.message.inboundOutcome && <SheetRow label="Outcome">{messageSheet.message.inboundOutcome.replaceAll("_", " ")}</SheetRow>}
              {messageSheet.message.resendOf && <SheetRow label="Resend of">an earlier failed text</SheetRow>}
            </dl>
          </SheetSection>
          <p className="rounded-card border border-border bg-card p-3 text-body leading-body" data-slot="message-body">
            {messageSheet.message.body}
          </p>
          {messageSheet.message.driverId && (
            <Link href={`/admin/drivers?open=${messageSheet.message.driverId}`} className="text-label underline underline-offset-4">
              Open the driver
            </Link>
          )}
        </RoutedDetailSheet>
      )}
    </AdminPage>
  );
}
