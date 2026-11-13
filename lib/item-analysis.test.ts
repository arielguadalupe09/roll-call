import { describe, expect, it } from "vitest";
import {
  analyzeItems,
  difficultyLabel,
  discriminationLabel,
  formatAnswerString,
  formatItemList,
  itemAnalysisCsv,
  itemDecision,
  parseAnswerString,
  parseItemList,
  tallyAnswers,
} from "./item-analysis";

describe("parseItemList", () => {
  it("parses numbers and ranges, deduped and sorted", () => {
    expect(parseItemList("7, 3 12-14;3", 20)).toEqual({ items: [3, 7, 12, 13, 14] });
  });
  it("treats none/0/- as a perfect paper", () => {
    expect(parseItemList("none", 10)).toEqual({ items: [] });
    expect(parseItemList("0", 10)).toEqual({ items: [] });
    expect(parseItemList("-", 10)).toEqual({ items: [] });
  });
  it("rejects out-of-range, backwards and junk input", () => {
    expect(parseItemList("11", 10).error).toBeDefined();
    expect(parseItemList("5-3", 10).error).toBeDefined();
    expect(parseItemList("a", 10).error).toBeDefined();
  });
});

describe("formatItemList", () => {
  it("compresses runs into ranges", () => {
    expect(formatItemList([15, 3, 7, 12, 13, 14])).toBe("3, 7, 12-15");
    expect(formatItemList([])).toBe("");
  });
});

describe("labels and decisions", () => {
  it("labels difficulty", () => {
    expect(difficultyLabel(0.9)).toBe("Very easy");
    expect(difficultyLabel(0.5)).toBe("Average");
    expect(difficultyLabel(0.1)).toBe("Very difficult");
  });
  it("labels discrimination", () => {
    expect(discriminationLabel(0.45)).toBe("Very good");
    expect(discriminationLabel(0.25)).toBe("Fair");
    expect(discriminationLabel(-0.1)).toBe("Negative");
  });
  it("decides retain/revise/reject", () => {
    expect(itemDecision(0.5, 0.4)).toBe("Retain");
    expect(itemDecision(0.9, 0.3)).toBe("Revise");
    expect(itemDecision(0.5, 0.1)).toBe("Revise");
    expect(itemDecision(0.95, 0.05)).toBe("Reject");
    expect(itemDecision(0.5, -0.2)).toBe("Reject");
  });
});

describe("analyzeItems", () => {
  // 10 students, 4 items. Item 1: everyone right. Item 2: only the top half
  // right (discriminates). Item 3: only the bottom half right (negative).
  // Item 4: nobody right.
  const responses = Array.from({ length: 10 }, (_, i) => {
    const top = i < 5;
    const wrong = [4];
    if (!top) wrong.push(2);
    if (top) wrong.push(3);
    // Make the top half clearly outscore the bottom half.
    if (!top) wrong.push(1);
    return { studentId: `s${i}`, wrongItems: wrong };
  });
  const result = analyzeItems(4, responses, "Non-board program");

  it("uses 27% groups", () => {
    expect(result.studentCount).toBe(10);
    expect(result.groupSize).toBe(3);
  });

  it("computes difficulty and discrimination per item", () => {
    const [i1, i2, i3, i4] = result.items;
    expect(i1.difficulty).toBe(0.5);
    expect(i2.difficulty).toBe(0.5);
    expect(i2.discrimination).toBe(1);
    expect(i2.decision).toBe("Retain");
    expect(i3.discrimination).toBe(-1);
    expect(i3.decision).toBe("Reject");
    expect(i4.difficulty).toBe(0);
    expect(i4.decision).toBe("Reject");
  });

  it("flags failing students and least-learned items", () => {
    // Top half: 2/4 = 50% -> 75 (passing). Bottom half: 1/4 = 25% -> failing.
    const s0 = result.students.find((s) => s.studentId === "s0")!;
    const s9 = result.students.find((s) => s.studentId === "s9")!;
    expect(s0.struggling).toBe(false);
    expect(s0.group).toBe("upper");
    expect(s9.struggling).toBe(true);
    expect(s9.group).toBe("lower");
    expect(result.leastLearned).toEqual([4]);
  });

  it("lists easy items a student missed", () => {
    const easy = analyzeItems(
      2,
      [
        { studentId: "a", wrongItems: [] },
        { studentId: "b", wrongItems: [] },
        { studentId: "c", wrongItems: [] },
        { studentId: "d", wrongItems: [1, 2] },
      ],
      "Non-board program",
    );
    expect(easy.students.find((s) => s.studentId === "d")!.missedEasyItems).toEqual([1, 2]);
  });

  it("handles no students and a single student", () => {
    expect(analyzeItems(3, [], "Non-board program").items[0].difficulty).toBe(0);
    const one = analyzeItems(3, [{ studentId: "x", wrongItems: [2] }], "Non-board program");
    expect(one.groupSize).toBe(0);
    expect(one.items[1].discrimination).toBe(0);
  });
});

