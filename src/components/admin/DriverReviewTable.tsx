"use client";

import { format } from "date-fns";
import { Ban, CircleCheck, Clock, MapPinOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { REVIEW_FILTERS, reviewFilterHref, type ReviewFilter } from "@/lib/admin/options";
import { summarizeDriver } from "@/lib/carrier/driverSummary";
import { formatE164ForDisplay } from "@/lib/phone";
import { setDriverStatusAction } from "@/server/actions/admin.actions";
import type { DriverReview } from "@/server/services/AdminService";
import type { AccountStatus } from "@/types/domain";

interface DriverReviewTableProps {
  drivers: DriverReview[];
  /** The list shown: one status, or "all". */
  filter: ReviewFilter;
}

const ACTIONS: { status: AccountStatus; label: string; busy: string; variant: "primary" | "secondary" | "destructive" }[] = [
  { status: "approved", label: "Approve", busy: "Approving...", variant: "primary" },
  { status: "blocked", label: "Block", busy: "Blocking...", variant: "destructive" },
  { status: "pending", label: "Set pending", busy: "Saving...", variant: "secondary" },
];

const DONE: Record<AccountStatus, string> = {
  approved: "Approved. Subscribed carriers can find this driver now.",
  blocked: "Blocked. The driver is signed out and hidden from carriers.",
  pending: "Back in the review queue.",
};

/** The buttons for one driver: the two statuses the driver is not already in. */
function StatusButtons({ review }: { review: DriverReview }) {
  const router = useRouter();
  const [pending, setPending] = useState<AccountStatus>();

  async function change(status: AccountStatus) {
    setPending(status);
    const result = await setDriverStatusAction({ profileId: review.profile.id, status });
    setPending(undefined);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(DONE[status]);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.filter((action) => action.status !== review.profile.status).map((action) => (
        <LoadingButton
          key={action.status}
          type="button"
          size="md"
          variant={action.variant}
          loading={pending === action.status}
          loadingText={action.busy}
          disabled={pending !== undefined}
          onClick={() => change(action.status)}
          aria-label={`${action.label} ${review.driver.fullName}`}
        >
          {action.status === "approved" && <CircleCheck aria-hidden="true" />}
          {action.status === "blocked" && <Ban aria-hidden="true" />}
          {action.status === "pending" && <Clock aria-hidden="true" />}
          {action.label}
        </LoadingButton>
      ))}
    </div>
  );
}

/** Drivers to review, newest first, with the facts a reviewer checks and the two buttons. */
export function DriverReviewTable({ drivers, filter }: DriverReviewTableProps) {
  return (
    <div className="flex flex-col gap-4" data-slot="driver-review">
      <nav aria-label="Filter drivers" className="flex flex-wrap gap-2">
        {REVIEW_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={reviewFilterHref(option.value)}
            aria-current={option.value === filter ? "page" : undefined}
            className={
              option.value === filter
                ? "inline-flex h-target items-center rounded-chip border border-selection bg-selection-tint px-4 text-label font-semibold ring-1 ring-selection ring-inset"
                : "inline-flex h-target items-center rounded-chip border border-border-strong bg-card px-4 text-label font-semibold hover:bg-muted"
            }
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {drivers.length === 0 ? (
        <EmptyState
          title="No drivers here"
          description={
            filter === "pending" ? "Nothing waiting for review." : "No drivers with this status."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Drivers">
          {drivers.map((review) => {
            const summary = summarizeDriver(review.driver);
            return (
              <li
                key={review.driver.id}
                className="flex flex-col gap-3 rounded-card border border-border bg-card p-4"
                data-driver={review.driver.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-label leading-label font-semibold">{review.driver.fullName}</h2>
                    <p className="text-helper leading-helper text-muted-foreground">
                      {formatE164ForDisplay(review.profile.phone)}
                      {review.driver.city && (
                        <>
                          {" "}
                          · {review.driver.city}, {review.driver.state} {review.driver.zip}
                        </>
                      )}{" "}
                      · signed up {format(new Date(review.driver.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {review.inServiceArea === false && (
                      <Badge variant="info" data-area="outside">
                        <MapPinOff aria-hidden="true" />
                        Outside launch area
                      </Badge>
                    )}
                    {!review.driver.cardCompleted && (
                      <Badge variant="warning" data-card="incomplete">
                        Card incomplete
                      </Badge>
                    )}
                    <StatusBadge status={review.profile.status} />
                  </div>
                </div>
                <p className="text-helper leading-helper text-muted-foreground">
                  {summary.cdlClass}, {summary.experience}. {summary.record}. {summary.cards}.{" "}
                  Endorsements {summary.endorsements}. {summary.equipment}.
                </p>
                <StatusButtons review={review} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
