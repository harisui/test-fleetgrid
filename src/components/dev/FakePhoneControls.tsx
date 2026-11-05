"use client";

import { useState, useTransition } from "react";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { SelectInput } from "@/components/shared/SelectInput";
import { Input } from "@/components/ui/input";
import { DRIVER_STATUS_LABELS } from "@/lib/drivers/tiers";
import { createFakeDriversAction, sendFakeReplyAction } from "@/server/actions/devPhones.actions";

const CHOICES = {
  cdlClass: { label: "CDL class", options: [{ value: "A", label: "Class A" }, { value: "B", label: "Class B" }] },
  endorsements: { label: "Endorsements", options: [{ value: "yes", label: "H, N, T, X" }, { value: "no", label: "None" }] },
  tier: { label: "Status", options: [{ value: "roster_ready", label: DRIVER_STATUS_LABELS.approved }, { value: "registered", label: DRIVER_STATUS_LABELS.pending }] },
  twic: { label: "TWIC", options: [{ value: "valid", label: "Valid" }, { value: "expired", label: "Expired" }, { value: "none", label: "None" }] },
  place: { label: "Place", options: [{ value: "pasadena", label: "Pasadena" }, { value: "houston", label: "Houston" }, { value: "dallas", label: "Dallas (out of range)" }] },
  texts: { label: "Texts", options: [{ value: "on", label: "Opted in" }, { value: "stopped", label: "Replied STOP" }, { value: "no_consent", label: "No consent" }] },
  paused: { label: "Shift offers", options: [{ value: "no", label: "On" }, { value: "yes", label: "Paused" }] },
} as const;

type ChoiceKey = keyof typeof CHOICES;

const FIRST_CHOICES = Object.fromEntries(
  (Object.keys(CHOICES) as ChoiceKey[]).map((key) => [key, CHOICES[key].options[0].value]),
) as Record<ChoiceKey, string>;

/** Makes fake drivers with the chosen profile. */
export function CreateFakeDrivers() {
  const [count, setCount] = useState("1");
  const [choices, setChoices] = useState(FIRST_CHOICES);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-5" aria-labelledby="create-fake">
      <h2 id="create-fake" className="font-heading text-h3 leading-h3 font-semibold">
        Add fake drivers
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="How many">
          <Input type="number" min={1} max={20} value={count} onChange={(event) => setCount(event.target.value)} />
        </FormField>
        {(Object.keys(CHOICES) as ChoiceKey[]).map((key) => (
          <FormField key={key} label={CHOICES[key].label} errorIcon={false}>
            <SelectInput value={choices[key]} onValueChange={(value) => setChoices((now) => ({ ...now, [key]: value }))} options={CHOICES[key].options} />
          </FormField>
        ))}
      </div>
      {error && <p role="alert" className="text-small leading-small text-destructive">{error}</p>}
      <LoadingButton
        variant="secondary"
        className="self-start"
        loading={pending}
        loadingText="Adding..."
        onClick={() =>
          startTransition(async () => {
            const result = await createFakeDriversAction({ ...choices, count, endorsements: choices.endorsements === "yes", paused: choices.paused === "yes" });
            setError(result.ok ? null : result.error.message);
          })
        }
      >
        Add drivers
      </LoadingButton>
    </section>
  );
}

/** The reply box: goes through the real webhook, signature and all. */
export function FakeReplyBox({ phone }: { phone: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await sendFakeReplyAction({ phone, body });
          setError(result.ok ? null : result.error.message);
          if (result.ok) setBody("");
        });
      }}
    >
      <FormField label="Reply">
        <Input value={body} onChange={(event) => setBody(event.target.value)} maxLength={160} />
      </FormField>
      {error && <p role="alert" className="text-small leading-small text-destructive">{error}</p>}
      <LoadingButton type="submit" className="self-start" loading={pending} loadingText="Sending...">
        Send reply
      </LoadingButton>
    </form>
  );
}
