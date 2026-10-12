"use client";

import { MapPinOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import {
  CARRIER_WAITLIST_JOINED,
  CARRIER_WAITLIST_TEXT,
  CARRIER_WAITLIST_TITLE,
} from "@/lib/carrier/options";
import { joinWaitlistAction } from "@/server/actions/carrier.actions";

interface WaitlistCardProps {
  /** The yard as saved, for example "Dallas, TX 75201". */
  yard: string;
  joined: boolean;
}

/** What an out-of-area carrier sees instead of checkout: the reason, and a way onto the list. */
export function WaitlistCard({ yard, joined: initiallyJoined }: WaitlistCardProps) {
  const router = useRouter();
  const [joined, setJoined] = useState(initiallyJoined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setPending(true);
    setError(undefined);
    const result = await joinWaitlistAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setJoined(true);
    router.refresh();
  }

  return (
    <section
      aria-labelledby="waitlist-title"
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-5"
      data-slot="waitlist"
    >
      <div className="flex size-10 items-center justify-center rounded-field bg-muted text-foreground">
        <MapPinOff aria-hidden="true" className="size-6" />
      </div>
      <h1 id="waitlist-title" className="font-heading text-h2 leading-h2 font-semibold">
        {CARRIER_WAITLIST_TITLE}
      </h1>
      <p className="text-helper leading-helper text-muted-foreground">
        Your yard is at <span className="font-semibold text-foreground">{yard}</span>.{" "}
        {CARRIER_WAITLIST_TEXT}
      </p>
      {joined ? (
        <InlineNote variant="success" data-slot="waitlist-joined">
          {CARRIER_WAITLIST_JOINED} We will email you when FleetGrid reaches your area.
        </InlineNote>
      ) : (
        <LoadingButton type="button" onClick={join} loading={pending} loadingText="Joining...">
          Join the waitlist
        </LoadingButton>
      )}
      {error && (
        <InlineNote variant="error" role="alert">
          {error}
        </InlineNote>
      )}
      <p className="text-helper leading-helper text-muted-foreground">
        Moved, or entered the wrong ZIP?{" "}
        <Button asChild variant="link">
          <Link href="/carrier/account">Change your yard</Link>
        </Button>
      </p>
    </section>
  );
}
