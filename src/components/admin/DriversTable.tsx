"use client";

import { format } from "date-fns";
import { Users } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { DataTable, type DataColumn } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { MissingDocumentsBadge, NeedsUpdateBadge, PausedNoShowsBadge, TwicIssueBadge } from "@/components/admin/MissingDocumentsBadge";
import { NotTexasBadge } from "@/components/admin/NotTexasBadge";
import { RereviewBadge } from "@/components/admin/ShiftReadyReview";
import { SelfReportBadge } from "@/components/admin/SelfReportBadge";
import { Badge } from "@/components/ui/badge";
import {
  ADMIN_DRIVERS_PATH,
  AREA_OPTIONS,
  CDL_STATE_FILTER_OPTIONS,
  COMPLETE_OPTIONS,
  driversFilters,
  driversHref,
  MISSING_DOCUMENT_OPTIONS,
  REREVIEW_OPTIONS,
  REVIEW_STATUS_OPTIONS,
  SELF_REPORT_OPTIONS,
  SOURCE_OPTIONS,
  TWIC_FILTER_OPTIONS,
} from "@/lib/admin/options";
import { summarizeDriver } from "@/lib/carrier/driverSummary";
import { twicIssue } from "@/lib/drivers/twic";
import { formatE164ForDisplay } from "@/lib/phone";
import type { AdminDriverRow, AdminDriversPage } from "@/server/services/AdminService";

/** "In area", "Outside" or "Unknown" for a card without coordinates. */
export function areaLabel(row: Pick<AdminDriverRow, "inServiceArea">): string {
  if (row.inServiceArea === null) return "Unknown";
  return row.inServiceArea ? "In area" : "Outside";
}

/** "Yes", "No" or "STOP". */
export function smsLabel(row: Pick<AdminDriverRow, "driver">): string {
  if (row.driver.smsOptedOut) return "STOP";
  return row.driver.smsOptIn ? "Yes" : "No";
}

const signedUp = (row: AdminDriverRow) => format(new Date(row.driver.createdAt), "MMM d, yyyy");


/** The one profile reminder (change request of 2026-11-01): its date, or "Not sent". */
export function reminderLabel(row: { driver: { reminderSentAt: string | null } }): string {
  return row.driver.reminderSentAt ? format(new Date(row.driver.reminderSentAt), "MMM d, yyyy") : "Not sent";
}

const COLUMNS: DataColumn<AdminDriverRow>[] = [
  { key: "name", header: "Driver", cell: (row) => row.driver.fullName, sortable: true },
  { key: "phone", header: "Phone", cell: (row) => formatE164ForDisplay(row.profile.phone), mono: true },
  {
    key: "zip",
    header: "ZIP and city",
    cell: (row) => (row.driver.zip ? `${row.driver.zip} ${row.driver.city ?? ""}`.trim() : "Not yet"),
    wrap: true,
  },
  { key: "area", header: "Area", cell: areaLabel },
  { key: "cdl", header: "Class", cell: (row) => summarizeDriver(row.driver).cdlClass },
  { key: "endorsements", header: "Endorsements", cell: (row) => summarizeDriver(row.driver).endorsements, wrap: true },
  {
    key: "profile",
    header: "Profile",
    cell: (row) =>
      row.complete ? (
        <Badge variant="outline" data-status="complete">
          Complete
        </Badge>
      ) : (
        <AdminStatusBadge status="incomplete" />
      ),
  },
  { key: "cdlState", header: "CDL state", cell: cdlStateCell },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <span className="flex flex-wrap items-center gap-1">
        <AdminStatusBadge kind="driver" status={row.profile.status} />
        {row.driver.rereviewNeeded && <RereviewBadge />}
        <MissingDocumentsBadge status={row.profile.status} missing={row.missingDocuments} />
        <NeedsUpdateBadge until={row.driver.rosterGraceUntil} missing={row.needsUpdate} />
        {row.driver.shiftsPausedReason === "no_shows" && <PausedNoShowsBadge />}
        <TwicIssueBadge issue={twicIssue(row.driver)} />
      </span>
    ),
    sortable: true,
  },
  { key: "sms", header: "SMS", cell: smsLabel },
  { key: "reminder", header: "Reminder sent", cell: reminderLabel },
  {
    key: "selfReport",
    header: "Clearinghouse and SAP",
    cell: (row) => (row.driver.clearinghouseSelfReportedAt ? <SelfReportBadge /> : "Not answered"),
  },
  { key: "source", header: "Source", cell: (row) => row.source.label, wrap: true },
  { key: "created", header: "Signed up", cell: signedUp, sortable: true },
];

/** The state that issued the CDL, with the "Not Texas CDL" badge for any other (CR-5). */
function cdlStateCell(row: AdminDriverRow) {
  if (row.driver.cdlState === null) return "Not answered";
  if (row.driver.cdlState === "TX") return "TX";
  return (
    <span className="flex items-center gap-2">
      {row.driver.cdlState}
      <NotTexasBadge />
    </span>
  );
}

