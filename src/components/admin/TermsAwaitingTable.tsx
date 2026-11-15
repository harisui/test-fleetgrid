"use client";

import { FileCheck } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/admin/DataTable";
import { TermsLinkButton } from "@/components/admin/TermsLinkButton";
import { formatE164ForDisplay } from "@/lib/phone";
import type { DriverAwaitingTerms } from "@/types/domain";

const textable = (row: DriverAwaitingTerms) => row.smsOptIn && !row.smsOptedOut && Boolean(row.phone);

function textsLabel(row: DriverAwaitingTerms): string {
  if (row.smsOptedOut) return "Replied STOP";
  if (!row.smsOptIn) return "Texts off";
  return "Texts on";
}

function lastLinkLabel(row: DriverAwaitingTerms): string {
  return row.lastLinkAt
    ? new Date(row.lastLinkAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })
    : "Not sent";
}

const COLUMNS: DataColumn<DriverAwaitingTerms>[] = [
  { key: "name", header: "Driver", cell: (row) => row.fullName },
  { key: "phone", header: "Phone", mono: true, cell: (row) => formatE164ForDisplay(row.phone) },
  { key: "texts", header: "Texts", cell: textsLabel },
  { key: "link", header: "Last link", cell: lastLinkLabel },
  {
    key: "action",
    header: "Link",
    cell: (row) =>
      textable(row) ? <TermsLinkButton driverId={row.driverId} name={row.fullName} count={1} /> : "Sees it at sign-in",
  },
];

/** The drivers who still have to accept the Terms that need everyone again (Milestone 6). */
export function TermsAwaitingTable({ rows }: { rows: DriverAwaitingTerms[] }) {
  return (
    <DataTable
      label="Drivers waiting to accept"
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.driverId}
      renderCard={(row) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{row.fullName}</span>
            <span className="text-small leading-small text-muted-foreground">{lastLinkLabel(row)}</span>
          </div>
          <span className="text-small leading-small text-muted-foreground">
            {formatE164ForDisplay(row.phone)}, {textsLabel(row).toLowerCase()}
          </span>
          {textable(row) && <TermsLinkButton driverId={row.driverId} name={row.fullName} count={1} />}
        </div>
      )}
      empty={{ icon: FileCheck, title: "Everyone has accepted", description: "No driver is waiting to accept the Terms." }}
    />
  );
}
