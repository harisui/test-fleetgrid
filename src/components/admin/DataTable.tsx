"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Numbers sit on the right, in tabular digits. */
  align?: "left" | "right";
  /** Codes and phone numbers, in Geist Mono. */
  mono?: boolean;
  /** Long text that may run to a second line (a place, a list of letters). Everything else stays on one line. */
  wrap?: boolean;
  sortable?: boolean;
  className?: string;
}

export type SortDirection = "asc" | "desc";

export interface DataTableSort {
  key: string;
  direction: SortDirection;
}

export interface DataTablePagination {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}

interface DataTableProps<T> {
  /** The accessible name of the table and the card list. */
  label: string;
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** The whole row opens this: a link on the first cell for keyboards, a click anywhere for pointers. */
  rowHref?: (row: T) => string;
  /** The same row on a phone, as a stacked card. */
  renderCard: (row: T) => ReactNode;
  sort?: DataTableSort;
  /** Sorting lives in the URL: the link for a column's next direction. */
  sortHref?: (key: string, direction: SortDirection) => string;
  pagination?: DataTablePagination;
  loading?: boolean;
  empty: { icon: LucideIcon; title: string; description?: string; action?: ReactNode };
  className?: string;
}

const SKELETON_ROWS = 6;

/** "1 to 25 of 140". */
export function pageRangeText({ page, pageSize, total }: Omit<DataTablePagination, "hrefFor">): string {
  if (total === 0) return "0 of 0";
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return `${first.toLocaleString("en-US")} to ${last.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}

function SortIcon({ column, sort }: { column: string; sort?: DataTableSort }) {
  if (sort?.key !== column) return <ArrowUpDown aria-hidden="true" className="size-4 text-muted-foreground" />;
  return sort.direction === "asc" ? (
    <ArrowUp aria-hidden="true" className="size-4" />
  ) : (
    <ArrowDown aria-hidden="true" className="size-4" />
  );
}

/**
 * The admin's list: a table from the lg breakpoint (sticky header, 48px rows, 1px dividers,
 * no stripes, numbers right in tabular digits, codes in mono, sortable columns with a visible
 * icon, "1 to 25 of 140" paging, the whole row clickable) and stacked cards below it. Empty
 * state with an icon and the next action; skeleton rows while loading.
 */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowHref,
  renderCard,
  sort,
  sortHref,
  pagination,
  loading = false,
  empty,
  className,
}: DataTableProps<T>) {
  const router = useRouter();

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
        className={className}
      />
    );
  }

  const openRow = (row: T) => {
    if (rowHref) router.push(rowHref(row));
  };

  return (
    <div className={cn("flex flex-col gap-4", className)} data-slot="data-table" aria-busy={loading || undefined}>
      {/* Phones and tablets: one card per row. */}
      <ul className="flex flex-col gap-3 lg:hidden" aria-label={label}>
        {loading
          ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} aria-hidden="true">
                <Skeleton className="h-24 w-full" />
              </li>
            ))
          : rows.map((row) => <li key={rowKey(row)}>{renderCard(row)}</li>)}
      </ul>

      {/* Desktops: the table. */}
      <div className="hidden overflow-x-auto rounded-card border border-border bg-card lg:block">
        <table className="w-full text-small leading-small" aria-label={label}>
          <thead className="sticky top-0 z-10 bg-card text-left text-small leading-small text-muted-foreground">
            <tr className="border-b border-border">
              {columns.map((column) => {
                const sorted = sort?.key === column.key;
                const nextDirection: SortDirection = sorted && sort?.direction === "asc" ? "desc" : "asc";
                const headerClass = cn(
                  "h-12 px-3 font-semibold whitespace-nowrap",
                  column.align === "right" && "text-right",
                  column.className,
                );
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={headerClass}
                    aria-sort={sorted ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {column.sortable && sortHref ? (
                      <Link
                        href={sortHref(column.key, nextDirection)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-badge underline-offset-4 hover:underline",
                          column.align === "right" && "flex-row-reverse",
                        )}
                        data-sort={column.key}
                      >
                        {column.header}
                        <SortIcon column={column.key} sort={sort} />
                      </Link>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <tr key={index} aria-hidden="true">
                    {columns.map((column) => (
                      <td key={column.key} className="h-12 px-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={rowHref ? () => openRow(row) : undefined}
                    className={cn("h-12", rowHref && "cursor-pointer hover:bg-accent")}
                    data-row={rowKey(row)}
                  >
                    {columns.map((column, index) => {
                      const content =
                        index === 0 && rowHref ? (
                          <Link
                            href={rowHref(row)}
                            onClick={(event) => event.stopPropagation()}
                            className="rounded-badge font-semibold underline-offset-4 hover:underline"
                          >
                            {column.cell(row)}
                          </Link>
                        ) : (
                          column.cell(row)
                        );
                      return (
                        <td
                          key={column.key}
                          className={cn(
                            "px-3 py-2 align-middle",
                            column.wrap ? "min-w-32" : "whitespace-nowrap",
                            column.align === "right" && "text-right tabular-nums",
                            column.mono && "font-mono",
                            column.className,
                          )}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          <span className="text-helper leading-helper text-muted-foreground tabular-nums" data-slot="page-range">
            {pageRangeText(pagination)}
          </span>
          <div className="flex items-center gap-2">
            {pagination.page > 1 ? (
              <Button asChild variant="secondary" size="md">
                <Link href={pagination.hrefFor(pagination.page - 1)} rel="prev">
                  <ChevronLeft aria-hidden="true" />
                  Previous
                </Link>
              </Button>
            ) : (
              <Button variant="secondary" size="md" disabled>
                <ChevronLeft aria-hidden="true" />
                Previous
              </Button>
            )}
            {pagination.page * pagination.pageSize < pagination.total ? (
              <Button asChild variant="secondary" size="md">
                <Link href={pagination.hrefFor(pagination.page + 1)} rel="next">
                  Next
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <Button variant="secondary" size="md" disabled>
                Next
                <ChevronRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
