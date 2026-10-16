import { ToastHost } from "@/components/layout/ToastHost";

/** The admin pages show toasts. The page checks the admin role itself. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <ToastHost>{children}</ToastHost>;
}
