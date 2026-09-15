// Fixes titles entered/imported as tracked-out ALL CAPS (e.g. a video
// lecture titled "TEST LECTURE") without touching titles that already use
// deliberate mixed case (e.g. "Intro to CSS"), which a blanket
// lowercase-then-capitalize would otherwise mangle.
export function toSentenceCase(text: string): string {
  if (/[a-z]/.test(text)) return text;
  const lower = text.toLowerCase();
  return lower.replace(/[a-z]/, (c) => c.toUpperCase());
}
