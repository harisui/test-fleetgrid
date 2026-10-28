"use client";

import { format } from "date-fns";
import { Users } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { DataTable, type DataColumn } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { Badge } from "@/components/ui/badge";
import {
  ADMIN_DRIVERS_PATH,
  AREA_OPTIONS,
  COMPLETE_OPTIONS,
  driversHref,
  REVIEW_STATUS_OPTIONS,
  SOURCE_UNKNOWN,
} from "@/lib/admin/options";
import { summarizeDriver } from "@/lib/carrier/driverSummary";
import { maskPhone } from "@/lib/phone";
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

const COLUMNS: DataColumn<AdminDriverRow>[] = [
  { key: "name", header: "Driver", cell: (row) => row.driver.fullName, sortable: true },
  { key: "phone", header: "Phone", cell: (row) => maskPhone(row.profile.phone), mono: true },
  {
    key: "zip",
    header: "ZIP and city",
    cell: (row) => (row.driver.zip ? `${row.driver.zip} ${row.driver.city ?? ""}`.trim() : "Not yet"),
  },
  { key: "area", header: "Area", cell: areaLabel },
  { key: "cdl", header: "Class", cell: (row) => summarizeDriver(row.driver).cdlClass },
  { key: "endorsements", header: "Endorsements", cell: (row) => summarizeDriver(row.driver).endorsements },
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
  { key: "status", header: "Review", cell: (row) => <AdminStatusBadge status={row.profile.status} />, sortable: true },
  { key: "sms", header: "SMS", cell: smsLabel },
  { key: "source", header: "Source", cell: () => SOURCE_UNKNOWN },
  { key: "created", header: "Signed up", cell: signedUp, sortable: true },
];

/** One driver as a card on a phone. */
function DriverCard({ row }: { row: AdminDriverRow }) {
  const summary = summarizeDriver(row.driver);
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-strong bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-label leading-label font-semibold">{row.driver.fullName}</span>
        <AdminStatusBadge status={row.profile.status} />
      </div>
      <span className="font-mono text-code leading-code text-muted-foreground">{maskPhone(row.profile.phone)}</span>
      <span className="text-helper leading-helper text-muted-foreground">
        {row.driver.zip ? `${row.driver.zip} ${row.driver.city ?? ""}` : "No ZIP yet"} · {areaLabel(row)} ·{" "}
        {summary.cdlClass}
      </span>
      <span className="text-helper leading-helper text-muted-foreground">
        {row.complete ? "Complete" : "Incomplete"} · SMS {smsLabel(row)} · {signedUp(row)}
      </span>
    </div>
  );
}

/** The Drivers list: the filters above, the table or the cards, the pages below. Every row opens the detail sheet. */
export function DriversTable({ page }: { page: AdminDriversPage }) {
  const { query } = page;
  const base = { q: query.q, status: query.status, complete: query.complete, area: query.area, sort: query.sort, dir: query.dir };
  return (
    <section aria-label="Drivers list" className="flex flex-col gap-4">
      <FilterBar
        action={ADMIN_DRIVERS_PATH}
        search={{ name: "q", label: "Search", placeholder: "Name, phone or ZIP", value: query.q }}
        filters={[
          { name: "status", label: "Review", value: query.status, options: REVIEW_STATUS_OPTIONS },
          { name: "complete", label: "Profile", value: query.complete, options: COMPLETE_OPTIONS },
          { name: "area", label: "Area", value: query.area, options: AREA_OPTIONS },
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
          title: page.total === 0 && (query.q || query.status || query.complete || query.area) ? "No drivers match these filters." : "No drivers yet.",
          description:
            page.total === 0 && (query.q || query.status || query.complete || query.area)
              ? "Clear a filter or search for something else."
              : "Drivers appear here as they sign up on their phones.",
        }}
      />
    </section>
  );
}
