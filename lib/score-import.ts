import {
  FIRST_NAME_HEADERS,
  FULL_NAME_HEADERS,
  LAST_NAME_HEADERS,
  MIDDLE_NAME_HEADERS,
  normalizeHeader,
  nameKey,
  parseStudentName,
  toLastNameFirst,
} from "./name-format";

export type ScoreFileRow = { name: string; score: string };

const HEADER_SEARCH_ROWS = 20;
const str = (v: unknown) => String(v ?? "").trim();
const isNumeric = (s: string) => /^\d+(\.\d+)?$/.test(s);

// Class-summary rows that sit under the real students ("Total", "Average"...).
const SUMMARY_ROW = /^(total|average|mean|highest|lowest|passing|passed|failed|items?|max|maximum|perfect|number of|no\.? of)\b/i;

// Header words that mean "this column holds the score", best guess first.
const SCORE_KEYWORDS = ["rawscore", "score", "points", "pts", "total", "mark", "grade", "quiz", "exam", "result"];

function isNameHeader(key: string): boolean {
  return (
    key !== "" &&
    (LAST_NAME_HEADERS.has(key) ||
      FIRST_NAME_HEADERS.has(key) ||
      FULL_NAME_HEADERS.has(key) ||
      MIDDLE_NAME_HEADERS.has(key))
  );
}

