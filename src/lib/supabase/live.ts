import { createBrowserClient } from "@/lib/supabase/browser";

export interface LiveTable {
  table: string;
  /** A Realtime filter, like "id=eq.123". */
  filter?: string;
}

/**
 * Calls onChange when a row of these tables changes, as RLS lets the signed-in person see it.
 * The session has to reach Realtime before the channel joins: joined with the anon key, RLS
 * shows nothing, and a filter on a column anon cannot read refuses the whole channel. Returns
 * the function that stops listening.
 */
export function subscribeLive(name: string, tables: readonly LiveTable[], onChange: () => void): () => void {
  const supabase = createBrowserClient();
  let stopped = false;
  let leave: (() => void) | undefined;

  void (async () => {
    const { data } = await supabase.auth.getSession();
    await supabase.realtime.setAuth(data.session?.access_token ?? null);
    if (stopped) return;
    const channel = supabase.channel(name);
    for (const { table, filter } of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, onChange);
    }
    channel.subscribe();
    leave = () => void supabase.removeChannel(channel);
  })();

  return () => {
    stopped = true;
    leave?.();
  };
}
