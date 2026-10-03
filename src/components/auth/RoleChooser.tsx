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
                "flex min-h-20 cursor-pointer items-center gap-4 rounded-card border bg-card p-4 transition-colors duration-(--dur-state) ease-standard",
                "has-focus-visible:outline-3 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
                selected
                  ? "border-selection bg-selection-tint ring-1 ring-selection ring-inset"
                  : "border-border-strong",
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
                  "flex size-10 shrink-0 items-center justify-center rounded-field bg-muted text-foreground",
                  selected && "bg-selection text-selection-foreground",
                )}
              >
                {option.icon}
              </span>
              <span className="flex flex-col">
                <span className="text-body leading-body font-semibold">{option.title}</span>
                <span className="text-helper leading-helper text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="text-helper leading-helper font-semibold text-destructive">
          {error}
        </p>
      )}

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
