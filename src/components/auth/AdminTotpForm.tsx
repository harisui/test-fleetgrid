"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Input } from "@/components/ui/input";
import type { TotpEnrollment } from "@/server/repositories/AdminAuthRepository";
import { startTotpEnrollmentAction, verifyTotpAction } from "@/server/actions/admin-auth.actions";

interface AdminTotpFormProps {
  /** "verify": a code from the app already set up. "enroll": set one up first. */
  mode: "verify" | "enroll";
  /** The confirmed authenticator, in "verify" mode. */
  factorId?: string;
}

/** Admin sign-in, step 2 of 2: a code from an authenticator app, set up on the first sign-in. */
export function AdminTotpForm({ mode, factorId }: AdminTotpFormProps) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<TotpEnrollment>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const activeFactor = mode === "verify" ? factorId : enrollment?.factorId;

  async function startSetup() {
    setPending(true);
    setError(undefined);
    const result = await startTotpEnrollmentAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEnrollment(result.data);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !activeFactor) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setPending(true);
    setError(undefined);
    const result = await verifyTotpAction({ factorId: activeFactor, code });
    if (!result.ok) {
      setPending(false);
      setError(result.error.fieldErrors?.code ?? result.error.message);
      return;
    }
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  if (mode === "enroll" && !enrollment) {
    return (
      <div className="flex flex-col gap-5" data-slot="totp-setup-start">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-body leading-body">
          <li>Install an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
          <li>Show the QR code below and scan it with the app.</li>
          <li>Type the 6-digit code the app shows.</li>
        </ol>
        {error && (
          <InlineNote variant="error" role="alert">
            {error}
          </InlineNote>
        )}
        <LoadingButton type="button" onClick={startSetup} loading={pending} loadingText="Preparing...">
          Show the QR code
        </LoadingButton>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label="Authenticator code">
      {enrollment && (
        <div className="flex flex-col items-center gap-3" data-slot="totp-qr">
          {/* The QR code is an SVG data URL from Supabase Auth; next/image does not load data URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrCode} alt="QR code to scan with your authenticator app" className="size-48 rounded-card border border-border bg-print-paper p-2" />
          <p className="text-helper leading-helper text-muted-foreground">
            Can&apos;t scan it? Enter this key in the app instead:
          </p>
          <code className="font-mono text-label leading-label break-all" data-slot="totp-secret">
            {enrollment.secret}
          </code>
        </div>
      )}
      <FormField label="6-digit code" description="From your authenticator app. It changes every 30 seconds." error={error} required>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d*" maxLength={7} className="font-mono tracking-widest" />
      </FormField>
      <LoadingButton type="submit" loading={pending} loadingText="Checking...">
        {enrollment ? "Finish setup" : "Sign in"}
      </LoadingButton>
    </form>
  );
}
