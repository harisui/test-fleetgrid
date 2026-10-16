import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

/**
 * The toast host for the parts of the app that show toasts: sign-in, the driver and carrier
 * areas and admin. The public marketing pages never toast, so they do not load the toast
 * library at all; it lives in these layouts rather than the root one.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-center" richColors={false} />
    </>
  );
}
