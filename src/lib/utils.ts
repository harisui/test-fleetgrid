import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class merging that knows the FleetGrid token classes. Without this, tailwind-merge reads
 * `text-body` as a text color and drops it whenever `text-foreground` follows.
 */
const TYPE_SCALE = [
  "body",
  "body-lg",
  "label",
  "helper",
  "button",
  "eyebrow",
  "h1",
  "h2",
  "code",
  "number",
  "small",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TYPE_SCALE }],
      leading: [{ leading: TYPE_SCALE }],
      tracking: [{ tracking: ["eyebrow", "code"] }],
      "font-family": [{ font: ["heading", "sans", "mono"] }],
      rounded: [{ rounded: ["card", "field", "button", "chip", "badge", "sheet", "sign"] }],
      shadow: [{ shadow: ["0", "1", "2"] }],
      h: [{ h: ["target", "target-lg", "card-min"] }],
      "min-h": [{ "min-h": ["target", "target-lg", "card-min"] }],
      size: [{ size: ["target", "target-lg"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
