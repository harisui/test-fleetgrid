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
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import {
  nextStepId,
  previousStepId,
  progressFor,
  stepApplies,
  stepById,
  stepNumber,
  stepsOfMile,
  type FlowContext,
  type Step,
  type StepId,
} from "@/lib/onboarding/steps";
import type { SupportContact } from "@/lib/support";
import { saveOnboardingScreenAction } from "@/server/actions/driver.actions";
import type { Driver, DriverDocument } from "@/types/domain";

const FORM_ID = "screen-form";

interface OnboardingFlowProps {
  initialStepId: StepId;
  initialDriver: Driver | null;
  /** The signed-in driver's E.164 phone. */
  phone: string;
  initialDocuments: DriverDocument[];
  /** Shown in the Help sheet. */
  support?: SupportContact;
}

function pick(values: OnboardingFormValues, fields: OnboardingField[]): OnboardingFormValues {
  const slice: Record<string, unknown> = {};
  for (const field of fields) slice[field] = values[field];
  return slice as OnboardingFormValues;
}

/**
 * The driver onboarding. One question per screen on phones; on wider screens a mile's
 * questions share one page under one sign header. Every screen is saved on Next, so the
 * driver can leave at any point and resume on the same question.
 */
export function OnboardingFlow({
  initialStepId,
  initialDriver,
  phone,
  initialDocuments,
  support,
}: OnboardingFlowProps) {
  const router = useRouter();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [stepId, setStepId] = useState<StepId>(initialStepId);
  const [driver, setDriver] = useState(initialDriver);
  const [documents, setDocuments] = useState(initialDocuments);
  const firstRender = useRef(true);

  // Move focus to the new question so screen readers and keyboards follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    (document.querySelector("[data-slot=sign-title]") as HTMLElement | null)?.focus();
    window.scrollTo?.({ top: 0 });
  }, [stepId, isDesktop]);

  const flowContext: FlowContext = { cdlClass: driver?.cdlClass ?? null };

  if (stepId === "done" && driver) {
    return (
      <OnboardingShell stepId="done" support={support}>
        <DoneScreen driver={driver} phone={phone} onEdit={setStepId} />
      </OnboardingShell>
    );
  }

  const current = stepById(stepId);
  // A grouped page holds every screen of the mile; the page decides live which ones apply
  // (the endorsements question appears as soon as a CDL class is picked).
  const pageSteps = isDesktop ? stepsOfMile(current.mile) : [current];
  const pageKey = `${isDesktop ? "mile" : "step"}:${pageSteps.map((step) => step.id).join("+")}`;

  // The shell stays mounted across steps; only the screen inside it is replaced, so the
  // road's fill and truck animate to the next position.
  return (
    <OnboardingShell stepId={stepId} support={support}>
      <ScreenPage
        key={pageKey}
        stepId={stepId}
        pageSteps={pageSteps}
        grouped={isDesktop}
        context={{ driver, phone, documents }}
        documents={documents}
        onDocumentsChange={setDocuments}
        onBack={() => {
          const previous = previousStepId(pageSteps[0].id, flowContext);
          if (!previous) return;
          setStepId(isDesktop ? stepsOfMile(stepById(previous).mile, flowContext)[0].id : previous);
        }}
        onSaved={(saved, completed) => {
          setDriver(saved);
          const next = nextStepId(pageSteps[pageSteps.length - 1].id, {
            cdlClass: saved.cdlClass,
          });
          setStepId(next);
          // The profile page opens up once the card is complete.
          if (completed) router.refresh();
        }}
      />
    </OnboardingShell>
  );
}

interface ScreenPageProps {
  stepId: StepId;
  pageSteps: Step[];
  grouped: boolean;
  context: ScreenContext;
  documents: DriverDocument[];
  onDocumentsChange: (documents: DriverDocument[]) => void;
  onBack: () => void;
  onSaved: (driver: Driver, completed: boolean) => void;
}

function ScreenPage({
  stepId,
  pageSteps,
  grouped,
  context,
  documents,
  onDocumentsChange,
  onBack,
  onSaved,
}: ScreenPageProps) {
  const allDefinitions = useMemo(
    () => pageSteps.map((step) => SCREENS[step.id as keyof typeof SCREENS]),
    [pageSteps],
  );
  const [formError, setFormError] = useState<string>();

  const form = useForm<OnboardingFormValues>({
    resolver: (values, ...rest) => resolver(values, ...rest),
    defaultValues: Object.assign(
      {},
      ...allDefinitions.map((definition) => definition.defaults(context.driver)),
    ),
    // Errors show after the driver leaves a field or taps Next, never while typing.
    mode: "onTouched",
    reValidateMode: "onChange",
  });
  const values = useWatch({ control: form.control });

  // Which of the page's screens apply right now, from the answer on the page when there is
  // one, otherwise from the saved card.
  const liveContext: FlowContext = {
    cdlClass: values.cdlClass ?? context.driver?.cdlClass ?? null,
  };
  const activeSteps = pageSteps.filter((step) => stepApplies(step.id, liveContext));
  const definitions = allDefinitions.filter((definition) =>
    activeSteps.some((step) => step.id === definition.id),
  );

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
  const hasBack =
    previousStepId(pageSteps[0].id, {
      cdlClass: context.driver?.cdlClass ?? null,
    }) !== null;

  const submit = form.handleSubmit(async (parsed) => {
    setFormError(undefined);
    let latest: Driver | null = null;
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
          eyebrow={grouped ? `Mile ${progress.mile.mile} of 5` : progress.eyebrow}
          title={grouped ? progress.mile.label : progress.step.question}
          srText={progress.srLabel}
        />
        {formError && (
          <InlineNote variant="error" role="alert">
            {formError}
          </InlineNote>
        )}
        <FormProvider {...form}>
          <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-8">
            {activeSteps.map((step, index) => (
              <ScreenSection
                key={step.id}
                step={step}
                definition={definitions[index]}
                grouped={grouped}
                context={context}
                documents={documents}
                onDocumentsChange={onDocumentsChange}
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
  grouped,
  context,
  documents,
  onDocumentsChange,
}: {
  step: Step;
  definition: ScreenDefinition;
  grouped: boolean;
  context: ScreenContext;
  documents: DriverDocument[];
  onDocumentsChange: (documents: DriverDocument[]) => void;
}) {
  const Fields = definition.Fields;
  return (
    <section data-slot="screen" data-step={step.id} className="flex flex-col gap-4">
      <Fields
        {...context}
        showQuestion={grouped}
        question={step.question}
        helper={"helper" in step ? step.helper : undefined}
        documents={documents}
        onDocumentsChange={onDocumentsChange}
      />
    </section>
  );
}
