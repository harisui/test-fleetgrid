import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStoredTheme,
  buildThemeCookie,
  parseThemePreference,
  readThemeCookie,
  resolveTheme,
  setThemePreference,
  THEME_COOKIE,
  THEME_INIT_SCRIPT,
  toggleTheme,
} from "@/lib/theme";

function clearThemeCookie() {
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
}

function stubSystemDark(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches })),
  );
}

beforeEach(() => {
  clearThemeCookie();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseThemePreference", () => {
  it.each(["light", "dark", "system"] as const)("accepts %s", (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });

  it.each([undefined, null, "", "purple", "DARK"])("falls back to system for %s", (value) => {
    expect(parseThemePreference(value)).toBe("system");
  });
});

describe("readThemeCookie / buildThemeCookie", () => {
  it("reads the preference among other cookies", () => {
    expect(readThemeCookie(`a=1; ${THEME_COOKIE}=dark; b=2`)).toBe("dark");
    expect(readThemeCookie(`${THEME_COOKIE}=light`)).toBe("light");
  });

  it("defaults to system when missing or invalid", () => {
    expect(readThemeCookie("")).toBe("system");
    expect(readThemeCookie(`${THEME_COOKIE}=nope`)).toBe("system");
    expect(readThemeCookie(`x${THEME_COOKIE}=dark`)).toBe("system");
  });

  it("builds a one-year, site-wide cookie", () => {
    expect(buildThemeCookie("dark")).toBe(
      `${THEME_COOKIE}=dark; path=/; max-age=31536000; SameSite=Lax`,
    );
  });
});

describe("resolveTheme", () => {
  it("follows the system when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("an explicit preference wins over the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("applyStoredTheme", () => {
  it("defaults to the system setting", () => {
    stubSystemDark(true);
    expect(applyStoredTheme()).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    stubSystemDark(false);
    expect(applyStoredTheme()).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("treats a missing matchMedia as light", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(applyStoredTheme()).toBe("light");
  });

  it("uses the cookie over the system setting", () => {
    stubSystemDark(true);
    document.cookie = buildThemeCookie("light");
    expect(applyStoredTheme()).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("setThemePreference / toggleTheme", () => {
  it("persists the preference in the cookie and applies it", () => {
    stubSystemDark(false);
    expect(setThemePreference("dark")).toBe("dark");
    expect(readThemeCookie(document.cookie)).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("toggles between dark and light and persists each change", () => {
    stubSystemDark(false);
    expect(toggleTheme()).toBe("dark");
    expect(readThemeCookie(document.cookie)).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(readThemeCookie(document.cookie)).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it("applies a stored dark preference before paint", () => {
    stubSystemDark(false);
    document.cookie = buildThemeCookie("dark");
    run();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("applies a stored light preference even when the system is dark", () => {
    stubSystemDark(true);
    document.cookie = buildThemeCookie("light");
    document.documentElement.classList.add("dark");
    run();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("follows the system when nothing is stored", () => {
    stubSystemDark(true);
    run();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("never throws", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("boom");
    });
    expect(run).not.toThrow();
  });
});
