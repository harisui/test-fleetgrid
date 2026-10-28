import { redirect } from "next/navigation";
import { ADMIN_HOME } from "@/lib/admin/nav";

/** The admin's home is the Drivers page. */
export default function AdminPage() {
  redirect(ADMIN_HOME);
}
