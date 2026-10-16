import { ToastHost } from "@/components/layout/ToastHost";

/** Sign-in, the code and the role choice show toasts; the marketing pages do not. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <ToastHost>{children}</ToastHost>;
}
