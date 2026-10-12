"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { TERMS_MESSAGE } from "@/lib/validation/carrier.schema";
import { acceptTermsAction } from "@/server/actions/carrier.actions";

export const TERMS_STATEMENT =
  "I have read and agree to the FleetGrid Terms of Service and Privacy Policy on behalf of my company.";

const linkClass = "font-semibold text-foreground underline underline-offset-4";

/** The Terms checkbox and the button. The box starts unchecked; the acceptance is logged. */
export function TermsAcceptance() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!accepted) {
      setError(TERMS_MESSAGE);
      return;
    }
    setPending(true);
    setError(undefined);
    const result = await acceptTermsAction({ accepted });
    if (!result.ok) {
      setPending(false);
      setError(result.error.fieldErrors?.accepted ?? result.error.message);
      return;
    }
    router.push("/carrier");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <ConsentCard
        id="terms-accepted"
        checked={accepted}
        onCheckedChange={(next) => {
          setAccepted(next);
          if (next) setError(undefined);
        }}
        text={TERMS_STATEMENT}
        error={error && accepted ? undefined : error}
        disabled={pending}
      >
        Read the{" "}
        <Link href="/terms" className={linkClass} target="_blank" rel="noopener">
          Terms of Service
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className={linkClass} target="_blank" rel="noopener">
          Privacy Policy
        </Link>
        .
      </ConsentCard>
      {error && accepted && (
        <InlineNote variant="error" role="alert">
          {error}
        </InlineNote>
      )}
      <LoadingButton type="submit" loading={pending} loadingText="Saving...">
        Accept and continue
      </LoadingButton>
    </form>
  );
}
