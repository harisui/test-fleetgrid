"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

/**
 * Activity stays current: Realtime on the text log and the offers (admin-only through RLS)
 * redraws the page, debounced, and so does coming back to the window.
 */
export function MessagingLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    const channel = supabase
      .channel("admin-messaging")
      .on("postgres_changes", { event: "*", schema: "public", table: "sms_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcast_recipients" }, refresh)
      .subscribe();
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
