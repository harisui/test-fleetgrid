"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscribeLive } from "@/lib/supabase/live";

/**
 * The live view (T3.9): the shift page follows its shift and its offers through Supabase
 * Realtime (RLS decides what reaches the carrier) and redraws when either changes. A slow
 * poll backs it up in case the socket drops.
 */
export function ShiftLiveRefresh({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const stop = subscribeLive(
      `shift-${shiftId}`,
      [
        { table: "shifts", filter: `id=eq.${shiftId}` },
        { table: "broadcast_recipients", filter: `shift_id=eq.${shiftId}` },
      ],
      refresh,
    );
    const poll = setInterval(() => router.refresh(), 30_000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      stop();
    };
  }, [router, shiftId]);
  return null;
}
