import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

interface LoadingButtonProps extends ComponentProps<typeof Button> {
  loading?: boolean;
  /** Text shown while loading. Defaults to the normal children. */
  loadingText?: string;
}

/** Button with a built-in pending state. Disabled and announced as busy while loading. */
export function LoadingButton({
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 aria-hidden="true" className="animate-spin" data-testid="spinner" />}
      {loading && loadingText ? loadingText : children}
    </Button>
  );
}
