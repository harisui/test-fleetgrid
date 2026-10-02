import type { ReactNode } from "react";

/** App-level types. Database row types live in database.types.ts (generated). */

export interface NavItem {
  href: string;
  label: string;
  /** A rendered icon element, for example <User />. Elements can cross the server/client boundary. */
  icon?: ReactNode;
}

export const ACCOUNT_STATUSES = ["pending", "approved", "blocked"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
