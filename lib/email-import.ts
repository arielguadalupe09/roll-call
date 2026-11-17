import { normalizeEmail } from "./email";

// Bulk "add emails" import: matches rows from an Excel sheet or a Word file
// (tables or plain lines like "Abdon, Sabrina Krista R. - sabrina@x.com")
// to the class's students. Each row needs an email plus either the student's
// code or their name, in any layout: one "Lastname, Firstname M.I." cell,
// split Last/First/Middle columns, or "Firstname Lastname" order. Names are
// compared as sets of words, ignoring case, punctuation, accents and middle
// initials, so a student matches a row when every word of their name is in it.

export type EmailImportStudent = { id: string; name: string; code: string };

export type EmailImportResult = {
  matches: { studentId: string; studentName: string; email: string }[];
  // Rows with an email that didn't resolve to exactly one student.
  unmatched: string[];
  // Rows whose email-looking text isn't a valid address.
  invalid: string[];
};

const EMAIL_IN_TEXT = /[^\s@<>()[\]{},;:"']+@[^\s@<>()[\]{},;:"']+\.[^\s@<>()[\]{},;:"'.]+/;

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    // Single letters are middle initials; they vary too much to match on.
    .filter((w) => w.length > 1);
}

function cellText(cell: unknown): string {
  return cell == null ? "" : String(cell).trim();
}

export function matchEmailRows(rows: unknown[][], students: EmailImportStudent[]): EmailImportResult {
  const byCode = new Map(students.map((s) => [s.code.toUpperCase(), s]));
  const nameWords = students.map((s) => ({ student: s, words: words(s.name) }));
  const result: EmailImportResult = { matches: [], unmatched: [], invalid: [] };
  const taken = new Set<string>();

  for (const row of rows) {
    const cells = row.map(cellText).filter(Boolean);
    const line = cells.join(" ");
    const found = line.match(EMAIL_IN_TEXT);
    if (!found) continue; // header rows, letterheads, students without an email
    const email = normalizeEmail(found[0].replace(/^mailto:/i, ""));
    if (!email) {
      result.invalid.push(line);
      continue;
    }

    const rest = line.replace(found[0], " ");
    let student: EmailImportStudent | undefined;
    for (const token of rest.split(/[^A-Za-z0-9]+/)) {
      student = byCode.get(token.toUpperCase());
      if (student) break;
    }
    if (!student) {
      const rowWords = new Set(words(rest));
      const hits = nameWords
        .filter((n) => n.words.length > 0 && n.words.every((w) => rowWords.has(w)))
        .sort((a, b) => b.words.length - a.words.length);
      // The most specific name wins ("Cruz, Juan" vs "Dela Cruz, Juan");
      // a tie means the row can't tell two students apart.
      if (hits.length === 1 || (hits.length > 1 && hits[0].words.length > hits[1].words.length)) {
        student = hits[0].student;
      }
    }

    if (!student || taken.has(student.id)) {
      result.unmatched.push(line);
      continue;
    }
    taken.add(student.id);
    result.matches.push({ studentId: student.id, studentName: student.name, email });
  }
  return result;
}

// Rows from a Word document's HTML (as produced by mammoth): each table row
// is a row of cells, and every other paragraph or list item is a one-cell row.
export function rowsFromHtml(html: string, parse: (html: string) => Document): string[][] {
  const doc = parse(html);
  const rows: string[][] = [];
  doc.querySelectorAll("tr").forEach((tr) => {
    rows.push(Array.from(tr.querySelectorAll("td, th")).map((c) => c.textContent ?? ""));
  });
  doc.querySelectorAll("p, li").forEach((el) => {
    if (!el.closest("table")) rows.push([el.textContent ?? ""]);
  });
  return rows;
}
