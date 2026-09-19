// Turns text copied from a spreadsheet column into one entry per row.
// Rows are separated by newlines; if several columns were copied (e.g. name +
// score), the last cell of each row is the score. A blank cell stays "" so the
// caller can leave that student's existing score untouched.
export function parseScoreColumn(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.map((line) => {
    const cells = line.split("\t");
    return cells[cells.length - 1].trim();
  });
}

// A score is valid when blank (no score yet) or a number within 0..max.
export function isValidScore(value: string, maxScore: number): boolean {
  const v = value.trim();
  if (v === "") return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= maxScore;
}