// The column with the most numeric cells (rightmost on a tie, so a leading
// "No." counter column loses to the real score column).
function mostNumericColumn(rows: string[][], exclude: Set<number>): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = -1;
  let bestCount = 0;
  for (let c = 0; c < width; c++) {
    if (exclude.has(c)) continue;
    const count = rows.filter((r) => isNumeric(r[c] ?? "")).length;
    if (count > 0 && count >= bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

function joinName(last: string, first: string, middle: string): string {
  if (!last && !first) return "";
  const hasMiddle = middle !== "" && normalizeHeader(middle) !== "na";
  const given = hasMiddle ? `${first} ${middle[0].toUpperCase()}.`.trim() : first;
  return toLastNameFirst([last, given].filter(Boolean).join(", "));
}

// Reads (student name, score) pairs out of a spreadsheet/table matrix.
// Handles a letterhead above the real header, separate Last/First/Middle
// columns or one full-name column, a headerless name+score layout, and Word
// files that are plain "Name  score" lines rather than tables. Purely
// rule-based: nothing is guessed by a model, and every value it returns is
// shown to the teacher to verify before anything is saved.
export function extractScoreRows(matrix: unknown[][]): ScoreFileRow[] {
  const rows = matrix.map((r) => r.map(str));
  const searchLimit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  let headerIdx = -1;
  for (let i = 0; i < searchLimit; i++) {
    if (rows[i].some((cell) => isNameHeader(normalizeHeader(cell)))) {
      headerIdx = i;
      break;
    }
  }

  const out: ScoreFileRow[] = [];
  const keep = (name: string, score: string) => {
    if (!name || SUMMARY_ROW.test(name)) return;
    out.push({ name, score });
  };

  if (headerIdx !== -1) {
    const cols = rows[headerIdx].map(normalizeHeader);
    const data = rows.slice(headerIdx + 1).filter((r) => r.some(Boolean));
    const lastIdx = cols.findIndex((c) => LAST_NAME_HEADERS.has(c));
    const firstIdx = cols.findIndex((c) => FIRST_NAME_HEADERS.has(c));
    const middleIdx = cols.findIndex((c) => MIDDLE_NAME_HEADERS.has(c));
    const fullIdx = cols.findIndex((c) => FULL_NAME_HEADERS.has(c));
    const nameCols = new Set([lastIdx, firstIdx, middleIdx, fullIdx].filter((i) => i >= 0));

    let scoreIdx = -1;
    for (const kw of SCORE_KEYWORDS) {
      scoreIdx = cols.findIndex((c, i) => !nameCols.has(i) && c !== "" && (c === kw || c.includes(kw)));
      if (scoreIdx !== -1) break;
    }
    if (scoreIdx === -1) scoreIdx = mostNumericColumn(data, nameCols);
    if (scoreIdx === -1) return [];

    for (const r of data) {
      const name =
        lastIdx >= 0 && firstIdx >= 0
          ? joinName(r[lastIdx] ?? "", r[firstIdx] ?? "", middleIdx >= 0 ? (r[middleIdx] ?? "") : "")
          : fullIdx >= 0
            ? toLastNameFirst(r[fullIdx] ?? "")
            : "";
      keep(name, r[scoreIdx] ?? "");
    }
    return out;
  }

  // No header row: tabular rows (2+ filled cells) use the most numeric column
  // as the score; one-cell rows (Word paragraphs) are read as "Name  score".
  const tabular = rows.filter((r) => r.filter(Boolean).length >= 2);
  const scoreIdx = tabular.length > 0 ? mostNumericColumn(tabular, new Set()) : -1;
  for (const r of rows) {
    const filled = r.filter(Boolean);
    if (filled.length === 0) continue;
    if (filled.length >= 2 && scoreIdx >= 0) {
      const nameCells = r.slice(0, scoreIdx).filter((c) => c && !isNumeric(c));
      if (nameCells.length === 0) continue;
      const name =
        nameCells.length >= 2
          ? joinName(nameCells[0], nameCells[1], nameCells[2] ?? "")
          : toLastNameFirst(nameCells[0]);
      keep(name, r[scoreIdx] ?? "");
    } else if (filled.length === 1) {
      const m = filled[0].match(/^(.+?)[\s:–—-]+(\d+(?:\.\d+)?)$/);
      if (m) keep(toLastNameFirst(m[1].trim()), m[2]);
    }
  }
  return out;
}

export type ScoreMatch = {
  studentId: string;
  studentName: string;
  fileName: string;
  score: string;
  loose: boolean;
};

export type ScoreMatchResult = {
  matches: ScoreMatch[];
  // File rows with no matching student.
  unmatched: ScoreFileRow[];
  // File rows that matched more than one student, or that conflict with
  // another row for the same student -- left for the teacher to enter by hand.
  ambiguous: ScoreFileRow[];
  // Roster students the file had no score for.
  missingFromFile: string[];
};

// "Abdon, Sabrina Krista R." -> "abdon|sabrina": surname + first given word,
// so a middle name/initial that differs between the file and the roster
// doesn't stop a match.
function looseKey(name: string): string {
  const { lastName, firstName } = parseStudentName(name);
  return `${nameKey(lastName)}|${nameKey(firstName.split(/\s+/)[0] ?? "")}`;
}

export function matchScoresToRoster(
  fileRows: ScoreFileRow[],
  students: { id: string; name: string }[],
): ScoreMatchResult {
  const exact = new Map<string, string[]>();
  const loose = new Map<string, string[]>();
  for (const s of students) {
    exact.set(nameKey(s.name), [...(exact.get(nameKey(s.name)) ?? []), s.id]);
    loose.set(looseKey(s.name), [...(loose.get(looseKey(s.name)) ?? []), s.id]);
  }
  const byId = new Map(students.map((s) => [s.id, s]));

  const matches = new Map<string, ScoreMatch>();
  const unmatched: ScoreFileRow[] = [];
  const ambiguous: ScoreFileRow[] = [];
  const conflicted = new Set<string>();

  for (const row of fileRows) {
    const rosterName = toLastNameFirst(row.name);
    let ids = exact.get(nameKey(rosterName)) ?? [];
    let isLoose = false;
    if (ids.length === 0) {
      ids = loose.get(looseKey(rosterName)) ?? [];
      isLoose = true;
    }
    if (ids.length === 0) {
      unmatched.push(row);
      continue;
    }
    if (ids.length > 1) {
      ambiguous.push(row);
      continue;
    }
    const id = ids[0];
    const prev = matches.get(id);
    if (prev && prev.score !== row.score) {
      // Two rows for one student with different scores: don't pick one.
      conflicted.add(id);
      ambiguous.push(row);
      continue;
    }
    matches.set(id, {
      studentId: id,
      studentName: byId.get(id)!.name,
      fileName: row.name,
      score: row.score,
      loose: isLoose,
    });
  }

  for (const id of conflicted) {
    const prev = matches.get(id);
    if (prev) ambiguous.push({ name: prev.fileName, score: prev.score });
    matches.delete(id);
  }

  const seen = new Set(matches.keys());
  const missingFromFile = students.filter((s) => !seen.has(s.id)).map((s) => s.name);
  return { matches: [...matches.values()], unmatched, ambiguous, missingFromFile };
}

// Turns mammoth's HTML for a .docx into the same matrix shape a spreadsheet
// gives: table rows become rows of cells; if the document has no table, each
// paragraph becomes a one-cell row for the "Name  score" line reader.
export function htmlToScoreMatrix(html: string): string[][] {
  const clean = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

  const tableRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (tableRows.length > 0) {
    return tableRows.map((tr) =>
      [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => clean(cell[1])),
    );
  }
  return [...html.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((p) => [clean(p[2])])
    .filter((r) => r[0] !== "");
}
