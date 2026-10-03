"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CodeInput } from "@/components/auth/CodeInput";
import { formatCountdown } from "@/lib/countdown";
import { FormField } from "@/components/shared/FormField";
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
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/constants";
import { digitsOnly, formatE164ForDisplay } from "@/lib/phone";
import { deleteMyAccountAction, requestAccountCodeAction } from "@/server/actions/account.actions";

interface DeleteAccountCardProps {
  /** The signed-in person's E.164 number, where the confirmation code goes. */
  phone: string;
}

type Step = "closed" | "confirm" | "code";

/**
 * Lets a person delete their own account and everything stored about them. Shown at the
 * bottom of the driver profile and the carrier page. Asks once, texts a code to the same
 * number, and deletes for good only when that code checks out.
 */
export function DeleteAccountCard({ phone }: DeleteAccountCardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [digits, setDigits] = useState("");
  const [focused, setFocused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resend cooldown countdown, like the login code screen.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function close() {
    if (pending) return;
    setStep("closed");
    setError(undefined);
    setDigits("");
  }

  async function sendCode() {
    setPending(true);
    setError(undefined);
    const result = await requestAccountCodeAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDigits("");
    if (inputRef.current) inputRef.current.value = "";
    setSecondsLeft(OTP_RESEND_COOLDOWN_SECONDS);
    setStep("code");
  }

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const code = digitsOnly(inputRef.current?.value ?? "").slice(0, OTP_LENGTH);
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code`);
      return;
    }
    setPending(true);
    setError(undefined);
    const result = await deleteMyAccountAction({ code });
    if (!result.ok) {
      setPending(false);
      setError(result.error.fieldErrors?.code ?? result.error.message);
      return;
    }
    toast.success("Your account was deleted");
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  return (
    <section
      aria-label="Delete account"
      data-slot="delete-account"
      className="flex flex-col gap-3 rounded-card border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-label leading-label font-semibold">Delete my account</h2>
        <p className="text-helper leading-helper text-muted-foreground">
          Removes your profile, your documents and your sign-in from FleetGrid. This cannot be
          undone. You can sign up again later with the same number.
        </p>
      </div>
      <Button type="button" variant="destructive" size="md" onClick={() => setStep("confirm")}>
        Delete my account
      </Button>

      <Dialog open={step !== "closed"} onOpenChange={(open) => !open && close()}>
        <DialogContent showCloseButton={false}>
          {step === "code" ? (
            <form onSubmit={handleDelete} noValidate className="flex flex-col gap-5">
              <DialogHeader>
                <DialogTitle>Enter the code to delete your account</DialogTitle>
                <DialogDescription>
                  We texted a code to{" "}
                  <span className="font-semibold text-foreground">
                    {formatE164ForDisplay(phone)}
                  </span>
                  . Once it checks out, everything about you is removed for good.
                </DialogDescription>
              </DialogHeader>
              <FormField label="6-digit code" error={error} errorIcon={false} required>
                <CodeInput
                  digits={digits}
                  focused={focused}
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d*"
                  maxLength={OTP_LENGTH + 4}
                  ref={inputRef}
                  defaultValue=""
                  onChange={(event) => {
                    const next = digitsOnly(event.target.value).slice(0, OTP_LENGTH);
                    event.target.value = next;
                    setDigits(next);
                    if (error) setError(undefined);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  disabled={pending}
                  autoFocus
                />
              </FormField>
              <p className="text-helper leading-helper text-muted-foreground" aria-live="polite">
                {secondsLeft > 0 ? (
                  <>Didn&apos;t get it? Resend in {formatCountdown(secondsLeft)}</>
                ) : (
                  <Button type="button" variant="link" onClick={sendCode} disabled={pending}>
                    Resend code
                  </Button>
                )}
              </p>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <LoadingButton
                  type="submit"
                  variant="destructive"
                  loading={pending}
                  loadingText="Deleting..."
                >
                  Delete for good
                </LoadingButton>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  Everything about you is removed and cannot be brought back. To make sure it is
                  you, we text a code to {formatE164ForDisplay(phone)} first.
                </DialogDescription>
              </DialogHeader>
              {error && (
                <p
                  role="alert"
                  className="text-helper leading-helper font-semibold text-destructive"
                >
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <LoadingButton
                  type="button"
                  loading={pending}
                  loadingText="Sending code..."
                  onClick={sendCode}
                >
                  Text me a code
                </LoadingButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
