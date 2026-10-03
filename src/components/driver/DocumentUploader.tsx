"use client";

import { Eye, FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectInput } from "@/components/shared/SelectInput";
import { ALLOWED_UPLOAD_MIME } from "@/lib/constants";
import { formatFileSize, prepareFileForUpload } from "@/lib/image";
import { uploadWithToken } from "@/lib/supabase/upload";
import { validateUploadFile } from "@/lib/validation/document.schema";
import {
  confirmDocumentUploadAction,
  deleteDocumentAction,
  getDocumentPreviewUrlAction,
  prepareDocumentUploadAction,
} from "@/server/actions/driver.actions";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  type DocumentType,
  type DriverDocument,
} from "@/types/domain";

const UPLOAD_FAILED = "Upload failed. Please try again.";

interface DocumentUploaderProps {
  initialDocuments: DriverDocument[];
}

interface Preview {
  document: DriverDocument;
  url: string;
}

/**
 * Upload, list, preview and delete the driver's own documents.
 * Images are compressed in the browser before upload. PDFs are sent as they are.
 */
export function DocumentUploader({ initialDocuments }: DocumentUploaderProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [type, setType] = useState<DocumentType>("cdl_front");
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [preview, setPreview] = useState<Preview>();
  const [toDelete, setToDelete] = useState<DriverDocument>();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = status !== undefined;

  function fail(message: string) {
    setStatus(undefined);
    setError(message);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const original = event.target.files?.[0];
    // Allow choosing the same file again after an error.
    event.target.value = "";
    if (!original || uploading) return;
    setError(undefined);

    const typeProblem = validateUploadFile(original);
    if (typeProblem) return fail(typeProblem);

    setStatus("Preparing...");
    const file = await prepareFileForUpload(original);
    const sizeProblem = validateUploadFile(file);
    if (sizeProblem) return fail(sizeProblem);

    setStatus("Uploading...");
    const prepared = await prepareDocumentUploadAction({
      type,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!prepared.ok) {
      const fields = prepared.error.fieldErrors;
      return fail(fields?.mimeType ?? fields?.sizeBytes ?? prepared.error.message);
    }

    const stored = await uploadWithToken(prepared.data.storagePath, prepared.data.token, file);
    if (!stored) return fail(UPLOAD_FAILED);

    const confirmed = await confirmDocumentUploadAction({
      type,
      fileName: file.name,
      storagePath: prepared.data.storagePath,
    });
    if (!confirmed.ok) {
      const fields = confirmed.error.fieldErrors;
      return fail(fields?.mimeType ?? fields?.sizeBytes ?? confirmed.error.message);
    }

    setDocuments((current) => [confirmed.data, ...current]);
    setStatus(undefined);
    toast.success("Document uploaded");
  }

  async function handlePreview(document: DriverDocument) {
    setBusyId(document.id);
    const result = await getDocumentPreviewUrlAction({ documentId: document.id });
    setBusyId(undefined);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setPreview({ document, url: result.data.url });
  }

  async function handleDelete() {
    if (!toDelete) return;
    const document = toDelete;
    setBusyId(document.id);
    const result = await deleteDocumentAction({ documentId: document.id });
    setBusyId(undefined);
    setToDelete(undefined);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    toast.success("Document deleted");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-card border border-border bg-card p-4">
        <FormField label="Document type">
          <SelectInput
            value={type}
            onValueChange={(value) => setType(value as DocumentType)}
            options={DOCUMENT_TYPES.map((value) => ({
              value,
              label: DOCUMENT_TYPE_LABELS[value],
            }))}
            disabled={uploading}
          />
        </FormField>

        <input
          ref={fileInput}
          type="file"
          accept={ALLOWED_UPLOAD_MIME.join(",")}
          onChange={handleFile}
          className="sr-only"
          aria-label="Choose a file to upload"
          tabIndex={-1}
        />
        <LoadingButton
          type="button"
          variant="secondary"
          loading={uploading}
          loadingText={status}
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden="true" />
          Choose photo or PDF
        </LoadingButton>
        <p className="text-helper leading-helper text-muted-foreground">
          JPG, PNG, WebP or PDF. Up to 10 MB.
        </p>

        {error && (
          <InlineNote variant="error" role="alert">
            {error}
          </InlineNote>
        )}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload your CDL, medical card or certifications."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Uploaded documents">
          {documents.map((document) => {
            const Icon = document.mimeType === "application/pdf" ? FileText : ImageIcon;
            const busy = busyId === document.id;
            return (
              <li
                key={document.id}
                className="flex items-center gap-3 rounded-card border border-border bg-card p-3"
              >
                <Icon aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-label leading-label font-semibold">
                    {DOCUMENT_TYPE_LABELS[document.type]}
                  </p>
                  <p className="truncate text-helper leading-helper text-muted-foreground">
                    {document.fileName} · {formatFileSize(document.sizeBytes)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePreview(document)}
                  disabled={busy}
                  aria-label={`Preview ${document.fileName}`}
                >
                  <Eye aria-hidden="true" className="size-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setToDelete(document)}
                  disabled={busy}
                  aria-label={`Delete ${document.fileName}`}
                >
                  <Trash2 aria-hidden="true" className="size-5 text-destructive" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={preview !== undefined} onOpenChange={(open) => !open && setPreview(undefined)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{preview && DOCUMENT_TYPE_LABELS[preview.document.type]}</DialogTitle>
            <DialogDescription>{preview?.document.fileName}</DialogDescription>
          </DialogHeader>
          {preview &&
            (preview.document.mimeType === "application/pdf" ? (
              <Button asChild>
                <a href={preview.url} target="_blank" rel="noopener noreferrer">
                  Open PDF
                </a>
              </Button>
            ) : (
              // A short-lived signed URL: next/image optimization does not apply.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={`${DOCUMENT_TYPE_LABELS[preview.document.type]} preview`}
                className="max-h-[70dvh] w-full rounded-field object-contain"
              />
            ))}
        </DialogContent>
      </Dialog>

      <Dialog
        open={toDelete !== undefined}
        onOpenChange={(open) => !open && !busyId && setToDelete(undefined)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this document?</DialogTitle>
            <DialogDescription>{toDelete?.fileName} will be removed permanently.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setToDelete(undefined)}
              disabled={busyId !== undefined}
            >
              Cancel
            </Button>
            <LoadingButton
              type="button"
              variant="destructive"
              loading={busyId !== undefined}
              loadingText="Deleting..."
              onClick={handleDelete}
            >
              Delete
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
