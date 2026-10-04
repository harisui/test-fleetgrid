"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MultiUploadTile } from "@/components/driver/MultiUploadTile";
import { UploadTile, type UploadTileState } from "@/components/driver/UploadTile";
import { prepareFileForUpload } from "@/lib/image";
import { ONBOARDING_DOCUMENT_TILES, type DocumentTile } from "@/lib/onboarding/options";
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
  /** Every document the driver has; each tile picks out its own type. */
  documents: DriverDocument[];
  onChange: (documents: DriverDocument[]) => void;
  /** Which tiles to show. The Papers screen shows all four; the Documents page only Other papers. */
  tiles?: readonly DocumentTile[];
}

/**
 * The paper tiles: one file each for the CDL and the medical card, up to five for other
 * papers. Each upload is compressed in the browser, reserved on the server, sent straight to
 * private storage and then confirmed, like the documents page. One tile can be busy at a time.
 */
export function OnboardingDocuments({
  documents,
  onChange,
  tiles = ONBOARDING_DOCUMENT_TILES,
}: OnboardingDocumentsProps) {
  const [busy, setBusy] = useState<Partial<Record<DocumentType, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<DocumentType, string>>>({});
  const [removingId, setRemovingId] = useState<string | null>(null);

  const documentsOf = (type: DocumentType) =>
    documents
      .filter((document) => document.type === type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function setBusyFor(type: DocumentType, status: string | undefined) {
    setBusy((current) => ({ ...current, [type]: status }));
  }

  async function upload(tile: DocumentTile, original: File) {
    const { type } = tile;
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

    // A one-file tile replaces its older file quietly; a multi-file tile keeps them all.
    const replaced = tile.max === 1 ? documentsOf(type)[0] : undefined;
    if (replaced) await deleteDocumentAction({ documentId: replaced.id });
    onChange([confirmed.data, ...documents.filter((document) => document.id !== replaced?.id)]);
    setBusyFor(type, undefined);
    toast.success("Saved");
  }

  async function remove(document: DriverDocument | undefined) {
    if (!document || removingId) return;
    setRemovingId(document.id);
    const result = await deleteDocumentAction({ documentId: document.id });
    setRemovingId(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    onChange(documents.filter((item) => item.id !== document.id));
    toast.success("Removed");
  }

  const anyBusy = Object.values(busy).some(Boolean);

  return (
    <div className="flex flex-col gap-3" data-slot="onboarding-documents">
      {tiles.map((tile) => {
        const own = documentsOf(tile.type);
        const status = busy[tile.type];
        const error = errors[tile.type];
        if (tile.max > 1) {
          return (
            <MultiUploadTile
              key={tile.type}
              label={tile.label}
              helper={tile.helper ?? ""}
              documents={own}
              max={tile.max}
              status={status}
              error={error}
              onFile={(file) => void upload(tile, file)}
              onRemove={(document) => void remove(document)}
              removingId={removingId}
              disabled={anyBusy && !status}
            />
          );
        }
        const document = own[0];
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
            onFile={(file) => void upload(tile, file)}
            onRemove={() => void remove(document)}
            removing={document !== undefined && removingId === document.id}
            disabled={anyBusy && !status}
          />
        );
      })}
    </div>
  );
}
