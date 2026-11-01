/**
 * How many SMS segments a text takes, as carriers bill it. Plain GSM-7 text fits 160
 * characters in one segment and 153 in each segment of a longer one; anything outside GSM-7
 * (an emoji, a curly quote) switches the whole text to UCS-2: 70, then 67.
 */
const GSM_7 =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\[~\]|€]*$/;
/** Characters of the GSM-7 extension table, which take two places each. */
const EXTENDED = /[\^{}\[~\]|€]/g;

export function smsSegments(text: string): { characters: number; segments: number; encoding: "GSM-7" | "UCS-2" } {
  if (GSM_7.test(text)) {
    const characters = text.length + (text.match(EXTENDED)?.length ?? 0);
    return { characters, segments: characters <= 160 ? 1 : Math.ceil(characters / 153), encoding: "GSM-7" };
  }
  const characters = [...text].length;
  return { characters, segments: characters <= 70 ? 1 : Math.ceil(characters / 67), encoding: "UCS-2" };
}
