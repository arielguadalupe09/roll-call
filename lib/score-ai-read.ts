// Encoding bot, pure part (client- and server-safe, unit-tested in
// score-ai-read.test.ts). The model only *transcribes* a score sheet -- names as
// written plus each score column. Matching names to the roster stays in code
// (matchScoresToRoster), and nothing is saved: scores land in the table as
// unsaved edits, exactly like the Excel import, until the teacher clicks Save all.
import type { ScoreFileRow } from "./score-import";

/** JSON schema the model's answer must follow (enforced on Claude; in the prompt for Groq). */
export const SHEET_READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "problem", "columns", "rows"],
  properties: {
    readable: { type: "boolean", description: "false if this is not a score sheet or cannot be read at all" },
    problem: { type: "string", description: "why it is unreadable, or an empty string" },
    columns: {
      type: "array",
      description: "Score columns in left-to-right order (not the name, number or ID columns).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["header", "max_score"],
        properties: {
          header: { type: "string", description: 'Column heading as written, e.g. "Quiz 3" or "Q1". Empty string if none.' },
          max_score: {
            type: ["number", "null"],
            description: "Highest possible score if the sheet states it (e.g. a /20 or 'perfect score' row), else null.",
          },
        },
      },
    },
    rows: {
      type: "array",
      description: "One entry per student row, top to bottom.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "cells"],
        properties: {
          name: { type: "string", description: "Student name exactly as written (keep surname/given-name order)." },
          cells: {
            type: "array",
            description: "One cell per column, same order and count as `columns`.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["value", "uncertain"],
              properties: {
                value: { type: "string", description: "Cell content as written; empty string if blank." },
                uncertain: { type: "boolean", description: "true if the handwriting or print is hard to read" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type SheetCell = { value: string; uncertain: boolean };
export type SheetColumn = { header: string; maxScore: number | null };
export type SheetReading = {
  readable: boolean;
  problem: string;
  columns: SheetColumn[];
  rows: { name: string; cells: SheetCell[] }[];
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate the model's JSON defensively (never trust model output shape):
 * drops nameless rows, pads/truncates cells to the column count, caps sizes.
 */
export function parseSheetReading(raw: unknown): SheetReading {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const columns: SheetColumn[] = (Array.isArray(o.columns) ? o.columns : []).slice(0, 60).map((c) => {
    const col = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const max = typeof col.max_score === "number" && Number.isFinite(col.max_score) && col.max_score > 0 ? col.max_score : null;
    return { header: str(col.header).slice(0, 80), maxScore: max };
  });
  const rows = (Array.isArray(o.rows) ? o.rows : [])
    .slice(0, 500)
    .map((r) => {
      const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const cellsIn = Array.isArray(row.cells) ? row.cells : [];
      const cells: SheetCell[] = columns.map((_, i) => {
        const c = (cellsIn[i] && typeof cellsIn[i] === "object" ? cellsIn[i] : {}) as Record<string, unknown>;
        return { value: str(c.value).slice(0, 40), uncertain: c.uncertain === true };
      });
      return { name: str(row.name).replace(/\s+/g, " ").slice(0, 120), cells };
    })
    .filter((r) => r.name !== "");
  return {
    readable: o.readable !== false && rows.length > 0 && columns.length > 0,
    problem: str(o.problem).slice(0, 300),
    columns,
    rows,
  };
}

// Marks that mean "no score to encode" (absent, excused, incomplete, dash...).
const NO_SCORE = /^(-+|—|–|ab|abs|absent|a|ex|exc|excused|inc|incomplete|n\/?a|x|none|dropped|drp)$/i;

/**
 * A transcribed cell -> the value to type in the score box.
 * "15/20" -> "15", "15 pts" -> "15", "15.50" -> "15.5", "AB" -> "" (with a note).
 */
export function normalizeScoreCell(value: string): { score: string; note: string | null } {
  const v = value.trim().replace(/,/g, ".");
  if (v === "") return { score: "", note: null };
  if (NO_SCORE.test(v)) return { score: "", note: `marked "${value.trim()}"` };
  const m = /^(\d+(?:\.\d+)?)\s*(?:\/\s*\d+(?:\.\d+)?)?\s*(?:pts?|points?)?\.?$/i.exec(v);
  if (!m) return { score: "", note: `unreadable value "${value.trim()}"` };
  return { score: String(Number(m[1])), note: null };
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const ABBREV: Record<string, string> = { q: "quiz", qz: "quiz", lab: "laboratory", ex: "exam", rec: "recitation", sw: "seatwork", act: "activity" };

/**
 * Which column best matches the assessment being encoded ("Quiz 3" vs a sheet
 * with Q1..Q5). Number tokens must agree; returns -1 when nothing fits, 0 for
 * a single-column sheet.
 */
export function pickColumn(columns: SheetColumn[], assessmentTitle: string): number {
  if (columns.length === 1) return 0;
  const target = words(assessmentTitle).map((w) => ABBREV[w] ?? w);
  const targetNums = target.filter((w) => /^\d+$/.test(w));
  let best = -1;
  let bestScore = 0;
  columns.forEach((c, i) => {
    const ws = words(c.header).map((w) => ABBREV[w] ?? w);
    const nums = ws.filter((w) => /^\d+$/.test(w));
    if (targetNums.length && nums.length && !targetNums.some((n) => nums.includes(n))) return;
    const overlap = ws.filter((w) => target.includes(w)).length;
    if (overlap > bestScore) {
      best = i;
      bestScore = overlap;
    }
  });
  return best;
}

export type ColumnRows = {
  rows: ScoreFileRow[];
  /** Names whose cell the model flagged as hard to read. */
  uncertain: Set<string>;
  /** "Reyes, Ana: marked AB" style notes for cells left blank on purpose. */
  notes: string[];
};

/** The rows of one column, in the shape matchScoresToRoster expects. */
export function rowsForColumn(reading: SheetReading, col: number): ColumnRows {
  const rows: ScoreFileRow[] = [];
  const uncertain = new Set<string>();
  const notes: string[] = [];
  for (const r of reading.rows) {
    const cell = r.cells[col];
    if (!cell) continue;
    const { score, note } = normalizeScoreCell(cell.value);
    rows.push({ name: r.name, score });
    if (cell.uncertain && score !== "") uncertain.add(r.name);
    if (note) notes.push(`${r.name}: ${note}`);
  }
  return { rows, uncertain, notes };
}

/**
 * The JSON object in a model reply. Providers without schema-enforced output
 * (Groq JSON mode) may wrap it in <think> reasoning or ``` fences.
 */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** A spreadsheet matrix as compact CSV for the prompt (bounded size). */
export function matrixToCsv(matrix: unknown[][], maxRows = 400, maxCols = 40): string {
  const cell = (v: unknown) => {
    const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return matrix
    .slice(0, maxRows)
    .map((r) => (Array.isArray(r) ? r.slice(0, maxCols).map(cell).join(",") : ""))
    .filter((line) => line.replace(/,/g, "") !== "")
    .join("\n");
}
