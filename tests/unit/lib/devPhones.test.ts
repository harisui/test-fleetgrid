// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { devPhonesEnabled } from "@/lib/dev/phones";
import { createFakeDriversAction, sendFakeReplyAction } from "@/server/actions/devPhones.actions";
import DevPhonesPage from "@/app/dev/phones/page";

const state = vi.hoisted(() => ({
  env: { VERCEL_ENV: undefined as string | undefined, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", TWILIO_AUTH_TOKEN: "t" },
  kind: "fake" as "fake" | "held" | "twilio",
  admin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/env", async (original) => ({ ...(await original<typeof import("@/lib/env")>()), getServerEnv: () => state.env }));
vi.mock("@/server/container", () => ({ smsProviderKind: () => state.kind, buildTextingServices: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.admin }));

const LOCAL = "http://127.0.0.1:54321";
const HOSTED = "https://abc.supabase.co";
const REFUSING = [
  { name: "on production", vercel: "production", url: LOCAL, kind: "fake" },
  { name: "on a preview on a hosted project", vercel: "preview", url: HOSTED, kind: "fake" },
  { name: "locally against a hosted project", vercel: undefined, url: HOSTED, kind: "fake" },
  { name: "with the real sender", vercel: undefined, url: LOCAL, kind: "twilio" },
  { name: "with texts held", vercel: undefined, url: LOCAL, kind: "held" },
] as const;

describe("the fake phone inbox stays local", () => {
  beforeEach(() => state.admin.mockClear());

  it("opens with the fake sender on the local database", () => {
    expect(devPhonesEnabled({ VERCEL_ENV: undefined, NEXT_PUBLIC_SUPABASE_URL: LOCAL }, "fake")).toBe(true);
  });

  for (const { name, vercel, url, kind } of REFUSING) {
    describe(name, () => {
      beforeEach(() => {
        state.env = { VERCEL_ENV: vercel, NEXT_PUBLIC_SUPABASE_URL: url, TWILIO_AUTH_TOKEN: "t" };
        state.kind = kind;
      });

      it("the page is not found, and the database is never opened", async () => {
        await expect(DevPhonesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
        expect(state.admin).not.toHaveBeenCalled();
      });

      it("adding a driver and replying are refused", async () => {
        const created = await createFakeDriversAction({ count: 1, cdlClass: "A", endorsements: true, tier: "registered", twic: "none", place: "pasadena", texts: "on", paused: false });
        const replied = await sendFakeReplyAction({ phone: "+15555570000", body: "YES 1234" });
        expect(created).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        expect(replied).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        expect(state.admin).not.toHaveBeenCalled();
      });
    });
  }
});
