"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHOOSE_ROLE_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/constants";
import { digitsOnly, formatE164ForDisplay } from "@/lib/phone";
import { requestOtpAction, verifyOtpAction } from "@/server/actions/auth.actions";
import type { SignupRole } from "@/types/domain";

interface OtpFormProps {
  /** E.164 number the code was sent to. */
  phone: string;
  role?: SignupRole;
  /** Seconds before the first resend is allowed. */
  cooldownSeconds?: number;
}

export function OtpForm({
  phone,
  role,
  cooldownSeconds = OTP_RESEND_COOLDOWN_SECONDS,
}: OtpFormProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(cooldownSeconds);
  const submittedCode = useRef<string | null>(null);

  // Resend cooldown countdown.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const verify = useCallback(
    async (value: string) => {
      if (value.length !== OTP_LENGTH) {
        setError(`Enter the ${OTP_LENGTH}-digit code`);
        return;
      }
      setError(undefined);
      setPending(true);
      submittedCode.current = value;

      const result = await verifyOtpAction({ phone, code: value });
      if (!result.ok) {
        setPending(false);
        setError(result.error.fieldErrors?.code ?? result.error.message);
        return;
      }

      const { redirectTo } = result.data;
      const target =
        role && redirectTo === CHOOSE_ROLE_PATH ? `${redirectTo}?role=${role}` : redirectTo;
      router.replace(target);
      router.refresh();
    },
    [phone, role, router],
  );

  function handleChange(raw: string) {
    // Works for typing, pasting "123 456" and SMS autofill.
    const next = digitsOnly(raw).slice(0, OTP_LENGTH);
    setCode(next);
    if (error) setError(undefined);
    // Submit as soon as the code is complete, once per distinct code.
    if (next.length === OTP_LENGTH && next !== submittedCode.current && !pending) {
      void verify(next);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) void verify(code);
  }

  async function handleResend() {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    const result = await requestOtpAction({ phone });
    setResending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCode("");
    setError(undefined);
    submittedCode.current = null;
    setSecondsLeft(cooldownSeconds);
    toast.success("We sent you a new code");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        Enter the code we texted to{" "}
        <span className="text-foreground font-medium">{formatE164ForDisplay(phone)}</span>.{" "}
        <Link href={LOGIN_PATH} className="text-foreground underline underline-offset-4">
          Change number
        </Link>
      </p>

      <FormField label="6-digit code" error={error} required>
        <Input
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d*"
          maxLength={OTP_LENGTH + 4}
          placeholder="123456"
          className="h-14 text-center font-mono text-2xl tracking-[0.4em]"
          value={code}
          onChange={(event) => handleChange(event.target.value)}
          disabled={pending}
          autoFocus
        />
      </FormField>

      <LoadingButton type="submit" size="touch" loading={pending} loadingText="Checking...">
        Verify
      </LoadingButton>

      <div className="text-center text-sm">
        {secondsLeft > 0 ? (
          <p className="text-muted-foreground" aria-live="polite">
            Resend code in {secondsLeft}s
          </p>
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-11"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? "Sending..." : "Resend code"}
          </Button>
        )}
      </div>
    </form>
  );
}
