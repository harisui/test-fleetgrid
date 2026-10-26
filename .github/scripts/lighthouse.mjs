#!/usr/bin/env node
/**
 * Lighthouse CI over the public marketing pages, with the budgets of the website brief
 * (section 8) as assertions in .github/lighthouse/lighthouserc.json: mobile, simulated
 * Slow 4G on a Moto G Power; Performance 90, Accessibility 100, Best Practices 95, SEO 100;
 * LCP under 2.5s, CLS under 0.1, TBT under 200ms; at most 120 kb of JavaScript (gzipped
 * transfer size) per page.
 *
 *   pnpm build && pnpm lighthouse          local: serves the production build on port
 *                                          3100 for the run, then stops it
 *   pnpm lighthouse https://preview-url    a deployed site, such as a Vercel preview
 *
 * Chrome runs with reduced motion, as the axe e2e checks do: the hero's text thread loops,
 * and a contrast check that lands mid-fade measures a half-transparent bubble, not the
 * colours a reader settles on.
 *
 * Local numbers run pessimistic: on localhost every font and script finishes before the
 * first paint, and Lighthouse's simulated slow network then charges all of them to LCP.
 * The brief's assertions are meant for a deployed preview.
 *
 * Reports are written to .lighthouseci/ (gitignored).
 */
import { spawn, spawnSync } from "node:child_process";

const PAGES = ["/", "/carriers", "/drivers", "/faq", "/contact", "/terms", "/privacy", "/sms-terms"];
const LOCAL_PORT = 3100;
const windows = process.platform === "win32";

const remote = process.argv[2];
const base = (remote ?? `http://localhost:${LOCAL_PORT}`).replace(/\/$/, "");

async function waitFor(url, seconds) {
  for (let i = 0; i < seconds; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} did not answer within ${seconds}s`);
}

let server;
if (!remote) {
  server = spawn("pnpm", ["exec", "next", "start", "--port", String(LOCAL_PORT)], {
    stdio: "ignore",
    shell: windows,
  });
  await waitFor(`${base}/`, 60);
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "lhci",
    "autorun",
    "--config=.github/lighthouse/lighthouserc.json",
    ...PAGES.map((path) => `--collect.url=${base}${path}`),
  ],
  { stdio: "inherit", shell: windows },
);

if (server) {
  if (windows) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  else server.kill();
}
process.exit(result.status ?? 1);
