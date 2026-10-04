import { getServerEnv, type ServerEnv } from "@/lib/env";

/** How a person reaches FleetGrid. Either part may be missing until the client provides it. */
export interface SupportContact {
  email?: string;
  phone?: string;
}

/** Read on the server from SUPPORT_EMAIL and SUPPORT_PHONE, so they change without code. */
export function getSupportContact(
  env: Pick<ServerEnv, "SUPPORT_EMAIL" | "SUPPORT_PHONE"> = getServerEnv(),
): SupportContact {
  return {
    ...(env.SUPPORT_EMAIL && { email: env.SUPPORT_EMAIL }),
    ...(env.SUPPORT_PHONE && { phone: env.SUPPORT_PHONE }),
  };
}
