import { ToastHost } from "@/components/layout/ToastHost";

/** Every carrier page can show toasts. Each page checks the carrier's stage itself. */
export default function CarrierLayout({ children }: LayoutProps<"/carrier">) {
  return <ToastHost>{children}</ToastHost>;
}
