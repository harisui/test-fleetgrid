import type { Metadata } from "next";
import { DocumentUploader } from "@/components/driver/DocumentUploader";
import { requireDriverWithCdlState } from "@/lib/auth/guards";
import { REQUIRED_DOCUMENTS } from "@/lib/drivers/tiers";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "My documents" };

/** With ?type= (from the Roster-Ready banner's links), the uploader starts on that document. */
export default async function DriverDocumentsPage({ searchParams }: PageProps<"/driver/documents">) {
  const { user } = await requireDriverWithCdlState();
  const { type } = await searchParams;
  const initialType = REQUIRED_DOCUMENTS.find((required) => required === type);
  const { documentService } = await getContainer();
  const documents = await documentService.list(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My documents</h1>
        <p className="text-muted-foreground mt-2">
          Only you and FleetGrid staff can see your documents. A company you book a shift with can view your CDL and medical card for that shift.
        </p>
      </div>
      <DocumentUploader initialDocuments={documents} initialType={initialType} />
    </div>
  );
}
