// Reads an answer key out of the text of an uploaded file (Excel/CSV rows
// joined into lines, a Word or PDF document, a .txt file). No model involved.
//
// Two shapes are recognised:
//   numbered  "1. A  2) b  3 - C", "1 A" per line, or an Item | Answer table
//             -- each answer goes to its own item number, so gaps and any
//             order work;
//   sequence  just the letters in order: "ABDCA BCDAB", one per line, or one
//             per cell.

export type AnswerKeyText = {
  // One entry per item (index 0 = item 1); "" = no answer found for that item.
  letters: string[];
  format: "numbered" | "sequence";
  // Item numbers that appeared more than once with different answers (the last one wins).
  conflicts: number[];
};

const MAX_ITEMS = 500;
const LETTERS = "ABCDE";

// A number, optional punctuation, then a lone A-E (not the start of a word):
// "12. B", "12) b", "12 - B", "12:B", "12B", "12 | B".
const NUMBERED = /(?<![\d.])(\d{1,3})\s*[.):\-|]?\s*\(?([A-Ea-e])\)?(?![A-Za-z])/g;

export function answerKeyFromText(text: string): AnswerKeyText | null {
  return numbered(text) ?? sequence(text);
}

function numbered(text: string): AnswerKeyText | null {
  const byItem = new Map<number, string>();
  const conflicts = new Set<number>();
  let matches = 0;
  for (const m of text.matchAll(NUMBERED)) {
    const item = Number(m[1]);
    if (item < 1 || item > MAX_ITEMS) continue;
    const letter = m[2].toUpperCase();
    const previous = byItem.get(item);
    if (previous && previous !== letter) conflicts.add(item);
    byItem.set(item, letter);
    matches += 1;
  }
  // A couple of stray "1 A"-looking bits in prose isn't a key.
  if (matches < 2) return null;
  const last = Math.max(...byItem.keys());
  const letters = Array.from({ length: last }, (_, i) => byItem.get(i + 1) ?? "");
  return { letters, format: "numbered", conflicts: [...conflicts].sort((a, b) => a - b) };
}

function sequence(text: string): AnswerKeyText | null {
  // Only accept text that is nothing but answer letters and separators, so a
  // paragraph of prose can't turn into a key.
  const compact = text.replace(/[\s,;|]+/g, "");
  if (compact.length < 2 || compact.length > MAX_ITEMS) return null;
  if (!new RegExp(`^[${LETTERS}${LETTERS.toLowerCase()}-]+$`).test(compact)) return null;
  const letters = [...compact.toUpperCase()].map((ch) => (ch === "-" ? "" : ch));
  return { letters, format: "sequence", conflicts: [] };
}

// Excel/CSV rows -> lines of tab-separated cells, the shape answerKeyFromText reads.
export function matrixToText(matrix: unknown[][]): string {
  return matrix.map((row) => row.map((cell) => String(cell ?? "").trim()).join("\t")).join("\n");
}
