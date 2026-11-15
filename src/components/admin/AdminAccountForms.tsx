"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADMIN_PASSWORD_MIN } from "@/lib/validation/admin-auth.schema";
import type { TotpEnrollment } from "@/server/repositories/AdminAuthRepository";
import {
  changeAdminNameAction,
  changeAdminPasswordAction,
  finishReplacingAuthenticatorAction,
  startReplacingAuthenticatorAction,
} from "@/server/actions/admin-auth.actions";

type FieldErrors = Record<string, string | undefined>;

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-card border border-border bg-card p-5" data-slot={id}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-heading text-h3 leading-h3 font-semibold">
          {title}
        </h2>
        <p className="text-helper leading-helper text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** The display name, kept on the sign-in account. */
export function AdminNameForm({ name }: { name: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await changeAdminNameAction({ name: new FormData(event.currentTarget).get("name") });
    setPending(false);
    if (!result.ok) {
      setError(result.error.fieldErrors?.name ?? result.error.message);
      return;
    }
    toast.success("Name saved");
    router.refresh();
  }

  return (
    <Section id="account-name" title="Name" description="Shown at the bottom of the admin menu.">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField label="Your name" error={error} required>
          <Input name="name" defaultValue={name ?? ""} autoComplete="name" maxLength={80} />
        </FormField>
        <LoadingButton type="submit" loading={pending} loadingText="Saving..." className="sm:self-start">
          Save name
        </LoadingButton>
      </form>
    </Section>
  );
}

/** The sign-in email, read-only here. */
export function AdminEmailCard({ email }: { email: string | null }) {
  return (
    <Section id="account-email" title="Email" description="You sign in with this address. FleetGrid support can change it for you.">
      <p className="font-mono text-body leading-body break-all" data-slot="account-email-value">
        {email ?? "No email on this account"}
      </p>
    </Section>
  );
}

/** A new password, typed twice. */
export function AdminPasswordForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setErrors({});
    const result = await changeAdminPasswordAction({ password: data.get("password"), confirm: data.get("confirm") });
    setPending(false);
    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? { password: result.error.message });
      return;
    }
    form.reset();
    toast.success("Password changed");
  }

  return (
    <Section id="account-password" title="Password" description={`At least ${ADMIN_PASSWORD_MIN} characters. A password manager can make one for you.`}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField label="New password" error={errors.password} required>
          <Input name="password" type="password" autoComplete="new-password" />
        </FormField>
        <FormField label="New password again" error={errors.confirm} required>
          <Input name="confirm" type="password" autoComplete="new-password" />
        </FormField>
        <LoadingButton type="submit" loading={pending} loadingText="Saving..." className="sm:self-start">
          Change password
        </LoadingButton>
      </form>
    </Section>
  );
}

/** The authenticator app: replaced by scanning a new one; the old one goes once the new one works. */
export function AdminAuthenticatorCard({ count }: { count: number }) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    setError(undefined);
    const result = await startReplacingAuthenticatorAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEnrollment(result.data);
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setPending(true);
    setError(undefined);
    const result = await finishReplacingAuthenticatorAction({
      factorId: enrollment.factorId,
      code: new FormData(event.currentTarget).get("code"),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.fieldErrors?.code ?? result.error.message);
      return;
    }
    setEnrollment(undefined);
    toast.success("New authenticator app set up. The old one no longer works.");
  }

  return (
    <Section
      id="account-authenticator"
      title="Authenticator app"
      description="A code from this app is needed at every sign-in. Got a new phone? Set it up here; your current app keeps working until the new one is confirmed."
    >
      <p className="text-body leading-body" data-slot="authenticator-status">
        {count > 0 ? "Set up and in use." : "Not set up."}
      </p>
      {!enrollment ? (
        <>
          {error && (
            <p role="alert" className="text-helper leading-helper text-destructive">
              {error}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={start} disabled={pending} className="sm:self-start">
            Replace authenticator app
          </Button>
        </>
      ) : (
        <form onSubmit={finish} noValidate className="flex flex-col gap-4" aria-label="New authenticator app">
          <div className="flex flex-col items-start gap-3">
            {/* An SVG data URL from Supabase Auth; next/image does not load data URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qrCode} alt="QR code to scan with your new authenticator app" className="size-48 rounded-card border border-border bg-print-paper p-2" />
            <p className="text-helper leading-helper text-muted-foreground">Can&apos;t scan it? Enter this key instead:</p>
            <code className="font-mono text-label leading-label break-all">{enrollment.secret}</code>
          </div>
          <FormField label="6-digit code from the new app" error={error} required>
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="font-mono tracking-widest" />
          </FormField>
          <div className="flex flex-col gap-3 sm:flex-row">
            <LoadingButton type="submit" loading={pending} loadingText="Checking...">
              Confirm new app
            </LoadingButton>
            <Button type="button" variant="secondary" onClick={() => setEnrollment(undefined)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
