"use client";

import { formatInTimeZone } from "date-fns-tz";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { SelectInput } from "@/components/shared/SelectInput";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NOTICE_POLICIES, NOTICE_SERVICES, NOTICE_STATES } from "@/content/sms-samples";
import { cn } from "@/lib/utils";
import type { NoticeChoicesInput } from "@/lib/validation/notice.schema";
import { previewNoticeAction, searchNoticeDriversAction, sendNoticeAction } from "@/server/actions/notice.actions";
import type { NoticeOptions, NoticePreview } from "@/server/services/NoticeService";

type Category = NoticeChoicesInput["category"];
type DriverHit = { driverId: string; fullName: string; phoneLast4: string };

const CATEGORIES: { value: Category; label: string; description: string }[] = [
  { value: "policy_change", label: "Policy change", description: "Terms, Privacy or SMS Terms change on a date. To all drivers with texts on." },
  { value: "service_notice", label: "Service notice", description: "Shift texts, logins or the website are delayed or down. To all drivers with texts on." },
  { value: "service_restored", label: "Service restored", description: "Follows a service notice from the last 48 hours." },
  { value: "account_security", label: "Account security", description: "Unusual activity on one driver's account. To that driver only." },
];

const ALL_AREAS = "all";
const options = <T extends Record<string, { label: string }>>(record: T) =>
  Object.entries(record).map(([value, { label }]) => ({ value, label }));
const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Send notice (CR-3): the admin picks a category and its choices, sees exactly what goes out
 * and to how many, and confirms. There is no text box for the message.
 */
