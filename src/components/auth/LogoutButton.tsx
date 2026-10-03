import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth.actions";

/**
 * Works without client JavaScript: a plain form that posts to the sign-out action. Sits in the
 * graphite header, so it takes the header's text color.
 */
export function LogoutButton() {
  return (
    <form action={signOutAction}>
      <Button
        type="submit"
        variant="ghost"
        size="md"
        className="px-3 text-current hover:bg-sign-panel-foreground/10"
      >
        <LogOut aria-hidden="true" />
        <span>Log out</span>
      </Button>
    </form>
  );
}
