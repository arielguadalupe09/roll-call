import jsQR from "jsqr";
import { downscale, findSheetCorners, readSheet, rgbaToGray } from "./omr-scan";
import { MAX_SHEET_ITEMS, parseSheetQr } from "./omr-sheet";

// Reads an answer key from a photo or scan of a shaded GAINS bubble sheet
// (normally the teacher's printed answer-key sheet), using the same reader as
// the phone scanner. Runs in the browser; RGBA pixels in, letters out.

export type AnswerKeyPhoto = {
  // One entry per item (index 0 = item 1); "" = not clearly shaded.
  letters: string[];
  // Items with two or more shaded bubbles (left blank).
  multiple: number[];
  // Items with nothing shaded (left blank). Trailing blanks are dropped when
  // the item count wasn't known.
  blank: number[];
  // Something the teacher should know about the QR code, or null.
  warning: string | null;
};

export class AnswerKeyPhotoError extends Error {}

// itemCount: the exam's item count, or 0 when it isn't set yet (then every
// row of the sheet is read and the key ends at the last shaded item).
export function readAnswerKeyPhoto(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  itemCount: number,
  examId: string,
): AnswerKeyPhoto {
  const gray = rgbaToGray(rgba, width, height);
  const { gray: small, scale } = downscale(gray, 800);
  const found = findSheetCorners(small);
  if (!found) {
    throw new AnswerKeyPhotoError(
      "Couldn't find the 4 black corner squares. Use a photo or scan of a GAINS answer sheet with the whole sheet in view.",
    );
  }
  const rows = itemCount > 0 ? Math.min(itemCount, MAX_SHEET_ITEMS) : MAX_SHEET_ITEMS;
  const read = readSheet(
    gray,
    found.map((c) => ({ x: c.x / scale, y: c.y / scale })),
    rows,
  );
  if (!read) {
    throw new AnswerKeyPhotoError("Couldn't tell which way up the sheet is. Keep the top bar and all 4 corners in view.");
  }

  let marks = read.marks;
  if (itemCount <= 0) {
    const last = marks.findLastIndex((m) => m.status !== "blank");
    if (last < 0) throw new AnswerKeyPhotoError("No shaded bubbles found on that sheet.");
    marks = marks.slice(0, last + 1);
  }

  let warning: string | null = null;
  const qr = jsQR(rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba), width, height, {
    inversionAttempts: "dontInvert",
  });
  const parsed = qr ? parseSheetQr(qr.data) : null;
  if (parsed && parsed.majorExamId !== examId) {
    warning = "This sheet was printed for a different exam. Check the answers before saving.";
  } else if (parsed?.kind === "student") {
    warning = "This is a student's answer sheet, not the answer-key sheet. Its answers were used as the key.";
  }
  if (itemCount > MAX_SHEET_ITEMS) {
    warning = [warning, `A bubble sheet holds ${MAX_SHEET_ITEMS} items, so only items 1-${MAX_SHEET_ITEMS} were read.`]
      .filter(Boolean)
      .join(" ");
  }

  return {
    letters: marks.map((m) => (m.status === "ok" ? m.answer : "")),
    multiple: marks.filter((m) => m.status === "multiple").map((m) => m.item),
    blank: marks.filter((m) => m.status === "blank").map((m) => m.item),
    warning,
  };
}