export function NoticeComposer({
  initial,
  initialDriver,
}: {
  initial: NoticeOptions;
  initialDriver: DriverHit | null;
}) {
  const router = useRouter();
  const id = useId();
  const [category, setCategory] = useState<Category | null>(initialDriver ? "account_security" : null);
  const [policy, setPolicy] = useState("terms");
  const [date, setDate] = useState(initial.minDate);
  const [service, setService] = useState("shift_texts");
  const [state, setState] = useState("delayed");
  const [time, setTime] = useState("15:00");
  const [area, setArea] = useState(ALL_AREAS);
  const [restores, setRestores] = useState(initial.restorable[0]?.batchId ?? "");
  const [driver, setDriver] = useState<DriverHit | null>(initialDriver);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<DriverHit[]>([]);
  const [sendNow, setSendNow] = useState(false);
  const [preview, setPreview] = useState<NoticePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const areaId = area === ALL_AREAS ? null : area;
  const choices: NoticeChoicesInput | null =
    category === "policy_change"
      ? { category, policy: policy as "terms", date, areaId }
      : category === "service_notice"
        ? { category, service: service as "logins", state: state as "delayed", time, areaId, sendNow }
        : category === "service_restored"
          ? restores
            ? { category, restoresBatchId: restores }
            : null
          : category === "account_security"
            ? driver
              ? { category, driverId: driver.driverId, sendNow }
              : null
            : null;
  const key = JSON.stringify(choices);

  useEffect(() => {
    if (!key || key === "null") return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await previewNoticeAction(JSON.parse(key));
      if (!live) return;
      if (result.ok) {
        setPreview(result.data);
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(Object.values(result.error.fieldErrors ?? {})[0] ?? result.error.message);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]);

  useEffect(() => {
    if (category !== "account_security" || search.trim().length < 2) return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await searchNoticeDriversAction({ query: search });
      if (live && result.ok) setHits(result.data);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [category, search]);

  const shown = choices ? preview : null;
  const bulk = category !== "account_security";
  const ready = shown !== null && shown.blocked === null && !previewError;
  const typedOk = ready && typed.trim() === shown.confirmPhrase;
  const night = shown?.sendAfter !== null || (sendNow && shown?.canSendNow);

  const send = (confirm: string) =>
    startTransition(async () => {
      if (!choices) return;
      const result = await sendNoticeAction({ choices, confirm });
      setConfirming(false);
      if (!result.ok) {
        toast.error(Object.values(result.error.fieldErrors ?? {})[0] ?? result.error.message);
        router.refresh();
        return;
      }
      toast.success(result.data.status === "queued" ? "Notice queued for 7:00 AM" : "Notice sent");
      router.push(`/admin/messaging?tab=notices&batch=${result.data.id}`);
    });

  return (
    <div className="flex max-w-3xl flex-col gap-8" data-slot="notice-composer">
      <section aria-labelledby={`${id}-category`} className="flex flex-col gap-3">
        <h2 id={`${id}-category`} className="font-heading text-h3 leading-h3 font-semibold">
          1. Category
        </h2>
        <div role="radiogroup" aria-labelledby={`${id}-category`} className="grid gap-3 md:grid-cols-2">
          {CATEGORIES.map((item) => {
            const disabled = item.value === "service_restored" && initial.restorable.length === 0;
            return (
              <label
                key={item.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-card border-2 bg-card p-4",
                  category === item.value ? "border-foreground" : "border-border",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={item.value}
                  checked={category === item.value}
                  disabled={disabled}
                  onChange={() => {
                    setCategory(item.value);
                    setTyped("");
                    setSendNow(false);
                  }}
                  className="mt-1 size-5 accent-foreground"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{item.label}</span>
                  <span className="text-helper leading-helper text-muted-foreground">
                    {disabled ? "Only after a service notice in the last 48 hours." : item.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {category && (
        <section aria-labelledby={`${id}-choices`} className="flex flex-col gap-4">
          <h2 id={`${id}-choices`} className="font-heading text-h3 leading-h3 font-semibold">
            2. Recipients and details
          </h2>
          {category === "policy_change" && (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Policy" errorIcon={false}>
                <SelectInput value={policy} onValueChange={setPolicy} options={options(NOTICE_POLICIES)} />
              </FormField>
              <FormField label="Changes on" description={`Today to ${initial.maxDate}.`}>
                <Input type="date" value={date} min={initial.minDate} max={initial.maxDate} onChange={(e) => setDate(e.target.value)} />
              </FormField>
            </div>
          )}
          {category === "service_notice" && (
            <div className="grid gap-4 md:grid-cols-3">
              <FormField label="Service" errorIcon={false}>
                <SelectInput value={service} onValueChange={setService} options={options(NOTICE_SERVICES)} />
              </FormField>
              <FormField label="What is wrong" errorIcon={false}>
                <SelectInput
                  value={state}
                  onValueChange={setState}
                  options={Object.entries(NOTICE_STATES).map(([value, label]) => ({ value, label: label === "delayed" ? "Delayed" : "Unavailable" }))}
                />
              </FormField>
              <FormField label="Until about" description="Houston time.">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </FormField>
            </div>
          )}
          {category === "service_restored" && (
            <FormField label="Service notice this answers" errorIcon={false}>
              <SelectInput
                value={restores}
                onValueChange={setRestores}
                options={initial.restorable.map((item) => ({
                  value: item.batchId,
                  label: `${item.label}, sent ${formatInTimeZone(new Date(item.sentAt), "America/Chicago", "MMM d h:mm a")}`,
                }))}
              />
            </FormField>
          )}
          {(category === "policy_change" || category === "service_notice") && (
            <FormField label="Service area" errorIcon={false}>
              <SelectInput
                value={area}
                onValueChange={setArea}
                options={[{ value: ALL_AREAS, label: "Every driver, any area" }, ...initial.areas.map((a) => ({ value: a.id, label: a.name }))]}
              />
            </FormField>
          )}
          {category === "account_security" && (
            <div className="flex flex-col gap-3">
              <FormField label="Find the driver" description="Name, or at least 4 digits of the phone number.">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
              </FormField>
              {driver && (
                <p className="text-body leading-body" data-slot="security-driver">
                  To <span className="font-semibold">{driver.fullName}</span>, number ending {driver.phoneLast4}
                </p>
              )}
              {search.trim().length >= 2 && hits.length > 0 && (
                <ul className="flex flex-col gap-2" aria-label="Drivers found">
                  {hits.map((hit) => (
                    <li key={hit.driverId}>
                      <button
                        type="button"
                        onClick={() => {
                          setDriver(hit);
                          setSearch("");
                          setHits([]);
                        }}
                        className="flex min-h-target w-full items-center justify-between rounded-field border border-border bg-card px-3 text-left hover:border-border-strong"
                      >
                        <span>{hit.fullName}</span>
                        <span className="font-mono text-helper">ending {hit.phoneLast4}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(category === "service_notice" || category === "account_security") && (
            <div className="flex min-h-target items-center gap-3">
              <Checkbox id={`${id}-now`} checked={sendNow} onCheckedChange={(value) => setSendNow(value === true)} />
              <Label htmlFor={`${id}-now`} className="cursor-pointer font-normal">
                Send now anyway, even between 9 PM and 7 AM
              </Label>
            </div>
          )}
        </section>
      )}

      {category && (
        <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-3" data-slot="notice-preview">
          <h2 id={`${id}-preview`} className="font-heading text-h3 leading-h3 font-semibold">
            3. Preview
          </h2>
          {previewError && (
            <InlineNote variant="error" role="alert">
              {previewError}
            </InlineNote>
          )}
          {!shown && !previewError && <p className="text-body leading-body text-muted-foreground">Make the choices above to see the text.</p>}
          {shown && (
            <>
              <p className="rounded-card border-2 border-border bg-card p-4 text-body leading-body" data-slot="notice-body">
                {shown.body}
              </p>
              <p className="text-helper leading-helper text-muted-foreground" data-slot="notice-meta">
                {shown.characters} characters, {shown.segments} {shown.segments === 1 ? "segment" : "segments"}, about{" "}
                {usd(shown.estimatedCost)} (estimate)
              </p>
              <p className="text-body leading-body" data-slot="notice-recipients">
                {bulk
                  ? `${shown.recipients.count} drivers will receive this. Left out: ${shown.recipients.excluded.optedOut} opted out, ${shown.recipients.excluded.noConsent} without consent, ${shown.recipients.excluded.blocked} blocked.`
                  : shown.recipients.count === 1
                    ? `1 driver will receive this: ${shown.recipients.driver?.fullName}.`
                    : `${shown.recipients.driver?.fullName} cannot get texts.`}
              </p>
              {shown.sendAfter && (
                <InlineNote variant="info" data-slot="notice-sends-at">
                  Sends at {formatInTimeZone(new Date(shown.sendAfter), "America/Chicago", "h:mm a")}
                </InlineNote>
              )}
              {!shown.sendAfter && sendNow && night && (
                <InlineNote variant="warning" data-slot="notice-night-warning">
                  <TriangleAlert aria-hidden="true" className="inline size-4" /> This goes out now, during quiet hours. Drivers may be asleep.
                </InlineNote>
              )}
              {shown.blocked && (
                <InlineNote variant="error" data-slot="notice-blocked">
                  {shown.blocked}
                </InlineNote>
              )}
            </>
          )}
        </section>
      )}

      {category && shown && (
        <section aria-labelledby={`${id}-confirm`} className="flex flex-col gap-3">
          <h2 id={`${id}-confirm`} className="font-heading text-h3 leading-h3 font-semibold">
            4. Confirm
          </h2>
          {bulk ? (
            <>
              <FormField label={`Type ${shown.confirmPhrase} to send`}>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={!ready} />
              </FormField>
              <LoadingButton type="button" loading={pending} loadingText="Sending..." disabled={!typedOk} onClick={() => send(typed)}>
                {shown.sendAfter ? "Queue for 7:00 AM" : "Send notice"}
              </LoadingButton>
            </>
          ) : (
            <>
              <LoadingButton type="button" loading={pending} loadingText="Sending..." disabled={!ready} onClick={() => setConfirming(true)}>
                {shown.sendAfter ? "Queue for 7:00 AM" : "Send security notice"}
              </LoadingButton>
              <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={`Send the security notice to ${shown.recipients.driver?.fullName}?`}
                description={shown.body}
                confirmLabel="Send"
                pendingLabel="Sending..."
                pending={pending}
                onConfirm={() => send("SEND 1")}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
