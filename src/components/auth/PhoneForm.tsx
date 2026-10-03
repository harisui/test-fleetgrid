"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ComponentProps, type FormEvent } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Input } from "@/components/ui/input";
import { VERIFY_PATH } from "@/lib/auth/routes";
import { formatUsPhoneInput } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { phoneSchema } from "@/lib/validation/phone.schema";
import { requestOtpAction } from "@/server/actions/auth.actions";
import type { SignupRole } from "@/types/domain";

interface PhoneFormProps {
  /** Carried through to the role picker so the choice is preselected. */
  role?: SignupRole;
  /** E.164 number the field starts with. Local development only (see lib/auth/prefill.ts). */
  defaultPhone?: string;
}

/** A phone field with the fixed US country code in front. US numbers only. */
function PhoneInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-body leading-body font-semibold text-muted-foreground"
      >
        US +1
      </span>
      <Input {...props} className={cn("pl-24", className)} />
    </div>
  );
}

export function PhoneForm({ role, defaultPhone }: PhoneFormProps) {
  const router = useRouter();
  // Uncontrolled on purpose: digits typed before the page finishes loading its scripts
  // (slow phones, Safari) must not be wiped when React takes over.
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const parsed = phoneSchema.safeParse(inputRef.current?.value ?? "");
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setError(undefined);
    setPending(true);
    const result = await requestOtpAction({ phone: parsed.data });

    if (!result.ok) {
      setPending(false);
      setError(result.error.fieldErrors?.phone ?? result.error.message);
      if (result.error.code === "INTERNAL") toast.error(result.error.message);
      return;
    }

    const params = new URLSearchParams({ phone: result.data.phone });
    if (role) params.set("role", role);
    router.push(`${VERIFY_PATH}?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormField
        label="Mobile number"
        description="We will text you a 6-digit code. US numbers only."
        error={error}
        required
      >
        <PhoneInput
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(555) 555-0100"
          ref={inputRef}
          defaultValue={defaultPhone ? formatUsPhoneInput(defaultPhone.replace(/^\+1/, "")) : ""}
          onChange={(event) => {
            event.target.value = formatUsPhoneInput(event.target.value);
            if (error) setError(undefined);
          }}
          enterKeyHint="send"
          autoFocus
        />
      </FormField>

      <LoadingButton type="submit" loading={pending} loadingText="Sending code...">
        Text me a code
      </LoadingButton>
    </form>
  );
}
