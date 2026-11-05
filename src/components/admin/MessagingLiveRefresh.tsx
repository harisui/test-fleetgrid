"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscribeLive } from "@/lib/supabase/live";

/**
 * Activity stays current: Realtime on the text log and the offers (admin-only through RLS)
 * redraws the page, debounced, and so does coming back to the window.
 */
export function MessagingLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    const stop = subscribeLive("admin-messaging", [{ table: "sms_status_events" }, { table: "sms_messages" }, { table: "broadcast_recipients" }], refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      stop();
    };
  }, [router]);
  return null;
}
