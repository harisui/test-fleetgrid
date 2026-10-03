"use client";

import { CircleAlert, CircleCheck, FileText } from "lucide-react";
import { useRef } from "react";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { ALLOWED_UPLOAD_MIME } from "@/lib/constants";
import { formatFileSize } from "@/lib/image";
import { cn } from "@/lib/utils";
import type { DriverDocument } from "@/types/domain";

export type UploadTileState =
  | { kind: "empty" }
  | { kind: "uploading"; status: string }
  | { kind: "done"; document: DriverDocument }
  | { kind: "error"; message: string };

interface UploadTileProps {
  label: string;
  state: UploadTileState;
  onFile: (file: File) => void;
  onRemove?: () => void;
  removing?: boolean;
  disabled?: boolean;
}

const IMAGE_MIME = ALLOWED_UPLOAD_MIME.filter((type) => type.startsWith("image/")).join(",");

/**
 * One paper. "Take a photo" opens the rear camera on phones; "Choose from phone" opens the
 * file picker. States: empty, uploading, done (with Replace and Remove), error (Try again).
 */
export function UploadTile({
  label,
  state,
  onFile,
  onRemove,
  removing,
  disabled,
}: UploadTileProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = state.kind === "uploading" || disabled;

  function pick(input: HTMLInputElement | null) {
    input?.click();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Allow choosing the same file again after an error.
    event.target.value = "";
    if (file) onFile(file);
  }

  return (
    <div
      data-slot="upload-tile"
      data-state={state.kind}
      className={cn(
        "flex flex-col gap-3 rounded-card border-2 bg-card p-3",
        state.kind === "done"
          ? "border-solid border-success"
          : state.kind === "error"
            ? "border-solid border-destructive"
            : state.kind === "uploading"
              ? "border-solid border-border-strong"
              : "border-dashed border-border-strong",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-field",
            state.kind === "done" ? "bg-success-subtle text-success" : "bg-muted text-foreground",
          )}
        >
          {state.kind === "done" ? (
            <CircleCheck className="size-6" />
          ) : state.kind === "error" ? (
            <CircleAlert className="size-6 text-destructive" />
          ) : (
            <FileText className="size-6" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body leading-body font-semibold">{label}</p>
          <p className="truncate text-helper leading-helper text-muted-foreground">
            {state.kind === "done" &&
              `${state.document.fileName} · ${formatFileSize(state.document.sizeBytes)}`}
            {state.kind === "uploading" && state.status}
            {state.kind === "empty" && "JPG, PNG, WebP or PDF, up to 10 MB"}
            {state.kind === "error" && (
              <span role="alert" className="font-semibold text-destructive">
                {state.message}
              </span>
            )}
          </p>
        </div>
      </div>

      {state.kind === "uploading" && (
        <div
          role="progressbar"
          aria-label={`${label} upload`}
          aria-valuetext={state.status}
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
        aria-label={`Take a photo of ${label.toLowerCase()}`}
        tabIndex={-1}
      />
      <input
        ref={fileInput}
        type="file"
        accept={ALLOWED_UPLOAD_MIME.join(",")}
        onChange={handleChange}
        className="sr-only"
        aria-label={`Choose a file for ${label.toLowerCase()}`}
        tabIndex={-1}
      />

      {state.kind === "done" ? (
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => pick(fileInput.current)}
            disabled={busy || removing}
          >
            Replace
          </Button>
          <LoadingButton
            type="button"
            variant="secondary"
            size="md"
            onClick={onRemove}
            loading={removing}
            loadingText="Removing..."
            disabled={busy}
          >
            Remove
          </LoadingButton>
        </div>
      ) : state.kind === "uploading" ? null : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            size="md"
            className="px-2"
            onClick={() => pick(cameraInput.current)}
            disabled={busy}
          >
            {state.kind === "error" ? "Try again" : "Take a photo"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="px-2"
            onClick={() => pick(fileInput.current)}
            disabled={busy}
          >
            Choose from phone
          </Button>
        </div>
      )}
    </div>
  );
}
