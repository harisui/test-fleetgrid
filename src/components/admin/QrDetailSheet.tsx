"use client";

import { format } from "date-fns";
import { Download, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CopyButton } from "@/components/admin/CopyButton";
import { DetailSheet } from "@/components/admin/DetailSheet";
import { QrStatusBadge } from "@/components/admin/QrTable";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { QR_DONE, qrDownloadHref } from "@/lib/admin/analytics-options";
import { driversHref } from "@/lib/admin/options";
import { setQrLinkActiveAction } from "@/server/actions/qr.actions";
import type { QrLinkRow } from "@/server/services/AnalyticsService";

interface QrDetailSheetProps {
  row: QrLinkRow | null;
  closeHref: string;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-border bg-card p-3">
      <span className="text-eyebrow leading-eyebrow font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="font-heading text-h2 leading-h2 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** One QR code: the preview, the short link with copy, PNG and SVG downloads, the counts and the on/off switch. */
export function QrDetailSheet({ row, closeHref }: QrDetailSheetProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  if (!row) return null;
  const { link } = row;

  async function setActive(isActive: boolean) {
    if (!row) return;
    setPending(true);
    const result = await setQrLinkActiveAction({ qrLinkId: row.link.id, isActive });
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(isActive ? QR_DONE.activated : QR_DONE.deactivated);
    router.refresh();
  }

  return (
    <>
      <DetailSheet
        open
        onOpenChange={(open) => {
          if (!open) router.push(closeHref);
        }}
        title={link.locationName}
        description={`Campaign ${link.campaign}, made ${format(new Date(link.createdAt), "MMMM d, yyyy")}`}
        footer={
          link.isActive ? (
            <Button type="button" variant="destructive" size="md" onClick={() => setConfirming(true)} disabled={pending}>
              Deactivate
            </Button>
          ) : (
            <LoadingButton type="button" size="md" loading={pending} loadingText="Saving..." onClick={() => void setActive(true)}>
              Activate
            </LoadingButton>
          )
        }
      >
        <div className="flex items-center gap-2" data-slot="qr-badges">
          <QrStatusBadge isActive={link.isActive} />
          <span className="text-helper leading-helper text-muted-foreground">
            lands on <span className="font-mono text-code leading-code">{link.targetPath}</span>
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the image is our own route, not an asset */}
          <img
            src={qrDownloadHref(link.id, "svg")}
            alt={`QR code for ${link.locationName}`}
            width={240}
            height={288}
            className="w-60 bg-card"
            data-slot="qr-preview"
          />
          <div className="flex w-full items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-code leading-code" data-slot="short-link">
              {row.shortLink}
            </span>
            <CopyButton value={row.shortLink} label="Copy the short link" />
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button asChild variant="secondary" size="md" className="flex-1">
              <a href={`${qrDownloadHref(link.id, "png")}?download=1`} download>
                <Download aria-hidden="true" />
                Download PNG
              </a>
            </Button>
            <Button asChild variant="secondary" size="md" className="flex-1">
              <a href={`${qrDownloadHref(link.id, "svg")}?download=1`} download>
                <Download aria-hidden="true" />
                Download SVG
              </a>
            </Button>
          </div>
          <p className="text-small leading-small text-muted-foreground">
            Print-ready, with the location name under the code. PNG is 1500 by 1800 pixels.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3" aria-label="Counts">
          <Fact label="Scans, 7 days" value={row.scans7d.toLocaleString("en-US")} />
          <Fact label="Scans, all time" value={row.scansAll.toLocaleString("en-US")} />
          <Fact label="Sign-ups" value={row.signups.toLocaleString("en-US")} />
          <Fact label="Conversion" value={row.conversionPercent === null ? "—" : `${row.conversionPercent}%`} />
        </div>
        <Button asChild variant="secondary" size="md">
          <Link href={driversHref({ qr: link.id })}>
            <Users aria-hidden="true" />
            See the drivers who scanned it
          </Link>
        </Button>
      </DetailSheet>

      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) setConfirming(false);
          }}
          title={`Deactivate ${link.locationName}?`}
          description="Scans of this code will land on the home page without tags, and will not be counted, until it is on again."
          confirmLabel="Deactivate"
          pendingLabel="Saving..."
          variant="destructive"
          pending={pending}
          onConfirm={() => setActive(false)}
        />
      )}
    </>
  );
}
