import { requireRole } from "@/lib/auth/guards";

/**
 * Every driver route needs a signed-in driver. The app shell with navigation lives in the
 * (app) group; onboarding renders its own shell without any navigation.
 */
export default async function DriverLayout({ children }: LayoutProps<"/driver">) {
  await requireRole("driver");
  return children;
}
