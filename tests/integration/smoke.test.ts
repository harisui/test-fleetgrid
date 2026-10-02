import { describe, expect, it } from "vitest";

describe("local Supabase stack", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  it("points at a local instance", () => {
    expect(url).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  });

  it("auth service is healthy", async () => {
    const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } });
    expect(response.status).toBe(200);
  });

  it("phone signups are enabled", async () => {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    const settings = (await response.json()) as { external: { phone: boolean } };
    expect(settings.external.phone).toBe(true);
  });
});
