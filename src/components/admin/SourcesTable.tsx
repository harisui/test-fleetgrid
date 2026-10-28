"use client";

import { Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type DataColumn } from "@/components/admin/DataTable";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";
import { analyticsHref, PERIOD_OPTIONS } from "@/lib/admin/analytics-options";
import type { Period } from "@/lib/validation/qr.schema";
import type { SourceRow } from "@/server/services/AnalyticsService";

const dash = "—";

const count = (value: number | null) => (value === null ? dash : value.toLocaleString("en-US"));
const pct = (value: number | null) => (value === null ? dash : `${value}%`);

/** "Where drivers come from": one row per QR code, campaign, survey answer, and the rest. */
export function SourcesTable({ sources, period }: { sources: SourceRow[]; period: Period }) {
  const router = useRouter();
  const columns: DataColumn<SourceRow>[] = [
    {
      key: "source",
      header: "Source",
      cell: (row) =>
        row.qrLinkId ? (
          <Link href={analyticsHref({ period, open: row.qrLinkId })} className="underline-offset-4 hover:underline">
            {row.label}
          </Link>
        ) : (
          row.label
        ),
    },
    { key: "visits", header: "Visits", cell: (row) => count(row.visits), align: "right" },
    { key: "signups", header: "Sign-ups", cell: (row) => count(row.signups), align: "right" },
    { key: "completed", header: "Completed", cell: (row) => count(row.completed), align: "right" },
    { key: "conversion", header: "Conversion", cell: (row) => pct(row.conversionPercent), align: "right" },
  ];

  return (
    <section aria-labelledby="sources-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="sources-title" className="font-heading text-h2 leading-h2 font-semibold">
            Where drivers come from
          </h2>
          <p className="text-helper leading-helper text-muted-foreground">
            Visits are scans of a code&apos;s short link. The &quot;Said&quot; rows are the drivers&apos; own answers, so they overlap the rest.
          </p>
        </div>
        <FormField label="Period" errorIcon={false} className="w-44">
          <SelectInput
            value={period}
            onValueChange={(value) => router.push(analyticsHref({ period: value as Period }))}
            options={PERIOD_OPTIONS}
            className="h-target"
          />
        </FormField>
      </div>
      <DataTable
        label="Sources"
        columns={columns}
        rows={sources}
        rowKey={(row) => `${row.kind}:${row.qrLinkId ?? row.label}`}
        renderCard={(row) => (
          <div className="flex flex-col gap-1 rounded-card border border-border-strong bg-card p-4">
            <span className="text-label leading-label font-semibold">{row.label}</span>
            <span className="text-helper leading-helper text-muted-foreground tabular-nums">
              Visits {count(row.visits)} · Sign-ups {count(row.signups)} · Completed {count(row.completed)} · {pct(row.conversionPercent)}
            </span>
          </div>
        )}
        empty={{ icon: Megaphone, title: "No sign-ups in this period.", description: "Pick a longer period, or wait for the flyers to work." }}
      />
    </section>
  );
}
