/**
 * Two things the page must know before first paint, both read in one inline script in the
 * root layout:
 *
 * - `js-motion` on <html>: section reveals may start hidden. It is never set when the
 *   visitor prefers reduced motion, and never set at all if the script does not run, so the
 *   server HTML is always visible without it.
 * - `launch-strip-dismissed` on <html>: the strip above the header stays hidden once
 *   dismissed (LaunchStrip remembers the choice in localStorage).
 */

export const LAUNCH_STRIP_STORAGE_KEY = "fleetgrid-launch-strip";
export const LAUNCH_STRIP_DISMISSED = "dismissed";
export const MOTION_CLASS = "js-motion";
export const LAUNCH_STRIP_DISMISSED_CLASS = "launch-strip-dismissed";

export const SITE_INIT_SCRIPT = `(function(){try{var c=document.documentElement.classList;if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)c.add("${MOTION_CLASS}");if(localStorage.getItem("${LAUNCH_STRIP_STORAGE_KEY}")==="${LAUNCH_STRIP_DISMISSED}")c.add("${LAUNCH_STRIP_DISMISSED_CLASS}")}catch(e){}})()`;
