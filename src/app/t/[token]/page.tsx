import type { Metadata } from "next";
import Link from "next/link";
import { DriverTermsForm } from "@/components/driver/DriverTermsForm";
import { TermsReview } from "@/components/driver/TermsReview";
import { AppShell } from "@/components/layout/AppShell";
import { InlineNote } from "@/components/shared/InlineNote";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Accept the Terms of Service", robots: { index: false, follow: false } };

const linkClass = "font-semibold text-foreground underline underline-offset-4";

const ENDED: Record<"used" | "expired" | "not_found", string> = {
  used: "This link was used already, so your acceptance is on file.",
  expired: "This link has expired.",
  not_found: "This link does not work.",
};

/**
 * The one-time Terms link a driver gets by text (Milestone 6). No sign-in: the link names the
 * driver. Opening it records nothing; the driver reads the Terms, ticks the box and accepts,
 * which uses the link up.
 */
export default async function TermsLinkPage({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  const { termsService } = await getContainer();
  const state = await termsService.linkState(token);

  return (
    <AppShell width="narrow">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Our Terms of Service changed</h1>
          {state.status === "valid" && (
            <p className="text-helper leading-helper text-muted-foreground">
              Please read and accept them to keep getting shift offers. Your profile and documents stay as they are.
            </p>
          )}
        </div>
        {state.status === "valid" ? (
          <>
            <TermsReview terms={state.terms} />
            <DriverTermsForm mode={{ kind: "link", token }} />
          </>
        ) : (
          <InlineNote variant={state.status === "used" ? "info" : "warning"} role="status">
            {ENDED[state.status]}{" "}
            {state.status !== "used" && (
              <>
                <Link href="/login" className={linkClass}>
                  Sign in
                </Link>{" "}
                to read and accept the Terms in your account.
              </>
            )}
          </InlineNote>
        )}
      </div>
    </AppShell>
  );
}
