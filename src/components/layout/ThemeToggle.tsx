"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { applyStoredTheme, toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Dark mode toggle. The choice is saved in a cookie.
 * Both icons are rendered and CSS shows the right one, so server and client markup always match.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // React Strict Mode resets <html> attributes on its dev remount; re-apply the stored theme.
  useLayoutEffect(() => {
    applyStoredTheme();
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => toggleTheme()}
      className={cn("text-current hover:bg-sign-panel-foreground/10", className)}
    >
      <Sun aria-hidden="true" className="hidden size-5 dark:block" />
      <Moon aria-hidden="true" className="size-5 dark:hidden" />
    </Button>
  );
}
