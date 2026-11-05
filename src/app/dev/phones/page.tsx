import { formatInTimeZone } from "date-fns-tz";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateFakeDrivers, FakeReplyBox } from "@/components/dev/FakePhoneControls";
import { devPhonesEnabled, FAKE_PHONE_PREFIX } from "@/lib/dev/phones";
import { DRIVER_STATUS_LABELS } from "@/lib/drivers/tiers";
import { getServerEnv } from "@/lib/env";
import { SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import { createAdminClient } from "@/lib/supabase/admin";
import { smsProviderKind } from "@/server/container";
import { DevPhonesRepository, type FakePhone } from "@/server/repositories/DevPhonesRepository";

export const metadata: Metadata = { title: "Fake phones", robots: { index: false, follow: false } };

function describe(phone: FakePhone): string {
  const parts = [DRIVER_STATUS_LABELS[phone.status]];
  if (phone.smsOptedOut) parts.push("replied STOP");
  else if (!phone.smsOptIn) parts.push("no consent");
  if (phone.shiftsPaused) parts.push("paused");
  return parts.join(", ");
}

/** Local only (devPhonesEnabled): each fake driver's texts, and a reply box through the real webhook. */
export default async function DevPhonesPage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  if (!devPhonesEnabled(getServerEnv(), smsProviderKind())) notFound();
  const { phone } = await searchParams;
  const repository = new DevPhonesRepository(createAdminClient());
  const phones = await repository.listPhones();
  const chosen = phone?.startsWith(FAKE_PHONE_PREFIX) ? phones.find((item) => item.phone === phone) : undefined;
  const thread = chosen ? await repository.thread(chosen.phone) : [];

  return (
    <main className="mx-auto flex w-full max-w-site flex-col gap-6 bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-h2 leading-h2 font-semibold">Fake phones</h1>
        <p className="text-small leading-small text-muted-foreground">Local only. No real text goes out from here.</p>
      </header>
      <CreateFakeDrivers />
      <div className="grid gap-6 lg:grid-cols-3">
        <nav aria-label="Fake phones" className="flex max-h-96 flex-col gap-2 overflow-y-auto lg:max-h-none">
          {phones.length === 0 && <p className="text-small leading-small text-muted-foreground">No fake drivers yet.</p>}
          {phones.map((item) => (
            <Link
              key={item.phone}
              href={`/dev/phones?phone=${encodeURIComponent(item.phone)}`}
              aria-current={item.phone === chosen?.phone ? "page" : undefined}
              data-slot="fake-phone"
              className="flex flex-col rounded-card border border-border bg-card p-3 aria-[current=page]:border-border-strong"
            >
              <span className="font-semibold">{item.fullName}</span>
              <span className="text-small leading-small">{item.phone}</span>
              <span className="text-small leading-small text-muted-foreground">{describe(item)}</span>
            </Link>
          ))}
        </nav>
        <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-5 lg:col-span-2" aria-label="Texts">
          {!chosen && <p className="text-muted-foreground">Pick a phone to read its texts.</p>}
          {chosen && (
            <>
              <h2 className="font-heading text-h3 leading-h3 font-semibold">{chosen.fullName}</h2>
              <ol className="flex flex-col gap-3" data-slot="fake-thread">
                {thread.length === 0 && <li className="text-muted-foreground">No texts yet.</li>}
                {thread.map((text) => (
                  <li key={text.id} data-direction={text.direction} className="flex max-w-prose flex-col gap-1 rounded-card border border-border p-3 data-[direction=inbound]:self-end data-[direction=inbound]:bg-muted">
                    <span data-slot="fake-text">{text.body}</span>
                    <span className="text-small leading-small text-muted-foreground">
                      {formatInTimeZone(new Date(text.at), SHIFT_TIME_ZONE, "MMM d, h:mm:ss a")} Houston, {text.kind}, {text.status}
                    </span>
                  </li>
                ))}
              </ol>
              <FakeReplyBox phone={chosen.phone} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
