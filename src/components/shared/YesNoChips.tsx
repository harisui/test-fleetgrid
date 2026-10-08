"use client";

import { ChipGroup } from "@/components/shared/ChipGroup";

interface YesNoChipsProps {
  /** The question. Shown above the two chips. */
  label: string;
  labelHidden?: boolean;
  description?: string;
  /** The words on the chips. Default "Yes" and "No". */
  yes?: string;
  no?: string;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  error?: string;
  disabled?: boolean;
}

/** A yes-or-no question answered with two chips, one of which stays pressed. */
export function YesNoChips({ yes = "Yes", no = "No", value, onChange, ...group }: YesNoChipsProps) {
  return (
    <ChipGroup
      {...group}
      options={[
        { value: "yes", label: yes },
        { value: "no", label: no },
      ]}
      value={value === undefined ? undefined : value ? "yes" : "no"}
      onChange={(picked) => onChange(picked === "yes")}
    />
  );
}
