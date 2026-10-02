"use client";

import { Building2, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { cn } from "@/lib/utils";
import { chooseRoleAction } from "@/server/actions/auth.actions";
import type { SignupRole } from "@/types/domain";

const OPTIONS: { role: SignupRole; title: string; description: string; icon: ReactNode }[] = [
  {
    role: "driver",
    title: "I'm a Driver",
    description: "CDL drivers, yard spotters and mechanics. Get shift offers by text.",
    icon: <Truck aria-hidden="true" className="size-6" />,
  },
  {
    role: "carrier",
    title: "I'm a Carrier",
    description: "Freight carriers. Find certified operators and fill shifts fast.",
    icon: <Building2 aria-hidden="true" className="size-6" />,
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
      <fieldset className="flex flex-col gap-3" disabled={pending}>
        <legend className="sr-only">Account type</legend>
        {OPTIONS.map((option) => {
          const selected = role === option.role;
          return (
            <label
              key={option.role}
              className={cn(
                "border-border bg-card flex min-h-20 cursor-pointer items-center gap-4 rounded-lg border-2 p-4 transition-colors",
                "has-focus-visible:ring-ring has-focus-visible:ring-2",
                selected && "border-primary bg-secondary",
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.role}
                checked={selected}
                onChange={() => {
                  setRole(option.role);
                  setError(undefined);
                }}
                className="sr-only"
              />
              <span
                className={cn(
                  "bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full",
                  selected && "bg-primary text-primary-foreground",
                )}
              >
                {option.icon}
              </span>
              <span className="flex flex-col">
                <span className="text-base font-semibold">{option.title}</span>
                <span className="text-muted-foreground text-sm">{option.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}

      <LoadingButton
        type="button"
        size="touch"
        loading={pending}
        loadingText="Setting up..."
        onClick={handleContinue}
      >
        Continue
      </LoadingButton>
    </div>
  );
}
