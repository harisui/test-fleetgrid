"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { DoneScreen } from "@/components/driver/DoneScreen";
import { SCREENS } from "@/components/driver/screens";
import type {
  OnboardingField,
  OnboardingFormValues,
  ScreenContext,
  ScreenDefinition,
} from "@/components/driver/screens/types";
import { ActionBar } from "@/components/onboarding/ActionBar";
import { OnboardingContent, OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { InlineNote } from "@/components/shared/InlineNote";
import { ScrollingArrow } from "@/components/shared/ScrollingArrow";
import {
  nextStepId,
  previousStepId,
  progressFor,
  stepById,
  stepNumber,
  stepsOfMile,
  type Step,
  type StepId,
} from "@/lib/onboarding/steps";
import type { SupportContact } from "@/lib/support";
import { saveOnboardingScreenAction } from "@/server/actions/driver.actions";
import type { LocatedDriver } from "@/types/domain";

const FORM_ID = "screen-form";

interface OnboardingFlowProps {
  initialStepId: StepId;
  initialDriver: LocatedDriver | null;
  /** The signed-in driver's E.164 phone. */
  phone: string;
  /** Shown in the Help sheet. */
  support?: SupportContact;
}

function pick(values: OnboardingFormValues, fields: OnboardingField[]): OnboardingFormValues {
  const slice: Record<string, unknown> = {};
  for (const field of fields) slice[field] = values[field];
  return slice as OnboardingFormValues;
}

/**
 * The driver onboarding. A mile's questions share one page under one sign header, on every
 * device. Every screen of the page is saved on Next, so the driver can leave at any point
 * and resume on the same page.
 */
export function OnboardingFlow({ initialStepId, initialDriver, phone, support }: OnboardingFlowProps) {
  const router = useRouter();
  const [stepId, setStepId] = useState<StepId>(initialStepId);
  const [driver, setDriver] = useState(initialDriver);
  const firstRender = useRef(true);

  // Move focus to the new page so screen readers and keyboards follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    (document.querySelector("[data-slot=sign-title]") as HTMLElement | null)?.focus();
    window.scrollTo?.({ top: 0 });
  }, [stepId]);

  if (stepId === "done" && driver) {
    return (
      <OnboardingShell stepId="done" support={support}>
        <DoneScreen driver={driver} phone={phone} onEdit={setStepId} />
      </OnboardingShell>
    );
  }

  const pageSteps = stepsOfMile(stepById(stepId).mile);
  const pageKey = pageSteps.map((step) => step.id).join("+");

  // The shell stays mounted across pages; only the page inside it is replaced, so the
  // road's fill and truck animate to the next position.
  return (
    <OnboardingShell stepId={stepId} support={support}>
      <ScreenPage
        key={pageKey}
        stepId={stepId}
        pageSteps={pageSteps}
        context={{ driver, phone }}
        onBack={() => {
          const previous = previousStepId(pageSteps[0].id);
          if (previous) setStepId(stepsOfMile(stepById(previous).mile)[0].id);
        }}
        onSaved={(saved, completed) => {
          setDriver(saved);
          setStepId(nextStepId(pageSteps[pageSteps.length - 1].id));
          // The profile page opens up once the card is complete.
          if (completed) router.refresh();
        }}
      />
      {/* Shown only while the page can still scroll, so short pages never see it. */}
      <ScrollingArrow />
    </OnboardingShell>
  );
}

interface ScreenPageProps {
  stepId: StepId;
  pageSteps: Step[];
  context: ScreenContext;
  onBack: () => void;
  onSaved: (driver: LocatedDriver, completed: boolean) => void;
}

function ScreenPage({ stepId, pageSteps, context, onBack, onSaved }: ScreenPageProps) {
  const definitions = useMemo(
    () => pageSteps.map((step) => SCREENS[step.id as keyof typeof SCREENS]),
    [pageSteps],
  );
  const [formError, setFormError] = useState<string>();

  const form = useForm<OnboardingFormValues>({
    resolver: (values, ...rest) => resolver(values, ...rest),
    defaultValues: Object.assign(
      {},
      ...definitions.map((definition) => definition.defaults(context.driver)),
    ),
    // Errors show after the driver leaves a field or taps Next, never while typing.
    mode: "onTouched",
    reValidateMode: "onChange",
  });
  const values = useWatch({ control: form.control });

  const resolver: Resolver<OnboardingFormValues> = async (values) => {
    const errors: Record<string, { type: string; message: string }> = {};
    const parsed: OnboardingFormValues = {};
    for (const definition of definitions) {
      const result = definition.schema(context).safeParse(pick(values, definition.fields));
      if (result.success) {
        Object.assign(parsed, result.data);
      } else {
        for (const issue of result.error.issues) {
          const key = String(issue.path[0] ?? definition.fields[0]);
          errors[key] ??= { type: "validation", message: issue.message };
        }
      }
    }
    return Object.keys(errors).length > 0
      ? { values: {}, errors: errors as FieldErrors<OnboardingFormValues> }
      : { values: parsed, errors: {} };
  };

  const blocked = definitions.some((definition) => definition.blocked?.(values, context));
  const last = definitions[definitions.length - 1];
  const nextLabel = last.nextLabel?.(values, context) ?? "Next";
  const progress = progressFor(stepId);
  const saved = context.driver !== null && stepNumber(last.id) < context.driver.onboardingStep;
  const hasBack = previousStepId(pageSteps[0].id) !== null;

  const submit = form.handleSubmit(async (parsed) => {
    setFormError(undefined);
    let latest: LocatedDriver | null = null;
    for (const definition of definitions) {
      const result = await saveOnboardingScreenAction(
        definition.id,
        pick(parsed, definition.fields),
      );
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {};
        let mapped = false;
        for (const [field, message] of Object.entries(fieldErrors)) {
          const name = field.split(".")[0] as OnboardingField;
          if (definition.fields.includes(name)) {
            form.setError(name, { message });
            mapped = true;
          }
        }
        if (!mapped) setFormError(result.error.message);
        return;
      }
      latest = result.data;
    }
    if (latest) onSaved(latest, latest.cardCompleted);
  });

  return (
    <>
      <OnboardingContent>
        <SignHeader
          eyebrow={progress.eyebrow}
          title={progress.mile.label}
          srText={progress.srLabel}
        />
        {formError && (
          <InlineNote variant="error" role="alert">
            {formError}
          </InlineNote>
        )}
        <FormProvider {...form}>
          <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-8">
            {pageSteps.map((step, index) => (
              <ScreenSection
                key={step.id}
                step={step}
                definition={definitions[index]}
                context={context}
              />
            ))}
          </form>
        </FormProvider>
      </OnboardingContent>
      <ActionBar
        formId={FORM_ID}
        nextLabel={nextLabel}
        pending={form.formState.isSubmitting}
        nextDisabled={blocked}
        onBack={hasBack ? onBack : undefined}
        saved={saved}
      />
    </>
  );
}

function ScreenSection({
  step,
  definition,
  context,
}: {
  step: Step;
  definition: ScreenDefinition;
  context: ScreenContext;
}) {
  const Fields = definition.Fields;
  return (
    <section data-slot="screen" data-step={step.id} className="flex flex-col gap-4">
      <Fields
        {...context}
        question={step.question}
        helper={"helper" in step ? step.helper : undefined}
      />
    </section>
  );
}
