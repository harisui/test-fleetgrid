"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { updateSmsConsentAction } from "@/server/actions/driver.actions";

interface SmsConsentControlProps {
  smsOptIn: boolean;
}

export const TURN_ON_PROMPT = "Turn on shift texts to get offers from carriers.";

const linkClass = "font-semibold text-foreground underline underline-offset-4";

/**
 * The profile page's switch for shift texts. Off: the prompt, the same consent card as the
 * sign-up (unchecked) and a button. On: a plain link to turn them off. A driver who replied
 * STOP does not see this; AccountStatusCard explains START instead.
 */
export function SmsConsentControl({ smsOptIn }: SmsConsentControlProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function save(consent: boolean) {
    if (pending) return;
    if (consent && !checked) {
      setError("Tap the box to agree before turning texts on");
      return;
    }
    setError(undefined);
    setPending(true);
    const result = await updateSmsConsentAction({ consent });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(consent ? "Shift texts are on" : "Shift texts are off");
    setChecked(false);
    router.refresh();
  }

  if (smsOptIn) {
    return (
      <Button
        type="button"
        variant="link"
        size="md"
        onClick={() => save(false)}
        disabled={pending}
        data-slot="sms-consent-off"
      >
        Turn off shift texts
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-slot="sms-consent-control">
      <p className="text-helper leading-helper font-semibold" data-slot="sms-consent-prompt">
        {TURN_ON_PROMPT}
      </p>
      <ConsentCard
        id="profile-sms-consent"
        checked={checked}
        onCheckedChange={(next) => {
          setChecked(next);
          setError(undefined);
        }}
        text={SMS_CONSENT_TEXT}
        error={error}
        disabled={pending}
      >
        See the{" "}
        <Link href="/sms-terms" className={linkClass}>
          SMS Terms
        </Link>
        ,{" "}
        <Link href="/terms" className={linkClass}>
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className={linkClass}>
          Privacy Policy
        </Link>
        .
      </ConsentCard>
      <LoadingButton
        type="button"
        size="md"
        loading={pending}
        loadingText="Saving..."
        onClick={() => save(true)}
      >
        Turn on shift texts
      </LoadingButton>
    </div>
  );
}
