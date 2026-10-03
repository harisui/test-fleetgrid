"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SUPPORT_CONTACT_PLACEHOLDER } from "@/lib/constants";

/** The only control in the onboarding header besides the wordmark. */
export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="border-2 border-sign-panel-muted text-sign-panel-foreground hover:bg-sign-panel-foreground/10"
        >
          Help
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Need a hand?</DialogTitle>
          <DialogDescription>
            Every answer is saved as you go. You can close this page and come back any time; you
            will land on the same question.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-helper leading-helper">
          <p>
            To reach a person, use the FleetGrid {SUPPORT_CONTACT_PLACEHOLDER.replace(/\.$/, "")}.
          </p>
          <p>
            Read the{" "}
            <Link href="/sms-terms" className="font-semibold underline underline-offset-4">
              SMS Terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className="font-semibold underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
