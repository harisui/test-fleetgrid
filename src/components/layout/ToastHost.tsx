import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

/**
 * The toast host for the parts of the app that show toasts: sign-in, the driver and carrier
 * areas and admin. The public marketing pages never toast, so they do not load the toast
 * library at all; it lives in these layouts rather than the root one.
 */
export function ToastHost({
  children,
  position = "top-center",
}: {
  children: ReactNode;
  /** The admin works at a desk: its toasts sit bottom right, out of the way of the table. */
  position?: "top-center" | "bottom-right";
}) {
  return (
    <>
      {children}
      <Toaster position={position} richColors={false} />
    </>
  );
}
