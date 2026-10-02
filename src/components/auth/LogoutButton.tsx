import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth.actions";

/** Works without client JavaScript: a plain form that posts to the sign-out action. */
export function LogoutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="touch" className="px-3">
        <LogOut aria-hidden="true" />
        <span>Log out</span>
      </Button>
    </form>
  );
}
