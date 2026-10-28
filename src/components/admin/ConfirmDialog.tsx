"use client";

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

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the record and the action, for example "Block Juan Ramirez?". */
  title: string;
  /** Says what happens, for example "He will be signed out and hidden from carriers." */
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "destructive";
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Approve, block, deactivate: the dialog that names the record and the effect before anything changes. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel = "Saving...",
  variant = "primary",
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} data-slot="confirm-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" size="md" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <LoadingButton
            type="button"
            variant={variant}
            size="md"
            loading={pending}
            loadingText={pendingLabel}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
