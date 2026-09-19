import { describe, expect, it } from "vitest";
import { extractScoreRows, htmlToScoreMatrix, matchScoresToRoster } from "./score-import";

describe("extractScoreRows", () => {
  it("reads a full-name column and a Score column, skipping a letterhead and summary rows", () => {
    const rows = extractScoreRows([
      ["Pampanga State University", "", ""],
      ["Quiz 1 - CC 313", "", ""],
      ["No.", "Student Name", "Score"],
      [1, "Cruz, Juan D.", 8],
      [2, "Reyes, Ana", 10],
      ["", "Average", 9],
    ]);
    expect(rows).toEqual([
      { name: "Cruz, Juan D.", score: "8" },
      { name: "Reyes, Ana", score: "10" },
    ]);
  });

  it("builds names from separate Last / First / Middle columns", () => {
    const rows = extractScoreRows([
      ["Last Name", "First Name", "Middle Name", "Raw Score"],
      ["Abdon", "Sabrina Krista", "Rivera", 45],
    ]);
    expect(rows).toEqual([{ name: "Abdon, Sabrina Krista R.", score: "45" }]);
  });

  it("falls back to the most numeric column when no header names the score", () => {
    const rows = extractScoreRows([
      ["Name", "Section", "Q1"],
      ["Cruz, Juan", "IT3B", 8],
      ["Reyes, Ana", "IT3B", 7],
    ]);
    expect(rows.map((r) => r.score)).toEqual(["8", "7"]);
  });

  it("reads headerless name + score columns, ignoring a counter column", () => {
    const rows = extractScoreRows([
      [1, "Cruz, Juan", 8],
      [2, "Reyes, Ana", 9],
    ]);
    expect(rows).toEqual([
      { name: "Cruz, Juan", score: "8" },
      { name: "Reyes, Ana", score: "9" },
    ]);
  });

  it("reads Word-style one-cell 'Name  score' lines", () => {
    const rows = extractScoreRows([["Cruz, Juan D. 8"], ["Reyes, Ana - 9.5"], ["Some heading"]]);
    expect(rows).toEqual([
      { name: "Cruz, Juan D.", score: "8" },
      { name: "Reyes, Ana", score: "9.5" },
    ]);
  });

  it("keeps a blank score so it can be reported as not filled", () => {
    const rows = extractScoreRows([
      ["Name", "Score"],
      ["Cruz, Juan", ""],
    ]);
    expect(rows).toEqual([{ name: "Cruz, Juan", score: "" }]);
  });
});

const roster = [
  { id: "a", name: "Abdon, Sabrina Krista R." },
  { id: "b", name: "Cruz, Maria Anne L." },
  { id: "c", name: "Cruz, Maria Lea P." },
  { id: "d", name: "Reyes, Ana" },
];

describe("matchScoresToRoster", () => {
  it("matches exactly, ignoring case and punctuation", () => {
    const r = matchScoresToRoster([{ name: "REYES, ANA", score: "9" }], roster);
    expect(r.matches).toEqual([
      { studentId: "d", studentName: "Reyes, Ana", fileName: "REYES, ANA", score: "9", loose: false },
    ]);
  });

  it("matches on surname + first name when the middle name differs, flagged as loose", () => {
    const r = matchScoresToRoster([{ name: "Abdon, Sabrina K.", score: "45" }], roster);
    expect(r.matches[0]).toMatchObject({ studentId: "a", loose: true });
  });

  it("refuses a loose match that fits two students", () => {
    const r = matchScoresToRoster([{ name: "Cruz, Maria", score: "8" }], roster);
    expect(r.matches).toEqual([]);
    expect(r.ambiguous).toHaveLength(1);
  });

  it("reports unknown names and roster students missing from the file", () => {
    const r = matchScoresToRoster([{ name: "Nobody, Test", score: "5" }], roster);
    expect(r.unmatched).toEqual([{ name: "Nobody, Test", score: "5" }]);
    expect(r.missingFromFile).toHaveLength(4);
  });

  it("does not pick a side when the file lists one student twice with different scores", () => {
    const r = matchScoresToRoster(
      [
        { name: "Reyes, Ana", score: "9" },
        { name: "Reyes, Ana", score: "6" },
      ],
      roster,
    );
    expect(r.matches).toEqual([]);
    expect(r.ambiguous.length).toBeGreaterThan(0);
  });
});

describe("htmlToScoreMatrix", () => {
  it("turns table rows into cells", () => {
    const html = "<table><tr><td><p>Name</p></td><td><p>Score</p></td></tr><tr><td>Cruz&nbsp;Juan</td><td>8</td></tr></table>";
    expect(htmlToScoreMatrix(html)).toEqual([["Name", "Score"], ["Cruz Juan", "8"]]);
  });
  it("falls back to paragraphs when there is no table", () => {
    expect(htmlToScoreMatrix("<p>Cruz, Juan 8</p><p></p><p>Reyes, Ana 9</p>")).toEqual([["Cruz, Juan 8"], ["Reyes, Ana 9"]]);
  });
});

describe("real .xlsx round trip", () => {
  it("reads a generated workbook through xlsx, extracts and matches", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Pampanga State University"],
      [],
      ["Last Name", "First Name", "M.I.", "Quiz 1"],
      ["Abdon", "Sabrina Krista", "R", 42],
      ["Reyes", "Ana", "", 50],
      ["Ghost", "Student", "", 10],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const read = XLSX.read(bytes, { type: "array" });
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[read.SheetNames[0]], { header: 1, defval: "" });

    const result = matchScoresToRoster(extractScoreRows(matrix), roster);
    expect(result.matches.map((m) => [m.studentId, m.score])).toEqual([
      ["a", "42"],
      ["d", "50"],
    ]);
    expect(result.unmatched.map((r) => r.name)).toEqual(["Ghost, Student"]);
  });
});