describe("answer-key mode", () => {
  // Key ABCD; 4 students.
  const key = "ABCD";
  const responses = [
    { studentId: "s1", wrongItems: [], answers: "ABCD" }, // 4
    { studentId: "s2", wrongItems: [], answers: "ABCA" }, // 3
    { studentId: "s3", wrongItems: [], answers: "AB-A" }, // 2
    { studentId: "s4", wrongItems: [], answers: "CCAA" }, // 0
  ];
  const a = analyzeItems(4, responses, "Non-board program", key);

  it("scores from the key, blanks counting as wrong", () => {
    expect(a.students.map((s) => s.score)).toEqual([4, 3, 2, 0]);
    expect(a.students[2].wrongItems).toEqual([3, 4]);
  });

  it("counts each option per item, flagging the key and distractors", () => {
    const item1 = a.items[0];
    expect(item1.key).toBe("A");
    const opt = Object.fromEntries(item1.options!.map((o) => [o.option, o]));
    expect(opt.A).toMatchObject({ count: 3, isKey: true, flag: null });
    expect(opt.C).toMatchObject({ count: 1, upper: 0, lower: 1, flag: null });
    expect(opt.B.flag).toBe("unused");
    expect(opt["-"].count).toBe(0);
    // Item 4: upper group (s1) chose D (key), lower (s4) chose A.
    const item4 = Object.fromEntries(a.items[3].options!.map((o) => [o.option, o]));
    expect(item4.A).toMatchObject({ count: 3, lower: 1, upper: 0, flag: null });
  });

  it("computes summary stats", () => {
    expect(a.summary).toMatchObject({ high: 4, low: 0, median: 2.5 });
    expect(a.summary.distribution).toEqual([1, 0, 1, 1, 1]);
    expect(a.summary.stdDev).toBeCloseTo(1.48, 2);
    expect(a.summary.kr20).not.toBeNull();
  });

  it("gives a positive point-biserial to an item the strong students got right", () => {
    expect(a.items[3].pointBiserial).toBeGreaterThan(0);
    // Item 2: everyone but s4 right -> still defined.
    expect(a.items[1].pointBiserial).toBeGreaterThan(0);
  });

  it("falls back to wrongItems without a key", () => {
    const b = analyzeItems(4, [{ studentId: "x", wrongItems: [2], answers: "AAAA" }], "Non-board program");
    expect(b.students[0].score).toBe(3);
    expect(b.items[0].options).toBeNull();
  });

  it("exports CSV with option columns", () => {
    const csv = itemAnalysisCsv(a).split("\n");
    expect(csv[0]).toBe(
      "Item,Key,Correct,Percent correct,Difficulty,Discrimination (27%),Point-biserial,Decision,A,B,C,D,Blank",
    );
    expect(csv[1].startsWith("1,A,3,75,")).toBe(true);
  });
});

describe("parseAnswerString", () => {
  it("accepts letters, numbers, blanks and spacing", () => {
    expect(parseAnswerString("ab c-d", 5)).toEqual({ answers: "ABC-D" });
    expect(parseAnswerString("1,2,3,4,5", 5)).toEqual({ answers: "ABCDE" });
    expect(formatAnswerString("ABCDEABCDEA")).toBe("ABCDE ABCDE A");
  });
  it("rejects wrong length, junk, and blanks in a key", () => {
    expect(parseAnswerString("ABC", 4).error).toMatch(/need 4/);
    expect(parseAnswerString("ABCZ", 4).error).toBeDefined();
    expect(parseAnswerString("AB-D", 4, { allowBlank: false }).error).toBeDefined();
  });
});

describe("tallyAnswers", () => {
  it("splits wrong answers into incorrect and blank", () => {
    expect(tallyAnswers("AB-DC", "ABCDE")).toEqual({ correct: 3, incorrect: 1, blank: 1 });
  });
});
