"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { removeAccountAction } from "@/server/actions/admin-ops.actions";

/** Remove an account for good: the admin types REMOVE first. */
export function RemoveAccountButton({ profileId, name, afterHref }: { profileId: string; name: string; afterHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button type="button" variant="destructive" size="md" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {name}?</DialogTitle>
            <DialogDescription>
              The account, its card or company, its files and its subscription are deleted for good. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Type REMOVE to confirm">
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)}>
              Keep
            </Button>
            <LoadingButton
              type="button"
              variant="destructive"
              size="md"
              loading={pending}
              loadingText="Removing..."
              disabled={typed !== "REMOVE"}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeAccountAction({ profileId, confirm: typed });
                  if (!result.ok) {
                    toast.error(result.error.message);
                    return;
                  }
                  toast.success(`${name} removed`);
                  setOpen(false);
                  router.push(afterHref);
                })
              }
            >
              Remove for good
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
