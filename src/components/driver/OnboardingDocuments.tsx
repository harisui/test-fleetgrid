"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UploadTile, type UploadTileState } from "@/components/driver/UploadTile";
import { prepareFileForUpload } from "@/lib/image";
import { ONBOARDING_DOCUMENT_TILES } from "@/lib/onboarding/options";
import { uploadWithToken } from "@/lib/supabase/upload";
import { validateUploadFile } from "@/lib/validation/document.schema";
import {
  confirmDocumentUploadAction,
  deleteDocumentAction,
  prepareDocumentUploadAction,
} from "@/server/actions/driver.actions";
import type { DocumentType, DriverDocument } from "@/types/domain";

const UPLOAD_FAILED = "The upload did not finish. Check your signal and try again.";

interface OnboardingDocumentsProps {
  documents: DriverDocument[];
  onChange: (documents: DriverDocument[]) => void;
}

/**
 * The three paper tiles of the Papers screen. Each upload is compressed in the browser,
 * reserved on the server, sent straight to private storage and then confirmed, like the
 * documents page. One tile can be busy at a time.
 */
export function OnboardingDocuments({ documents, onChange }: OnboardingDocumentsProps) {
  const [busy, setBusy] = useState<Partial<Record<DocumentType, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<DocumentType, string>>>({});
  const [removing, setRemoving] = useState<DocumentType | null>(null);

  const latestOf = (type: DocumentType) =>
    documents
      .filter((document) => document.type === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  function setBusyFor(type: DocumentType, status: string | undefined) {
    setBusy((current) => ({ ...current, [type]: status }));
  }

  async function upload(type: DocumentType, original: File) {
    if (busy[type]) return;
    setErrors((current) => ({ ...current, [type]: undefined }));

    const fail = (message: string) => {
      setBusyFor(type, undefined);
      setErrors((current) => ({ ...current, [type]: message }));
    };

    const typeProblem = validateUploadFile(original);
    if (typeProblem) return fail(typeProblem);

    setBusyFor(type, "Preparing...");
    const file = await prepareFileForUpload(original);
    const sizeProblem = validateUploadFile(file);
    if (sizeProblem) return fail(sizeProblem);

    setBusyFor(type, "Uploading...");
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

    setBusyFor(type, "Checking...");
    const confirmed = await confirmDocumentUploadAction({
      type,
      fileName: file.name,
      storagePath: prepared.data.storagePath,
    });
    if (!confirmed.ok) {
      const fields = confirmed.error.fieldErrors;
      return fail(fields?.mimeType ?? fields?.sizeBytes ?? confirmed.error.message);
    }

    // Replacing: the older file of the same type goes away quietly.
    const previous = latestOf(type);
    if (previous) await deleteDocumentAction({ documentId: previous.id });
    onChange([confirmed.data, ...documents.filter((document) => document.id !== previous?.id)]);
    setBusyFor(type, undefined);
    toast.success("Saved");
  }

  async function remove(type: DocumentType) {
    const document = latestOf(type);
    if (!document || removing) return;
    setRemoving(type);
    const result = await deleteDocumentAction({ documentId: document.id });
    setRemoving(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    onChange(documents.filter((item) => item.id !== document.id));
    toast.success("Removed");
  }

  return (
    <div className="flex flex-col gap-3" data-slot="onboarding-documents">
      {ONBOARDING_DOCUMENT_TILES.map((tile) => {
        const document = latestOf(tile.type);
        const status = busy[tile.type];
        const error = errors[tile.type];
        const state: UploadTileState = status
          ? { kind: "uploading", status }
          : error
            ? { kind: "error", message: error }
            : document
              ? { kind: "done", document }
              : { kind: "empty" };
        return (
          <UploadTile
            key={tile.type}
            label={tile.label}
            state={state}
            onFile={(file) => void upload(tile.type, file)}
            onRemove={() => void remove(tile.type)}
            removing={removing === tile.type}
            disabled={Object.values(busy).some(Boolean) && !status}
          />
        );
      })}
    </div>
  );
}
