import type { Metadata } from "next";
import { DocumentUploader } from "@/components/driver/DocumentUploader";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "My documents" };

export default async function DriverDocumentsPage() {
  const { user } = await requireRole("driver");
  const { documentService } = await getContainer();
  const documents = await documentService.list(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My documents</h1>
        <p className="text-muted-foreground mt-2">
          Only you and FleetGrid staff can see these files.
        </p>
      </div>
      <DocumentUploader initialDocuments={documents} />
    </div>
  );
}
