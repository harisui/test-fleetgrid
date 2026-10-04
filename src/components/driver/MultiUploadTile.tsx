"use client";

import { CircleAlert, FileText } from "lucide-react";
import { useRef } from "react";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { ALLOWED_UPLOAD_MIME } from "@/lib/constants";
import { formatFileSize } from "@/lib/image";
import { cn } from "@/lib/utils";
import type { DriverDocument } from "@/types/domain";

interface MultiUploadTileProps {
  label: string;
  helper: string;
  /** Files already uploaded for this tile, newest first. */
  documents: DriverDocument[];
  max: number;
  /** Status text while a file is on its way. */
  status?: string;
  error?: string;
  onFile: (file: File) => void;
  onRemove: (document: DriverDocument) => void;
  removingId?: string | null;
  disabled?: boolean;
}

const IMAGE_MIME = ALLOWED_UPLOAD_MIME.filter((type) => type.startsWith("image/")).join(",");

/**
 * A paper that comes in several files, like certificates. Lists what is there with a
 * Remove for each, and offers "Take a photo" and "Choose from phone" until the tile is full.
 */
export function MultiUploadTile({
  label,
  helper,
  documents,
  max,
  status,
  error,
  onFile,
  onRemove,
  removingId,
  disabled,
}: MultiUploadTileProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = status !== undefined;
  const busy = uploading || disabled;
  const full = documents.length >= max;
  const lower = label.toLowerCase();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  }

  return (
    <div
      data-slot="multi-upload-tile"
      data-count={documents.length}
      className={cn(
        "flex flex-col gap-3 rounded-card border-2 bg-card p-3",
        error
          ? "border-solid border-destructive"
          : documents.length > 0 || uploading
            ? "border-solid border-border-strong"
            : "border-dashed border-border-strong",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-field bg-muted text-foreground"
        >
          {error ? (
            <CircleAlert className="size-6 text-destructive" />
          ) : (
            <FileText className="size-6" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body leading-body font-semibold">{label}</p>
          <p className="text-helper leading-helper text-muted-foreground">
            {error ? (
              <span role="alert" className="font-semibold text-destructive">
                {error}
              </span>
            ) : uploading ? (
              status
            ) : (
              helper
            )}
          </p>
        </div>
        <span className="shrink-0 text-helper leading-helper text-muted-foreground tabular-nums">
          {documents.length} of {max}
        </span>
      </div>

      {documents.length > 0 && (
        <ul className="flex flex-col divide-y divide-border" aria-label={`${label} files`}>
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-3 py-1">
              <p className="min-w-0 flex-1 truncate text-helper leading-helper">
                {document.fileName} · {formatFileSize(document.sizeBytes)}
              </p>
              <LoadingButton
                type="button"
                variant="ghost"
                size="md"
                className="shrink-0 underline underline-offset-4"
                onClick={() => onRemove(document)}
                loading={removingId === document.id}
                loadingText="Removing..."
                disabled={busy || (removingId !== null && removingId !== undefined)}
                aria-label={`Remove ${document.fileName}`}
              >
                Remove
              </LoadingButton>
            </li>
          ))}
        </ul>
      )}

      {uploading && (
        <div
          role="progressbar"
          aria-label={`${label} upload`}
          aria-valuetext={status}
          className="h-2 overflow-hidden rounded-badge bg-progress-track"
        >
          <div className="h-full w-1/2 animate-pulse rounded-badge bg-progress-fill" />
        </div>
      )}

      <input
        ref={cameraInput}
        type="file"
        accept={IMAGE_MIME}
        capture="environment"
        onChange={handleChange}
        className="sr-only"
        aria-label={`Take a photo of ${lower}`}
        tabIndex={-1}
      />
      <input
        ref={fileInput}
        type="file"
        accept={ALLOWED_UPLOAD_MIME.join(",")}
        onChange={handleChange}
        className="sr-only"
        aria-label={`Choose a file for ${lower}`}
        tabIndex={-1}
      />

      {full ? (
        <p className="text-helper leading-helper text-muted-foreground" data-slot="tile-full">
          You can add up to {max} other papers. Remove one to add another.
        </p>
      ) : uploading ? null : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            size="md"
            className="px-2"
            onClick={() => cameraInput.current?.click()}
            disabled={busy}
          >
            {error ? "Try again" : "Take a photo"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="px-2"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            Choose from phone
          </Button>
        </div>
      )}
    </div>
  );
}
