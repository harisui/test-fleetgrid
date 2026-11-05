"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { previewDocReminderAction, sendDocReminderAction } from "@/server/actions/docReminder.actions";
import type { DocReminderPreview } from "@/server/services/DocReminderService";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The missing-documents reminder (CR-5). With a driver: on their sheet, the exact text and a
 * dialog. Without: "Remind all drivers missing documents" on the Drivers page, with the count,
 * who is left out and why, and the typed SEND {N} the server checks against its own recount.
 * Disabled with the reason when nobody can get one. The button follows the page's preview; an
 * open dialog shows the one it reloaded, so the counts are current when the admin decides.
 */
export function DocReminderButton({
  driverId,
  name,
  initial,
}: {
  driverId?: string;
  name?: string;
  initial: DocReminderPreview;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<DocReminderPreview | null>(null);
  const preview = (open && fresh) || initial;
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const bulk = !driverId;
  const label = bulk ? "Remind all drivers missing documents" : "Send documents reminder";

  async function reload() {
    const result = await previewDocReminderAction(driverId ? { driverId } : {});
    if (result.ok) setFresh(result.data);
  }

  async function openDialog() {
    setTyped("");
    setFresh(null);
    setOpen(true);
    await reload();
  }

  async function send() {
    setPending(true);
    const result = await sendDocReminderAction(driverId ? { driverId } : { confirm: typed });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error.fieldErrors?.confirm ?? result.error.message);
      await reload();
      return;
    }
    setOpen(false);
    toast.success(result.data.status === "queued" ? "Queued for 7:00 AM" : bulk ? "Reminders sent" : "Reminder sent");
    router.refresh();
  }

  const { excluded } = preview;
  const ready = preview.blocked === null;
  const typedOk = bulk ? typed.trim() === preview.confirmPhrase : true;

  return (
    <div className="flex flex-col gap-1" data-slot={bulk ? "doc-reminder-bulk" : "doc-reminder"}>
      <Button
        type="button"
        size="md"
        variant="secondary"
        onClick={() => void openDialog()}
        disabled={!ready}
        aria-describedby={ready ? undefined : `${id}-reason`}
      >
        {label}
      </Button>
      {!ready && (
        <span id={`${id}-reason`} className="text-small leading-small text-muted-foreground" data-slot="doc-reminder-reason">
          {preview.blocked}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-slot="doc-reminder-dialog">
          <DialogHeader>
            <DialogTitle>{bulk ? "Remind all drivers missing documents?" : `Send the documents reminder to ${name}?`}</DialogTitle>
            <DialogDescription>
              {bulk
                ? "Each driver's text names what they are missing. One reminder per driver every 3 days."
                : "One reminder per driver every 3 days."}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-card border-2 border-border bg-card p-4 text-body leading-body" data-slot="doc-reminder-body">
            {preview.body}
          </p>
          {bulk && (
            <div className="flex flex-col gap-2 text-body leading-body" data-slot="doc-reminder-recipients">
              <p>{plural(preview.count, "driver will receive this", "drivers will receive this")}.</p>
              <ul className="list-disc pl-6 text-helper leading-helper text-muted-foreground">
                {Object.entries(preview.byItems).map(([items, count]) => (
                  <li key={items}>
                    {items}: {count}
                  </li>
                ))}
              </ul>
              <p className="text-helper leading-helper text-muted-foreground" data-slot="doc-reminder-excluded">
                Left out: {excluded.optedOut} opted out, {excluded.noConsent} without consent, {excluded.recent} reminded in the last 3 days.
              </p>
            </div>
          )}
          {preview.sendAfter && (
            <InlineNote variant="info" data-slot="doc-reminder-sends-at">
              Sends at {formatInTimeZone(new Date(preview.sendAfter), "America/Chicago", "h:mm a")}
            </InlineNote>
          )}
          {preview.blocked && (
            <InlineNote variant="error" data-slot="doc-reminder-blocked">
              {preview.blocked}
            </InlineNote>
          )}
          {bulk && ready && (
            <FormField label={`Type ${preview.confirmPhrase} to send`}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <LoadingButton
              type="button"
              size="md"
              loading={pending}
              loadingText="Sending..."
              disabled={!ready || !typedOk}
              onClick={() => void send()}
            >
              {preview.sendAfter ? "Queue for 7:00 AM" : bulk ? "Send reminders" : "Send reminder"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
