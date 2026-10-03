import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStoredTheme,
  buildThemeCookie,
  DEFAULT_THEME_PREFERENCE,
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
  it("light is the default", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("light");
  });

  it.each(["light", "dark", "system"] as const)("accepts %s", (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });

  it.each([undefined, null, "", "purple", "DARK"])("falls back to light for %s", (value) => {
    expect(parseThemePreference(value)).toBe("light");
  });
});

describe("readThemeCookie / buildThemeCookie", () => {
  it("reads the preference among other cookies", () => {
    expect(readThemeCookie(`a=1; ${THEME_COOKIE}=dark; b=2`)).toBe("dark");
    expect(readThemeCookie(`${THEME_COOKIE}=light`)).toBe("light");
  });

  it("defaults to light when missing or invalid", () => {
    expect(readThemeCookie("")).toBe("light");
    expect(readThemeCookie(`${THEME_COOKIE}=nope`)).toBe("light");
    expect(readThemeCookie(`x${THEME_COOKIE}=dark`)).toBe("light");
  });

  it("builds a one-year, site-wide cookie", () => {
    expect(buildThemeCookie("dark")).toBe(
      `${THEME_COOKIE}=dark; path=/; max-age=31536000; SameSite=Lax`,
    );
  });
});

describe("resolveTheme", () => {
  it("follows the system only when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("an explicit preference wins over the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("applyStoredTheme", () => {
  it("is light by default, even when the system prefers dark", () => {
    stubSystemDark(true);
    expect(applyStoredTheme()).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("follows the system when the user chose system", () => {
    stubSystemDark(true);
    document.cookie = buildThemeCookie("system");
    expect(applyStoredTheme()).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");

    stubSystemDark(false);
    expect(applyStoredTheme()).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("treats a missing matchMedia as light", () => {
    vi.stubGlobal("matchMedia", undefined);
    document.cookie = buildThemeCookie("system");
    expect(applyStoredTheme()).toBe("light");
  });

  it("uses a stored dark choice", () => {
    stubSystemDark(false);
    document.cookie = buildThemeCookie("dark");
    expect(applyStoredTheme()).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
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

  it("stays light when nothing is stored, whatever the system says", () => {
    stubSystemDark(true);
    document.documentElement.classList.add("dark");
    run();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("follows the system when the user chose system", () => {
    stubSystemDark(true);
    document.cookie = buildThemeCookie("system");
    run();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("never throws", () => {
    document.cookie = buildThemeCookie("system");
    vi.stubGlobal("matchMedia", () => {
      throw new Error("boom");
    });
    expect(run).not.toThrow();
  });
});
