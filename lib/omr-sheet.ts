// Geometry of the GAINS bubble answer sheet (ZipGrade-style), in millimetres.
// The print page (app/(app)/answer-sheets) draws the sheet from these numbers
// and the scanner (lib/omr-scan.ts) reads it back with the same numbers, so
// change them only together -- already printed sheets stop scanning if the
// layout moves.
//
//   ■  ▬▬▬▬ (orientation bar)                 ■
//      Name / exam header               [QR]
//      1 (A)(B)(C)(D)(E)   26 (A)...   51 ...   76 ...
//      ...
//   ■  ▪▪▪ (layout code: one square per column)  ■

export const SHEET_W = 186;
export const SHEET_H = 250;

// Solid corner squares the scanner locks onto.
export const MARKER_SIZE = 10;
export const MARKER_CENTERS = [
  { x: MARKER_SIZE / 2, y: MARKER_SIZE / 2 }, // top-left
  { x: SHEET_W - MARKER_SIZE / 2, y: MARKER_SIZE / 2 }, // top-right
  { x: SHEET_W - MARKER_SIZE / 2, y: SHEET_H - MARKER_SIZE / 2 }, // bottom-right
  { x: MARKER_SIZE / 2, y: SHEET_H - MARKER_SIZE / 2 }, // bottom-left
] as const;

// Solid bar at the top centre only, so the scanner can tell an upside-down sheet.
export const ORIENTATION_BAR = { x: 70, y: 2, w: 46, h: 6 } as const;

// Exam/student QR code, top right under the corner marker.
export const QR_BOX = { x: 146, y: 13, size: 28 } as const;

export const MAX_SHEET_ITEMS = 100;
export const ITEMS_PER_COLUMN = 25;
export const SHEET_OPTIONS = ["A", "B", "C", "D", "E"] as const;
export const BUBBLE_RADIUS = 2.3;
const GRID_TOP = 58; // centre of the first row
const ROW_PITCH = 7;
const COL_X0 = 12;
const COL_WIDTH = 43;
const FIRST_BUBBLE_DX = 12;
const BUBBLE_PITCH = 6.2;
// Width the item columns are spread across (COL_X0 to the right margin).
const GRID_WIDTH = 4 * COL_WIDTH;

export type Point = { x: number; y: number };

// Columns of 25 items an exam's sheet needs (1-4).
export function sheetColumns(itemCount: number): number {
  return Math.min(4, Math.max(1, Math.ceil(itemCount / ITEMS_PER_COLUMN)));
}

// Sheets printed before the layout code always placed the columns as if
// there were four (so a 75-item sheet left the right quarter empty). Newer
// sheets spread their columns evenly over the grid width and print one
// layout-code square per column, so the scanner knows which layout it has --
// a sheet with no squares is read with this legacy spacing.
export const LEGACY_COLUMNS = 4;

// Layout code: small solid squares along the bottom edge, left of centre.
// Kept clear of the corner markers' paper ring and of the strips the
// orientation check samples (the bar region and the paper beside it,
// rotated 180 degrees), so they never change how a sheet is found.
export const LAYOUT_MARK = { x: 24, y: 242, size: 4, pitch: 6 } as const;
export const LAYOUT_MARK_SLOTS = 4;

export function layoutMarkRect(index: number): { x: number; y: number; size: number } {
  return { x: LAYOUT_MARK.x + index * LAYOUT_MARK.pitch, y: LAYOUT_MARK.y, size: LAYOUT_MARK.size };
}

// Left edge of an item's row (for the item number) and its row centre.
// columns: how many columns the sheet's layout spreads out (4 = the
// original spacing, used for 76-100 items and for every legacy sheet).
export function itemRowOrigin(item: number, columns: number = LEGACY_COLUMNS): Point {
  const col = Math.floor((item - 1) / ITEMS_PER_COLUMN);
  const row = (item - 1) % ITEMS_PER_COLUMN;
  // Each column is centred in an equal share of the grid width; with four
  // columns this is exactly COL_X0 + col * COL_WIDTH.
  const slot = GRID_WIDTH / columns;
  return { x: COL_X0 + slot * (col + 0.5) - COL_WIDTH / 2, y: GRID_TOP + row * ROW_PITCH };
}

// Centre of one bubble; option 0 = A.
export function bubbleCenter(item: number, option: number, columns: number = LEGACY_COLUMNS): Point {
  const o = itemRowOrigin(item, columns);
  return { x: o.x + FIRST_BUBBLE_DX + option * BUBBLE_PITCH, y: o.y };
}

// QR payloads. A student sheet ties the paper to one exam and one student;
// the teacher's answer-key sheet ties it to the exam only. Blank sheets (no
// names) have no QR; the teacher picks the student after scanning.
const QR_PREFIX = "GAINS-OMR";
const KEY_QR_PREFIX = "GAINS-OMR-KEY";

export function sheetQrValue(majorExamId: string, studentCode: string): string {
  return `${QR_PREFIX}|${majorExamId}|${studentCode}`;
}

export function answerKeyQrValue(majorExamId: string): string {
  return `${KEY_QR_PREFIX}|${majorExamId}`;
}

export type SheetQr =
  { kind: "student"; majorExamId: string; studentCode: string } | { kind: "key"; majorExamId: string };

export function parseSheetQr(text: string): SheetQr | null {
  const [prefix, majorExamId, studentCode] = text.split("|");
  if (prefix === KEY_QR_PREFIX && majorExamId) return { kind: "key", majorExamId };
  if (prefix !== QR_PREFIX || !majorExamId || !studentCode) return null;
  return { kind: "student", majorExamId, studentCode };
}

// Bubbles printed per item: A-D, or A-E when the key uses E.
export function sheetOptionCount(answerKey: string | null | undefined): 4 | 5 {
  return answerKey?.includes("E") ? 5 : 4;
}

const PERIOD_TITLE = {
  prelim: "Prelim",
  midterm: "Midterm",
  finals: "Final",
} as const;

// "Midterm written exam" -- printed on the sheet and shown on the scanner.
export function majorExamLabel(period: keyof typeof PERIOD_TITLE, kind: "written" | "laboratory"): string {
  return `${PERIOD_TITLE[period]} ${kind === "written" ? "written" : "laboratory"} exam`;
}

// Converts between the key text box ("ABDCA BCD", 1-5 also accepted) and
// one-letter-per-item arrays for the bubbles.
export function keyTextToLetters(text: string, itemCount: number): string[] {
  const letters: string[] = [];
  for (const ch of text.toUpperCase().replace(/[\s,;]+/g, "")) {
    if (letters.length >= itemCount) break;
    if ((SHEET_OPTIONS as readonly string[]).includes(ch)) letters.push(ch);
    else if (/^[1-5]$/.test(ch)) letters.push(SHEET_OPTIONS[Number(ch) - 1]);
    else letters.push("");
  }
  while (letters.length < itemCount) letters.push("");
  return letters;
}

// Unset items become "-" so later answers keep their positions; trailing
// unset items are dropped.
export function lettersToKeyText(letters: string[]): string {
  const raw = letters
    .map((l) => l || "-")
    .join("")
    .replace(/-+$/, "");
  return raw.match(/.{1,5}/g)?.join(" ") ?? "";
}
