"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

/**
 * The admin's page-load bar (user request of 2026-11-02): a thin orange line across the top
 * that creeps while the next page loads and fills when it arrives. It starts on a click of an
 * internal link or a GET form (the filters), and finishes when the address changes. Hidden
 * from screen readers; the page itself announces the change.
 */
function Bar() {
  const bar = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const finish = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The address changed: the page has arrived.
  useEffect(() => {
    const el = bar.current;
    if (!el || el.dataset.state !== "loading") return;
    el.dataset.state = "done";
    clearTimeout(finish.current);
    finish.current = setTimeout(() => {
      el.dataset.state = "idle";
    }, 400);
  }, [pathname, search]);

  useEffect(() => {
    const start = (target: URL) => {
      const el = bar.current;
      if (!el) return;
      if (target.origin !== window.location.origin) return;
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      clearTimeout(finish.current);
      el.dataset.state = "idle";
      // Next frame, so the bar restarts from empty before it creeps.
      requestAnimationFrame(() => {
        el.dataset.state = "loading";
      });
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      start(new URL(link.href));
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get" || !form.getAttribute("action")) return;
      const url = new URL(form.action);
      url.search = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
      start(url);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    // Marks the bar as listening, so a test (or a curious reader) knows clicks are caught now.
    if (bar.current) bar.current.dataset.ready = "true";
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-60 h-1" data-slot="admin-progress">
      <div
        ref={bar}
        data-state="idle"
        className="h-full origin-left scale-x-0 bg-primary opacity-0 data-[state=done]:scale-x-100 data-[state=done]:opacity-0 data-[state=done]:transition-[transform,opacity] data-[state=done]:duration-(--dur-progress-done) data-[state=loading]:scale-x-90 data-[state=loading]:opacity-100 data-[state=loading]:transition-transform data-[state=loading]:duration-(--dur-progress) data-[state=loading]:ease-out"
      />
    </div>
  );
}

export function AdminProgressBar() {
  // useSearchParams needs a Suspense boundary; the bar has nothing to show meanwhile.
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
