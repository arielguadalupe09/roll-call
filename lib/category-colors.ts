// Category color-coding shared by every "class/category chip" in the app
// (schedule blocks, class cards, ...) so the same subject text always maps
// to the same one of the app's 4 category tones (sage/dustyblue/clay/
// violet). Known program/subject prefixes map deterministically; anything
// unmatched falls back to a stable hash so it still gets a consistent (if
// arbitrary) tone instead of everything defaulting to one color.
export type CategoryTone = "sage" | "dustyblue" | "clay" | "violet";

const CATEGORY_TONES: CategoryTone[] = ["sage", "dustyblue", "clay", "violet"];

const PREFIX_RULES: { pattern: RegExp; tone: CategoryTone }[] = [
  { pattern: /\bCWTS\b/, tone: "sage" },
  { pattern: /\b(INFO\s?TECH|INFOTECH|NET)\b/, tone: "dustyblue" },
  { pattern: /\bCSS\b/, tone: "clay" },
  { pattern: /\bMULTI\b/, tone: "violet" },
];

function hashIndex(text: string): number {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % CATEGORY_TONES.length;
}

export function getCategoryColor(text: string): CategoryTone {
  const upper = text.toUpperCase();
  for (const rule of PREFIX_RULES) {
    if (rule.pattern.test(upper)) return rule.tone;
  }
  return CATEGORY_TONES[hashIndex(text)];
}
