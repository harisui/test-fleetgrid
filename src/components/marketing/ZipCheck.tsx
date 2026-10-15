"use client";

import { CircleAlert, CircleCheck, MapPinOff } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARRIERS } from "@/content/marketing";
import { normalizeZip } from "@/lib/validation/onboarding.schema";
import { checkServiceAreaAction } from "@/server/actions/marketing.actions";
import type { ZipLookup } from "@/server/services/ZipLookupService";

type Outcome =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "unknown" }
  | { kind: "failed" }
  | { kind: "answer"; place: ZipLookup };

const copy = CARRIERS.serviceArea;

/**
 * One ZIP field and a button. The server answers with the city, the state and whether the
 * yard sits in a launch area, through the same lookup the sign-up uses. Both answers lead
 * to the carrier sign-up: the launch area to checkout, the rest to the waitlist.
 */
export function ZipCheck() {
  const id = useId();
  const [zip, setZip] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  async function check(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeZip(zip);
    const digits = typeof normalized === "string" && /^\d{5}$/.test(normalized) ? normalized : null;
    if (!digits) {
      setOutcome({ kind: "invalid" });
      return;
    }
    setPending(true);
    const result = await checkServiceAreaAction(digits);
    setPending(false);
    if (!result.ok) {
      setOutcome({ kind: "failed" });
      return;
    }
    setOutcome(result.data ? { kind: "answer", place: result.data } : { kind: "unknown" });
  }

  const error =
    outcome.kind === "invalid" || outcome.kind === "unknown"
      ? copy.unknown
      : outcome.kind === "failed"
        ? copy.failed
        : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-4" data-slot="zip-check">
      <form onSubmit={check} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${id}-zip`}>{copy.label}</Label>
          <Input
            id={`${id}-zip`}
            name="zip"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            placeholder="77506"
            value={zip}
            onChange={(event) => {
              setZip(event.target.value);
              if (outcome.kind !== "idle") setOutcome({ kind: "idle" });
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className="font-mono text-code leading-code tracking-code"
          />
        </div>
        <LoadingButton type="submit" loading={pending} loadingText="Checking" className="sm:min-w-32">
          {copy.button}
        </LoadingButton>
      </form>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 text-helper leading-helper font-semibold text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {outcome.kind === "answer" && (
        <div
          role="status"
          data-slot="zip-answer"
          data-area={outcome.place.inServiceArea ? "inside" : "outside"}
          className="flex flex-col gap-3 rounded-card border border-border bg-card p-4"
        >
          <p className="flex items-start gap-2 text-label leading-label font-semibold">
            {outcome.place.inServiceArea ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
            ) : (
              <MapPinOff aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
            )}
            <span>
              {outcome.place.city}, {outcome.place.state} {outcome.place.zip}.{" "}
              {outcome.place.inServiceArea ? copy.inside : copy.outside}
            </span>
          </p>
          <Button asChild variant={outcome.place.inServiceArea ? "primary" : "secondary"} className="sm:self-start">
            <Link href={outcome.place.inServiceArea ? copy.insideCta.href : copy.outsideCta.href}>
              {outcome.place.inServiceArea ? copy.insideCta.label : copy.outsideCta.label}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
