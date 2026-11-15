"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { ACCEPT_TERMS_LABEL, DRIVER_TERMS_MESSAGE, DRIVER_TERMS_STATEMENT } from "@/lib/legal/terms-acceptance";
import { acceptDriverTermsAction, acceptTermsByLinkAction } from "@/server/actions/terms.actions";

const linkClass = "font-semibold text-foreground underline underline-offset-4";

/** Signed in on the Terms page, or through a one-time link (no session). */
export type DriverTermsMode = { kind: "gate" } | { kind: "link"; token: string };

/**
 * The driver's acceptance (Milestone 6): an unchecked box with the exact statement that is
 * stored, and the button. Opening the page records nothing; only the button does.
 */
export function DriverTermsForm({ mode }: { mode: DriverTermsMode }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!accepted) {
      setError(DRIVER_TERMS_MESSAGE);
      return;
    }
    setPending(true);
    setError(undefined);
    const result =
      mode.kind === "gate" ? await acceptDriverTermsAction(true) : await acceptTermsByLinkAction(mode.token, true);
    if (!result.ok) {
      setPending(false);
      setError(result.error.fieldErrors?.accepted ?? result.error.message);
      return;
    }
    if (mode.kind === "gate") {
      router.push("/driver");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <InlineNote variant="success" role="status">
        Thank you. You accepted the Terms of Service. Your shift offers continue as before. You can close
        this page.
      </InlineNote>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <ConsentCard
        id="driver-terms-accepted"
        checked={accepted}
        onCheckedChange={(next) => {
          setAccepted(next);
          if (next) setError(undefined);
        }}
        text={DRIVER_TERMS_STATEMENT}
        error={error && !accepted ? error : undefined}
        disabled={pending}
      >
        The full{" "}
        <Link href="/terms" className={linkClass} target="_blank" rel="noopener">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className={linkClass} target="_blank" rel="noopener">
          Privacy Policy
        </Link>{" "}
        also open in a new tab.
      </ConsentCard>
      {error && accepted && (
        <InlineNote variant="error" role="alert">
          {error}
        </InlineNote>
      )}
      <LoadingButton type="submit" loading={pending} loadingText="Saving...">
        {ACCEPT_TERMS_LABEL}
      </LoadingButton>
    </form>
  );
}
