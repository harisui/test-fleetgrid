import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { ServiceAreaForm } from "@/components/admin/ServiceAreaForm";
import { ServiceAreaList } from "@/components/admin/ServiceAreaList";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Service areas" };

/**
 * Where FleetGrid is live (T3.11): each area with who is inside it, the form to add one, and
 * edit, activate and deactivate. Every change is in the audit log with who made it.
 */
export default async function AdminServiceAreasPage() {
  const { user } = await requireAdmin();
  const { adminOpsService } = await getContainer();
  const rows = await adminOpsService.getAreas(user.id);
  return (
    <AdminPage
      title="Service areas"
      subtitle="Drivers inside an active area are listed and texted; carriers inside one can subscribe and post shifts. Changes apply at once."
    >
      <section aria-labelledby="add-area" className="flex flex-col gap-3">
        <h2 id="add-area" className="font-heading text-h2 leading-h2 font-semibold">
          Add an area
        </h2>
        <ServiceAreaForm />
      </section>
      <section aria-labelledby="areas" className="flex flex-col gap-3">
        <h2 id="areas" className="font-heading text-h2 leading-h2 font-semibold">
          Areas
        </h2>
        <ServiceAreaList rows={rows} />
      </section>
    </AdminPage>
  );
}
