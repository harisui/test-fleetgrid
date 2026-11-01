// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One sending path (CR-3 guardrail): only TextService hands a text to the SMS provider, so
 * every text is logged first and never goes to a number that said STOP. No server action or
 * route takes a message body.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

const source = files("src").map((path) => ({ path: path.replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));

describe("the sending path", () => {
  it("only TextService calls the provider's send", () => {
    const callers = source
      .filter(({ text }) => /\b(sms|provider|smsProvider)\.send\(/.test(text))
      .map(({ path }) => path);
    expect(callers).toEqual(["src/server/services/TextService.ts"]);
  });

  it("no server action or route reads a body, message or text field for a text", () => {
    const entryPoints = source.filter(({ path }) => path.startsWith("src/server/actions/") || path.startsWith("src/app/api/"));
    for (const { path, text } of entryPoints) {
      expect(text, path).not.toMatch(/\b(body|messageBody|smsBody|text)\s*:\s*z\./);
      expect(text, path).not.toMatch(/(input|params|formData)\.(body|message|text)\b/);
    }
  });

  it("the notice actions only pass the choices and the typed confirmation to the service", () => {
    const actions = source.find(({ path }) => path === "src/server/actions/notice.actions.ts")!.text;
    expect(actions).not.toMatch(/textService|TextService|\.send\(\{/);
  });
});
