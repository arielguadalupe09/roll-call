import { describe, expect, it } from "vitest";
import { matchScoresToRoster } from "./score-import";
import { extractJsonObject, matrixToCsv, normalizeScoreCell, parseSheetReading, pickColumn, rowsForColumn, type SheetReading } from "./score-ai-read";

describe("normalizeScoreCell", () => {
  it("keeps plain numbers and strips totals and units", () => {
    expect(normalizeScoreCell("15")).toEqual({ score: "15", note: null });
    expect(normalizeScoreCell("15/20")).toEqual({ score: "15", note: null });
    expect(normalizeScoreCell("15 / 20")).toEqual({ score: "15", note: null });
    expect(normalizeScoreCell("7.50")).toEqual({ score: "7.5", note: null });
    expect(normalizeScoreCell("7,5")).toEqual({ score: "7.5", note: null });
    expect(normalizeScoreCell("12 pts")).toEqual({ score: "12", note: null });
  });
  it("leaves blank and no-score marks empty, noting the marks", () => {
    expect(normalizeScoreCell("")).toEqual({ score: "", note: null });
    expect(normalizeScoreCell("AB")).toEqual({ score: "", note: 'marked "AB"' });
    expect(normalizeScoreCell("inc")).toEqual({ score: "", note: 'marked "inc"' });
    expect(normalizeScoreCell("-")).toEqual({ score: "", note: 'marked "-"' });
  });
  it("never guesses at unreadable values", () => {
    expect(normalizeScoreCell("1S")).toEqual({ score: "", note: 'unreadable value "1S"' });
    expect(normalizeScoreCell("15?")).toEqual({ score: "", note: 'unreadable value "15?"' });
  });
});

describe("parseSheetReading", () => {
  it("validates shape, drops nameless rows and aligns cells to columns", () => {
    const r = parseSheetReading({
      readable: true,
      problem: "",
      columns: [{ header: " Quiz 1 ", max_score: 20 }, { header: "Quiz 2", max_score: -5 }],
      rows: [
        { name: "  Reyes,   Ana  ", cells: [{ value: "18", uncertain: false }] },
        { name: "", cells: [{ value: "1", uncertain: false }, { value: "2", uncertain: false }] },
        { name: "Cruz, Ben", cells: "nope" },
      ],
    });
    expect(r.readable).toBe(true);
    expect(r.columns).toEqual([{ header: "Quiz 1", maxScore: 20 }, { header: "Quiz 2", maxScore: null }]);
    expect(r.rows).toEqual([
      { name: "Reyes, Ana", cells: [{ value: "18", uncertain: false }, { value: "", uncertain: false }] },
      { name: "Cruz, Ben", cells: [{ value: "", uncertain: false }, { value: "", uncertain: false }] },
    ]);
  });
  it("treats garbage or empty answers as unreadable", () => {
    expect(parseSheetReading(null).readable).toBe(false);
    expect(parseSheetReading({ readable: true, columns: [], rows: [] }).readable).toBe(false);
    expect(parseSheetReading({ readable: false, problem: "Blurry", columns: [], rows: [] })).toMatchObject({ readable: false, problem: "Blurry" });
  });
});

describe("pickColumn", () => {
  const cols = (...h: string[]) => h.map((header) => ({ header, maxScore: null }));
  it("uses the only column", () => {
    expect(pickColumn(cols("Score"), "Quiz 3")).toBe(0);
  });
  it("matches number and abbreviations", () => {
    expect(pickColumn(cols("Q1", "Q2", "Q3", "Q4"), "Quiz 3")).toBe(2);
    expect(pickColumn(cols("Lab 1", "Lab 2"), "Laboratory 2")).toBe(1);
    expect(pickColumn(cols("Quiz 1", "Quiz 2", "Seatwork 1"), "Seatwork 1")).toBe(2);
  });
  it("refuses to guess when numbers disagree or nothing matches", () => {
    expect(pickColumn(cols("Q1", "Q2"), "Quiz 5")).toBe(-1);
    expect(pickColumn(cols("Prelim", "Midterm"), "Recitation")).toBe(-1);
  });
});

describe("rowsForColumn + roster matching (end to end, no model)", () => {
  const reading: SheetReading = {
    readable: true,
    problem: "",
    columns: [{ header: "Q1", maxScore: 20 }, { header: "Q2", maxScore: 20 }],
    rows: [
      { name: "DELA CRUZ, JUAN S.", cells: [{ value: "18", uncertain: false }, { value: "15/20", uncertain: true }] },
      { name: "Reyes, Ana", cells: [{ value: "AB", uncertain: false }, { value: "19", uncertain: false }] },
      { name: "Unknown, Person", cells: [{ value: "10", uncertain: false }, { value: "11", uncertain: false }] },
    ],
  };
  const roster = [
    { id: "s1", name: "Dela Cruz, Juan S." },
    { id: "s2", name: "Reyes, Ana M." },
    { id: "s3", name: "Santos, Lea" },
  ];

  it("produces rows the existing matcher understands, with uncertainty and notes", () => {
    const q2 = rowsForColumn(reading, 1);
    expect(q2.rows).toEqual([
      { name: "DELA CRUZ, JUAN S.", score: "15" },
      { name: "Reyes, Ana", score: "19" },
      { name: "Unknown, Person", score: "11" },
    ]);
    expect([...q2.uncertain]).toEqual(["DELA CRUZ, JUAN S."]);

    const m = matchScoresToRoster(q2.rows, roster);
    expect(m.matches.map((x) => [x.studentId, x.score])).toEqual([["s1", "15"], ["s2", "19"]]);
    expect(m.unmatched.map((x) => x.name)).toEqual(["Unknown, Person"]);
    expect(m.missingFromFile).toEqual(["Santos, Lea"]);
  });

  it("keeps absences blank and explains why", () => {
    const q1 = rowsForColumn(reading, 0);
    expect(q1.rows[1]).toEqual({ name: "Reyes, Ana", score: "" });
    expect(q1.notes).toEqual(['Reyes, Ana: marked "AB"']);
  });
});

describe("matrixToCsv", () => {
  it("quotes commas, trims, and skips empty rows", () => {
    expect(matrixToCsv([["Name", "Q1"], ["Reyes, Ana", 18], ["", ""], [" Cruz ", null]])).toBe('Name,Q1\n"Reyes, Ana",18\nCruz,');
  });
  it("bounds the size sent to the model", () => {
    const big = Array.from({ length: 1000 }, (_, i) => [String(i)]);
    expect(matrixToCsv(big, 5).split("\n")).toHaveLength(5);
  });
});

describe("extractJsonObject", () => {
  it("reads plain JSON and JSON wrapped in reasoning or code fences", () => {
    expect(extractJsonObject('{"readable":true}')).toEqual({ readable: true });
    expect(extractJsonObject('<think>Rows: {maybe}</think>\n```json\n{"readable":false,"problem":"blurry"}\n```')).toEqual({ readable: false, problem: "blurry" });
  });
  it("throws when there is no object", () => {
    expect(() => extractJsonObject("Sorry, I can't read this.")).toThrow();
  });
});
