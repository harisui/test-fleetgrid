/** Short-link slugs: lowercase letters, digits and single dashes, 2 to 60 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 60;

/** "Love's, Hwy 225" becomes "loves-hwy-225". Empty when nothing usable is left. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && value.length >= 2 && value.length <= SLUG_MAX_LENGTH;
}
