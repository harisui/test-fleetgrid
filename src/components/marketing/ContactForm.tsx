"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Controller, useForm, type FieldErrors } from "react-hook-form";
import { ChoiceGroup } from "@/components/shared/ChoiceGroup";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT } from "@/content/marketing";
import {
  CONTACT_COMPANY_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_NAME_MAX,
  CONTACT_ROLE_LABELS,
  CONTACT_ROLES,
  contactFieldsSchema,
  type ContactFieldsInput,
} from "@/lib/validation/contact.schema";
import { sendContactMessageAction } from "@/server/actions/marketing.actions";

interface ContactFormProps {
  /** The signed timestamp from the server; posted back so a bot cannot submit at once. */
  token: string;
  supportEmail: string;
}

type Status = { kind: "idle" } | { kind: "sent"; email: string } | { kind: "failed"; message?: string };

const FIELD_ORDER = ["name", "email", "role", "company", "message"] as const;
const FIELD_LABELS: Record<(typeof FIELD_ORDER)[number], string> = {
  name: CONTACT.form.name,
  email: CONTACT.form.email,
  role: CONTACT.form.role,
  company: CONTACT.form.company,
  message: CONTACT.form.message,
};

const ROLE_OPTIONS = CONTACT_ROLES.map((value) => ({ value, label: CONTACT_ROLE_LABELS[value] }));

const linkClass = "font-semibold text-foreground underline underline-offset-4";

/**
 * Name, email, who you are, company and the message. Errors sit under each field and are
 * listed at the top, where focus goes on a failed submit. The honeypot is never shown. On
 * success the form is replaced by one line; on failure it stays, with the support address.
 */
export function ContactForm({ token, supportEmail }: ContactFormProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [summary, setSummary] = useState<{ field: string; message: string }[]>([]);
  const baseId = useId();
  const summaryId = `${baseId}-summary`;

  // Focus moves to the error list once it is on the page.
  useEffect(() => {
    if (summary.length > 0) document.getElementById(summaryId)?.focus();
  }, [summary, summaryId]);
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactFieldsInput>({
    resolver: zodResolver(contactFieldsSchema),
    mode: "onTouched",
    // Focus goes to the error list at the top, not to the first field.
    shouldFocusError: false,
    defaultValues: { name: "", email: "", company: "", message: "" },
  });

  const fieldId = (field: string) => `${baseId}-${field}`;

  function showSummary(fieldErrors: FieldErrors<ContactFieldsInput>) {
    const list = FIELD_ORDER.flatMap((field) => {
      const message = fieldErrors[field]?.message;
      return typeof message === "string" ? [{ field, message }] : [];
    });
    setSummary(list);
  }

  async function send(values: ContactFieldsInput) {
    setSummary([]);
    setStatus({ kind: "idle" });
    const form = document.getElementById(fieldId("form")) as HTMLFormElement | null;
    const honeypot =
      (form?.elements.namedItem("company_website") as HTMLInputElement | null)?.value ?? "";
    const result = await sendContactMessageAction({ ...values, company_website: honeypot, token });
    if (result.ok) {
      setStatus({ kind: "sent", email: result.data.email });
      return;
    }
    if (result.error.code === "VALIDATION" && result.error.fieldErrors) {
      const known = Object.entries(result.error.fieldErrors).filter(([field]) =>
        (FIELD_ORDER as readonly string[]).includes(field),
      );
      for (const [field, message] of known) {
        setError(field as (typeof FIELD_ORDER)[number], { type: "server", message });
      }
      if (known.length > 0) {
        showSummary(
          Object.fromEntries(known.map(([field, message]) => [field, { message }])) as FieldErrors<ContactFieldsInput>,
        );
        return;
      }
    }
    setStatus({
      kind: "failed",
      message: result.error.code === "RATE_LIMITED" ? result.error.message : undefined,
    });
  }

  if (status.kind === "sent") {
    return (
      <div
        role="status"
        data-slot="contact-sent"
        className="flex flex-col gap-2 rounded-card border border-success bg-success-subtle p-6"
      >
        <p className="flex items-center gap-2 text-label leading-label font-semibold">
          <CircleCheck aria-hidden="true" className="size-5 text-success" />
          {CONTACT.form.successTitle}
        </p>
        <p>{CONTACT.form.success(status.email)}</p>
      </div>
    );
  }

  return (
    <form
      id={fieldId("form")}
      noValidate
      onSubmit={handleSubmit(send, showSummary)}
      className="flex flex-col gap-5"
      aria-labelledby={fieldId("heading")}
    >
      <h2 id={fieldId("heading")} className="font-heading text-h2 leading-h2 font-semibold">
        {CONTACT.form.heading}
      </h2>

      {summary.length > 0 && (
        <div
          id={summaryId}
          tabIndex={-1}
          role="alert"
          data-slot="contact-error-summary"
          className="flex flex-col gap-2 rounded-card border border-destructive bg-destructive-subtle p-4"
        >
          <p className="flex items-center gap-2 text-label leading-label font-semibold">
            <CircleAlert aria-hidden="true" className="size-5 text-destructive" />
            {CONTACT.form.summaryTitle(summary.length)}
          </p>
          <ul className="list-disc pl-6 text-helper leading-helper">
            {summary.map((item) => (
              <li key={item.field}>
                <a href={`#${fieldId(item.field)}`} className={linkClass}>
                  {FIELD_LABELS[item.field as keyof typeof FIELD_LABELS]}
                </a>
                : {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.kind === "failed" && (
        <InlineNote variant="error" role="alert" data-slot="contact-failed">
          {status.message ?? CONTACT.form.error}{" "}
          {!status.message && (
            <a href={`mailto:${supportEmail}`} className={linkClass}>
              {supportEmail}
            </a>
          )}
          {!status.message && "."}
        </InlineNote>
      )}

      <FormField label={CONTACT.form.name} required error={errors.name?.message}>
        <Input
          id={fieldId("name")}
          autoComplete="name"
          maxLength={CONTACT_NAME_MAX}
          {...register("name")}
        />
      </FormField>

      <FormField label={CONTACT.form.email} required error={errors.email?.message}>
        <Input
          id={fieldId("email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          {...register("email")}
        />
      </FormField>

      <div id={fieldId("role")}>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <ChoiceGroup
              label={CONTACT.form.role}
              required
              options={ROLE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              error={errors.role?.message}
              columns={3}
            />
          )}
        />
      </div>

      <FormField
        label={CONTACT.form.company}
        description={CONTACT.form.companyHint}
        error={errors.company?.message}
      >
        <Input
          id={fieldId("company")}
          autoComplete="organization"
          maxLength={CONTACT_COMPANY_MAX}
          {...register("company")}
        />
      </FormField>

      <FormField label={CONTACT.form.message} required error={errors.message?.message} errorIcon={false}>
        <Textarea id={fieldId("message")} maxLength={CONTACT_MESSAGE_MAX} {...register("message")} />
      </FormField>

      {/* The honeypot: out of sight and out of the tab order. A person never fills it. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={fieldId("company_website")}>Company website</label>
        <input
          id={fieldId("company_website")}
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <LoadingButton type="submit" loading={isSubmitting} loadingText={CONTACT.form.submitting}>
        {CONTACT.form.submit}
      </LoadingButton>

      <p className="text-helper leading-helper text-muted-foreground">
        {CONTACT.form.privacyNote}{" "}
        <Link href="/privacy" className={linkClass}>
          {CONTACT.form.privacyLink}
        </Link>
        .
      </p>
    </form>
  );
}
