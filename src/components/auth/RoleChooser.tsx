"use client";

import { Building2, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { OptionGroup } from "@/components/shared/OptionGroup";
import type { CardOption } from "@/lib/onboarding/options";
import { chooseRoleAction } from "@/server/actions/auth.actions";
import type { SignupRole } from "@/types/domain";

/** Plain words first. The official role name is in the description. */
export const ROLE_OPTIONS: readonly CardOption<SignupRole>[] = [
  {
    value: "driver",
    label: "I drive or work trucks",
    description: "Drivers, yard spotters and mechanics. Get shift offers by text.",
    icon: Truck,
  },
  {
    value: "carrier",
    label: "I hire for my company",
    description: "Carriers. Find certified operators and fill shifts fast.",
    icon: Building2,
  },
];

interface RoleChooserProps {
  /** Preselected from the landing page button the user clicked. */
  defaultRole?: SignupRole;
}

export function RoleChooser({ defaultRole }: RoleChooserProps) {
  const router = useRouter();
  const [role, setRole] = useState<SignupRole | undefined>(defaultRole);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleContinue() {
    if (pending) return;
    if (!role) {
      setError("Choose Driver or Carrier");
      return;
    }
    setError(undefined);
    setPending(true);

    const result = await chooseRoleAction({ role });
    if (!result.ok) {
      setPending(false);
      setError(result.error.fieldErrors?.role ?? result.error.message);
      return;
    }
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <OptionGroup
        label="Account type"
        labelHidden
        options={ROLE_OPTIONS}
        value={role}
        onChange={(next) => {
          setRole(next);
          setError(undefined);
        }}
        error={error}
        disabled={pending}
      />

      <LoadingButton
        type="button"
        loading={pending}
        loadingText="Setting up..."
        onClick={handleContinue}
      >
        Continue
      </LoadingButton>
    </div>
  );
}
