/**
 * Dark mode preference. Persisted in a cookie, defaults to the system setting.
 * The `.dark` class on <html> switches the CSS variables in src/styles/themes.css.
 */

export const THEME_COOKIE = "fleetgrid-theme";
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

/** Reads the preference from a `document.cookie` style string. */
export function readThemeCookie(cookieString: string): ThemePreference {
  const match = cookieString.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`));
  return parseThemePreference(match ? decodeURIComponent(match[1]) : undefined);
}

export function buildThemeCookie(preference: ThemePreference): string {
  return `${THEME_COOKIE}=${encodeURIComponent(preference)}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Applies the stored preference to <html>. Browser only. */
export function applyStoredTheme(): ResolvedTheme {
  const resolved = resolveTheme(readThemeCookie(document.cookie), systemPrefersDark());
  document.documentElement.classList.toggle("dark", resolved === "dark");
  return resolved;
}

/** Saves the preference in the cookie and applies it. Browser only. */
export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  document.cookie = buildThemeCookie(preference);
  return applyStoredTheme();
}

/** Flips between light and dark based on what is currently shown. Browser only. */
export function toggleTheme(): ResolvedTheme {
  const isDark = document.documentElement.classList.contains("dark");
  return setThemePreference(isDark ? "light" : "dark");
}

/**
 * Inline script for <head>. Runs before first paint so there is no flash,
 * and keeps pages statically rendered (the server never reads the cookie).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var p=m?decodeURIComponent(m[1]):"system";var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
