"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ServiceAreaForm } from "@/components/admin/ServiceAreaForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setAreaActiveAction } from "@/server/actions/admin-ops.actions";
import type { AreaRow } from "@/server/services/AdminOpsService";

/** The areas with their head counts; each can be edited, deactivated or activated again. */
export function ServiceAreaList({ rows }: { rows: AreaRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string>();
  const [toggling, setToggling] = useState<AreaRow>();
  const [pending, setPending] = useState(false);

  return (
    <>
      <ul className="flex flex-col gap-3" aria-label="Service areas">
        {rows.map((row) => (
          <li key={row.area.id} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4" data-slot="area-row">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{row.area.name}</span>
                <span className="text-helper leading-helper text-muted-foreground">
                  Centre {row.area.centerZip}, {row.area.radiusMiles} miles. {row.drivers} drivers and {row.carriers} carriers inside.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={row.area.isActive ? "success" : "secondary"}>{row.area.isActive ? "Active" : "Off"}</Badge>
                <Button type="button" variant="secondary" size="md" onClick={() => setEditing(editing === row.area.id ? undefined : row.area.id)}>
                  Edit
                </Button>
                <Button type="button" variant={row.area.isActive ? "destructive" : "primary"} size="md" onClick={() => setToggling(row)}>
                  {row.area.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
            {editing === row.area.id && <ServiceAreaForm area={row.area} onDone={() => setEditing(undefined)} />}
          </li>
        ))}
      </ul>
      {toggling && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setToggling(undefined);
          }}
          title={`${toggling.area.isActive ? "Deactivate" : "Activate"} ${toggling.area.name}?`}
          description={
            toggling.area.isActive
              ? `${toggling.drivers} drivers and ${toggling.carriers} carriers are inside. Those not inside another area stop being listed and get no shift texts, and carriers there cannot post.`
              : `${toggling.drivers} drivers and ${toggling.carriers} carriers are inside. They count as in area again at once.`
          }
          confirmLabel={toggling.area.isActive ? "Deactivate" : "Activate"}
          variant={toggling.area.isActive ? "destructive" : "primary"}
          pending={pending}
          onConfirm={async () => {
            setPending(true);
            const result = await setAreaActiveAction({ areaId: toggling.area.id, isActive: !toggling.area.isActive });
            setPending(false);
            setToggling(undefined);
            if (!result.ok) {
              toast.error(result.error.message);
              return;
            }
            toast.success(result.data.isActive ? "Area activated" : "Area deactivated");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
