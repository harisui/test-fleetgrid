"use client";

import { format } from "date-fns";
import { QrCode } from "lucide-react";
import { CopyButton } from "@/components/admin/CopyButton";
import { DataTable, type DataColumn } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { analyticsHref } from "@/lib/admin/analytics-options";
import type { Period } from "@/lib/validation/qr.schema";
import type { QrLinkRow } from "@/server/services/AnalyticsService";

const dash = "—";

/** Active or off, as icon-free text in a badge: the words carry the state. */
export function QrStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="success" data-qr-status="active">
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" data-qr-status="off">
      Off
    </Badge>
  );
}

/** Every QR code with its scans and sign-ups. A row opens the code's sheet. */
export function QrTable({ rows, period }: { rows: QrLinkRow[]; period: Period }) {
  const columns: DataColumn<QrLinkRow>[] = [
    { key: "location", header: "Location", cell: (row) => row.link.locationName },
    { key: "campaign", header: "Campaign", cell: (row) => row.link.campaign, mono: true },
    {
      key: "link",
      header: "Short link",
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-code leading-code">{row.shortLink.replace(/^https?:\/\//, "")}</span>
          <CopyButton value={row.shortLink} label={`Copy the short link for ${row.link.locationName}`} />
        </span>
      ),
    },
    { key: "scans7d", header: "Scans, 7 days", cell: (row) => row.scans7d, align: "right" },
    { key: "scansAll", header: "Scans, all", cell: (row) => row.scansAll, align: "right" },
    { key: "signups", header: "Sign-ups", cell: (row) => row.signups, align: "right" },
    { key: "conversion", header: "Conversion", cell: (row) => (row.conversionPercent === null ? dash : `${row.conversionPercent}%`), align: "right" },
    { key: "status", header: "Status", cell: (row) => <QrStatusBadge isActive={row.link.isActive} /> },
    { key: "created", header: "Created", cell: (row) => format(new Date(row.link.createdAt), "MMM d, yyyy") },
  ];

  return (
    <section aria-labelledby="qr-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="qr-title" className="font-heading text-h2 leading-h2 font-semibold">
          QR codes
        </h2>
        <p className="text-helper leading-helper text-muted-foreground">
          Each printed code carries its short link, so where it lands can change without reprinting.
        </p>
      </div>
      <DataTable
        label="QR codes"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.link.id}
        rowHref={(row) => analyticsHref({ period, open: row.link.id })}
        renderCard={(row) => (
          <a href={analyticsHref({ period, open: row.link.id })} className="block rounded-card">
            <div className="flex flex-col gap-1 rounded-card border border-border-strong bg-card p-4">
              <span className="flex items-start justify-between gap-3">
                <span className="text-label leading-label font-semibold">{row.link.locationName}</span>
                <QrStatusBadge isActive={row.link.isActive} />
              </span>
              <span className="font-mono text-code leading-code text-muted-foreground">{row.shortLink.replace(/^https?:\/\//, "")}</span>
              <span className="text-helper leading-helper text-muted-foreground tabular-nums">
                {row.scans7d} scans in 7 days · {row.scansAll} all time · {row.signups} sign-ups
              </span>
            </div>
          </a>
        )}
        empty={{
          icon: QrCode,
          title: "No QR codes yet.",
          description: "Generate one for each place a flyer hangs, then print it with the location name under the code.",
        }}
      />
    </section>
  );
}
