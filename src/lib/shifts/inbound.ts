/**
 * Reading a driver's reply. Twilio's Advanced Opt-Out answers its own keywords (decision B,
 * 2026-11-01): FleetGrid logs them and syncs the opt-out state, and never replies to them, so
 * a driver never gets two answers.
 */

/** Twilio's default opt-out keywords. */
export const OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"] as const;
/** Twilio's opt-in keywords. YES is one too, but only for a number that has opted out. */
export const OPT_IN_KEYWORDS = ["START", "UNSTOP"] as const;
export const HELP_KEYWORDS = ["HELP", "INFO"] as const;

export type InboundIntent =
  | { type: "opt_out"; keyword: string }
  | { type: "opt_in"; keyword: string }
  | { type: "help"; keyword: string }
  | { type: "yes"; code: string | null }
  | { type: "other" };

/** Upper case, single spaces, no punctuation at either end. */
function normalize(body: string): string {
  return body
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .toUpperCase();
}

/**
 * What a reply means. `optOutType` is Twilio's own reading (STOP, START or HELP) when
 * Advanced Opt-Out is on; it wins. `optedOut` is whether this number has said STOP, which
 * turns a bare YES into Twilio's opt-in keyword.
 */
export function readInbound(body: string, optedOut: boolean, optOutType?: string | null): InboundIntent {
  const text = normalize(body);
  const twilio = optOutType?.trim().toUpperCase();
  if (twilio === "STOP") return { type: "opt_out", keyword: text || twilio };
  if (twilio === "START") return { type: "opt_in", keyword: text || twilio };
  if (twilio === "HELP") return { type: "help", keyword: text || twilio };

  if ((OPT_OUT_KEYWORDS as readonly string[]).includes(text)) return { type: "opt_out", keyword: text };
  if ((OPT_IN_KEYWORDS as readonly string[]).includes(text)) return { type: "opt_in", keyword: text };
  if ((HELP_KEYWORDS as readonly string[]).includes(text)) return { type: "help", keyword: text };
  if (text === "YES" && optedOut) return { type: "opt_in", keyword: text };

  const yes = /^(?:YES|Y)(?:[\s,.:#-]*(\d{4}))?$/.exec(text);
  if (yes) return { type: "yes", code: yes[1] ?? null };
  return { type: "other" };
}
