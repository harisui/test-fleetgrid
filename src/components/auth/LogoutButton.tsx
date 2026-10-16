import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth.actions";

/**
 * Works without client JavaScript: a plain form that posts to the sign-out action. Sits in the
 * graphite header, so it takes the header's text color.
 */
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={signOutAction}>
      <Button
        type="submit"
        variant="ghost"
        size="md"
        className="px-3 text-current hover:bg-sign-panel-foreground/10"
      >
        <LogOut aria-hidden="true" />
        {/* Compact: the icon alone on narrow phones, the words from sm up. The name stays. */}
        <span className={compact ? "sr-only sm:not-sr-only" : undefined}>Log out</span>
      </Button>
    </form>
  );
}
