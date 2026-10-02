"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Input } from "@/components/ui/input";
import { VERIFY_PATH } from "@/lib/auth/routes";
import { formatUsPhoneInput } from "@/lib/phone";
import { phoneSchema } from "@/lib/validation/phone.schema";
import { requestOtpAction } from "@/server/actions/auth.actions";
import type { SignupRole } from "@/types/domain";

interface PhoneFormProps {
  /** Carried through to the role picker so the choice is preselected. */
  role?: SignupRole;
}

export function PhoneForm({ role }: PhoneFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const parsed = phoneSchema.safeParse(phone);
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
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(555) 555-0100"
          className="h-12 text-lg"
          value={phone}
          onChange={(event) => {
            setPhone(formatUsPhoneInput(event.target.value));
            if (error) setError(undefined);
          }}
          autoFocus
        />
      </FormField>

      <LoadingButton type="submit" size="touch" loading={pending} loadingText="Sending code...">
        Send code
      </LoadingButton>
    </form>
  );
}