/** One driver as a card on a phone. */
function DriverCard({ row }: { row: AdminDriverRow }) {
  const summary = summarizeDriver(row.driver);
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-strong bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-label leading-label font-semibold">{row.driver.fullName}</span>
        <span className="flex flex-wrap justify-end gap-1">
          <AdminStatusBadge kind="driver" status={row.profile.status} />
          {row.driver.rereviewNeeded && <RereviewBadge />}
        </span>
      </div>
      <span className="font-mono text-helper leading-helper text-muted-foreground">{formatE164ForDisplay(row.profile.phone)}</span>
      <span className="text-helper leading-helper text-muted-foreground">
        {row.driver.zip ? `${row.driver.zip} ${row.driver.city ?? ""}` : "No ZIP yet"} · {areaLabel(row)} ·{" "}
        {summary.cdlClass}
      </span>
      <span className="text-helper leading-helper text-muted-foreground">
        {row.complete ? "Complete" : "Incomplete"} · SMS {smsLabel(row)} · {signedUp(row)}
      </span>
      <span className="text-helper leading-helper text-muted-foreground">{row.source.label}</span>
      {row.driver.clearinghouseSelfReportedAt && <SelfReportBadge className="self-start" />}
      {row.driver.cdlState !== null && row.driver.cdlState !== "TX" && <NotTexasBadge className="self-start" />}
      <MissingDocumentsBadge status={row.profile.status} missing={row.missingDocuments} className="self-start" />
      <NeedsUpdateBadge until={row.driver.rosterGraceUntil} missing={row.needsUpdate} className="self-start" />
      {row.driver.shiftsPausedReason === "no_shows" && <PausedNoShowsBadge className="self-start" />}
      <TwicIssueBadge issue={twicIssue(row.driver)} className="self-start" />
    </div>
  );
}

/** The Drivers list: the filters above, the table or the cards, the pages below. Every row opens the detail sheet. */
export function DriversTable({ page }: { page: AdminDriversPage }) {
  const { query } = page;
  const base = driversFilters(query);
  const filtered = Boolean(
    query.q || query.status || query.complete || query.area || query.source || query.selfReport || query.cdl || query.docs || query.rereview || query.twic || query.qr,
  );
  return (
    <section aria-label="Drivers list" className="flex flex-col gap-4">
      <FilterBar
        action={ADMIN_DRIVERS_PATH}
        search={{ name: "q", label: "Search", placeholder: "Name, phone or ZIP", value: query.q }}
        filters={[
          { name: "status", label: "Status", value: query.status, options: REVIEW_STATUS_OPTIONS },
          { name: "complete", label: "Profile", value: query.complete, options: COMPLETE_OPTIONS },
          { name: "area", label: "Area", value: query.area, options: AREA_OPTIONS },
          { name: "source", label: "Source", value: query.source, options: SOURCE_OPTIONS },
          { name: "selfReport", label: "Clearinghouse and SAP", value: query.selfReport, options: SELF_REPORT_OPTIONS },
          { name: "cdl", label: "CDL state", value: query.cdl, options: CDL_STATE_FILTER_OPTIONS },
          { name: "docs", label: "Documents", value: query.docs, options: MISSING_DOCUMENT_OPTIONS },
          { name: "rereview", label: "Review", value: query.rereview, options: REREVIEW_OPTIONS },
          { name: "twic", label: "TWIC", value: query.twic, options: TWIC_FILTER_OPTIONS },
          {
            name: "qr",
            label: "QR code",
            value: query.qr ?? "",
            options: query.qr ? [{ value: query.qr, label: page.qrLink?.locationName ?? "Unknown code" }] : [],
            hidden: true,
          },
        ]}
        keep={{ sort: query.sort, dir: query.dir }}
      />
      <DataTable
        label="Drivers"
        columns={COLUMNS}
        rows={page.rows}
        rowKey={(row) => row.driver.id}
        rowHref={(row) => driversHref({ ...base, page: page.page, open: row.driver.id })}
        renderCard={(row) => (
          <a href={driversHref({ ...base, page: page.page, open: row.driver.id })} className="block rounded-card">
            <DriverCard row={row} />
          </a>
        )}
        sort={{ key: query.sort, direction: query.dir }}
        sortHref={(key, direction) => driversHref({ ...base, sort: key, dir: direction, page: 1 })}
        pagination={{
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          hrefFor: (next) => driversHref({ ...base, page: next }),
        }}
        empty={{
          icon: Users,
          title: filtered ? "No drivers match these filters." : "No drivers yet.",
          description: filtered
            ? "Clear a filter or search for something else."
            : "Drivers appear here as they sign up on their phones.",
        }}
      />
    </section>
  );
}
