"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Input } from "@/components/ui/input";
import { adminSignInAction } from "@/server/actions/admin-auth.actions";

/** Admin sign-in, step 1 of 2: email and password (0039). */
export function AdminSignInForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setErrors({});
    const result = await adminSignInAction({ email: data.get("email"), password: data.get("password") });
    if (!result.ok) {
      setPending(false);
      const fields = result.error.fieldErrors ?? {};
      setErrors(Object.keys(fields).length > 0 ? fields : { form: result.error.message });
      return;
    }
    router.push(result.data.redirectTo);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label="Admin sign-in">
      <FormField label="Email" error={errors.email} required>
        <Input name="email" type="email" autoComplete="username" inputMode="email" />
      </FormField>
      <FormField label="Password" error={errors.password} required>
        <Input name="password" type="password" autoComplete="current-password" />
      </FormField>
      {errors.form && (
        <InlineNote variant="error" role="alert">
          {errors.form}
        </InlineNote>
      )}
      <LoadingButton type="submit" loading={pending} loadingText="Signing in...">
        Continue
      </LoadingButton>
    </form>
  );
}
