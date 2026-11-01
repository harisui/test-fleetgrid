"use client";

import { format } from "date-fns";
import { Building2 } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { DataTable, type DataColumn } from "@/components/admin/DataTable";
import { Badge } from "@/components/ui/badge";
import { subscriptionLabel } from "@/lib/admin/ops";
import { formatE164ForDisplay } from "@/lib/phone";
import type { AdminCarrierRow } from "@/server/services/AdminOpsService";

/** Every carrier: company, contact, yard, review status and subscription. A row opens the sheet. */
export function CarriersTable({ rows, openHrefs }: { rows: AdminCarrierRow[]; openHrefs: Record<string, string> }) {
  const columns: DataColumn<AdminCarrierRow>[] = [
    { key: "company", header: "Company", cell: (row) => row.carrier.companyName, wrap: true },
    { key: "contact", header: "Contact", cell: (row) => row.carrier.contactName },
    { key: "phone", header: "Phone", cell: (row) => formatE164ForDisplay(row.profile.phone), mono: true },
    { key: "yard", header: "Yard", cell: (row) => `${row.carrier.city} ${row.carrier.state} ${row.carrier.zip}` },
    { key: "area", header: "Area", cell: (row) => (row.inServiceArea ? "Inside" : "Outside") },
    { key: "status", header: "Review", cell: (row) => <AdminStatusBadge status={row.profile.status} /> },
    {
      key: "subscription",
      header: "Subscription",
      cell: (row) => <Badge variant={row.subscribed ? "success" : "secondary"}>{subscriptionLabel(row)}</Badge>,
    },
    { key: "created", header: "Signed up", cell: (row) => format(new Date(row.carrier.createdAt), "MMM d, yyyy") },
  ];
  return (
    <DataTable
      label="Carriers"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.carrier.id}
      rowHref={(row) => openHrefs[row.carrier.id]}
      renderCard={(row) => (
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{row.carrier.companyName}</span>
          <span className="text-helper leading-helper text-muted-foreground">
            {row.carrier.city} {row.carrier.state}, {subscriptionLabel(row)}
          </span>
          <AdminStatusBadge status={row.profile.status} />
        </div>
      )}
      empty={{ icon: Building2, title: "No carriers", description: "Carriers who sign up show here." }}
    />
  );
}
