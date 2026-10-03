"use client";

import { OnboardingDocuments } from "@/components/driver/OnboardingDocuments";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type { ScreenDefinition, ScreenFieldsProps } from "@/components/driver/screens/types";
import { documentsScreenSchema } from "@/lib/validation/onboarding.schema";

function DocumentsFields({
  showQuestion,
  question,
  documents,
  onDocumentsChange,
}: ScreenFieldsProps) {
  return (
    <>
      <ScreenQuestion show={showQuestion}>{question}</ScreenQuestion>
      <ScreenHelper>
        Optional. You can add them later from Documents. Only you and FleetGrid staff can see them.
      </ScreenHelper>
      <OnboardingDocuments documents={documents} onChange={onDocumentsChange} />
    </>
  );
}

export const documentsScreen: ScreenDefinition = {
  id: "documents",
  fields: [],
  schema: () => documentsScreenSchema,
  defaults: () => ({}),
  Fields: DocumentsFields,
  nextLabel: (_values, { documents }) => (documents.length > 0 ? "Next" : "Skip for now"),
};
