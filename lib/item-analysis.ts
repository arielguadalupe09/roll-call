// Item analysis for paper major exams (Gradebook -> Major Exam). Pure
// computation over the per-student "wrong items" lists stored in
// major_exam_item_responses -- no Supabase or React here, so it is unit
// tested in lib/item-analysis.test.ts.
//
// Two ways to check a paper (like ZipGrade):
//   - Answer key: the exam has a key ("ABCDA...") and each student's chosen
//     letters are recorded, which adds a per-option response distribution
//     (distractor analysis). wrong_items is still derived and stored.
//   - Wrong items only: the teacher types the item numbers a student missed.
//
// Method (the standard upper/lower 27% item analysis used in PH schools):
//   - Difficulty index p = students who got the item right / students checked.
//   - Discrimination index D = (right in upper group - right in lower group)
//     / group size, where the groups are the top and bottom 27% by score.
//   - Decision: Retain when p is 0.21-0.80 and D >= 0.20; Reject when D is
//     negative, or when D < 0.20 and p is outside 0.21-0.80; otherwise Revise.

import { transmute, type ProgramType } from "./dhvsu-grade";

export const GROUP_FRACTION = 0.27;
// Transmuted exam grade below this is failing (DHVSU passing grade).
export const PASSING_GRADE = 75;
// An item this many students got right is "easy"; missing it is a red flag.
export const EASY_ITEM_P = 0.75;
// Items fewer than this share of the class got right need reteaching.
export const LEAST_LEARNED_P = 0.5;

export type DifficultyLabel = "Very easy" | "Easy" | "Average" | "Difficult" | "Very difficult";
export type DiscriminationLabel = "Very good" | "Good" | "Fair" | "Poor" | "Negative";
export type ItemDecision = "Retain" | "Revise" | "Reject";

export const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;
// Stored for an unanswered item in an answer string.
export const BLANK = "-";

// How many students in each group picked one option of an item.
export type OptionStat = {
  option: string; // "A".."E", or BLANK for no answer
  count: number;
  upper: number;
  lower: number;
  isKey: boolean;
  // Wrong option nobody picked, or one the upper group picked more than the lower group.
  flag: "unused" | "misleading" | null;
};

export type ItemStat = {
  item: number;
  key: string | null;
  correct: number;
  upperCorrect: number;
  lowerCorrect: number;
  difficulty: number;
  difficultyLabel: DifficultyLabel;
  discrimination: number;
  discriminationLabel: DiscriminationLabel;
  decision: ItemDecision;
  // Correlation between getting this item right and the total score; null
  // when everyone (or no one) got it right.
  pointBiserial: number | null;
  // Only in answer-key mode, for students whose answers were recorded.
  options: OptionStat[] | null;
};

export type StudentResult = {
  studentId: string;
  score: number;
  percent: number;
  transmuted: number;
  group: "upper" | "middle" | "lower";
  wrongItems: number[];
  // Items most of the class got right (p >= EASY_ITEM_P) that this student missed.
  missedEasyItems: number[];
  struggling: boolean;
  answers: string | null;
};

export type ExamSummary = {
  high: number;
  low: number;
  median: number;
  stdDev: number;
  // KR-20 reliability (0-1, higher = more consistent test); null with < 2 items or no spread.
  kr20: number | null;
  // Index = score, value = number of students with that score.
  distribution: number[];
};

export type ItemAnalysis = {
  itemCount: number;
  studentCount: number;
  groupSize: number;
  meanScore: number;
  items: ItemStat[];
  students: StudentResult[];
  leastLearned: number[];
  summary: ExamSummary;
};

// answers: the student's letters, one per item (BLANK = no answer); only in answer-key mode.
export type ItemResponse = { studentId: string; wrongItems: number[]; answers?: string | null };

export function difficultyLabel(p: number): DifficultyLabel {
  if (p >= 0.81) return "Very easy";
  if (p >= 0.61) return "Easy";
  if (p >= 0.41) return "Average";
  if (p >= 0.21) return "Difficult";
  return "Very difficult";
}

export function discriminationLabel(d: number): DiscriminationLabel {
  if (d < 0) return "Negative";
  if (d >= 0.4) return "Very good";
  if (d >= 0.3) return "Good";
  if (d >= 0.2) return "Fair";
  return "Poor";
}

export function itemDecision(p: number, d: number): ItemDecision {
  const goodDifficulty = p >= 0.21 && p <= 0.8;
  if (d < 0) return "Reject";
  if (d >= 0.2 && goodDifficulty) return "Retain";
  if (d < 0.2 && !goodDifficulty) return "Reject";
  return "Revise";
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// Items whose answer doesn't match the key (a blank counts as wrong).
export function wrongItemsFromAnswers(answers: string, key: string): number[] {
  const wrong: number[] = [];
  for (let i = 0; i < key.length; i++) if (answers[i] !== key[i]) wrong.push(i + 1);
  return wrong;
}

// Correct / incorrect / blank counts for one paper scored against the key.
export function tallyAnswers(answers: string, key: string): { correct: number; incorrect: number; blank: number } {
  let correct = 0;
  let blank = 0;
  for (let i = 0; i < key.length; i++) {
    if (answers[i] === key[i]) correct++;
    else if (!answers[i] || answers[i] === BLANK) blank++;
  }
  return { correct, incorrect: key.length - correct - blank, blank };
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeItems(
  itemCount: number,
  responses: ItemResponse[],
  programType: ProgramType,
  answerKey: string | null = null,
): ItemAnalysis {
  const key = answerKey && answerKey.length === itemCount ? answerKey : null;
  const n = responses.length;
  const scored = responses.map((r) => {
    const answers = key && r.answers && r.answers.length === itemCount ? r.answers : null;
    const source = answers ? wrongItemsFromAnswers(answers, key!) : r.wrongItems;
    const wrong = [...new Set(source.filter((i) => i >= 1 && i <= itemCount))].sort((a, b) => a - b);
    return { studentId: r.studentId, answers, wrong, wrongSet: new Set(wrong), score: itemCount - wrong.length };
  });
  const totals = scored.map((s) => s.score);
  const mean = n ? totals.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n ? totals.reduce((a, t) => a + (t - mean) ** 2, 0) / n : 0;
  const sd = Math.sqrt(variance);
  // Options offered on this exam: A..the highest letter in the key or any answer (at least D).
  let maxOption = 3;
  if (key) {
    for (const ch of [key, ...scored.map((s) => s.answers ?? "")].join("")) {
      const idx = OPTION_LETTERS.indexOf(ch as (typeof OPTION_LETTERS)[number]);
      if (idx > maxOption) maxOption = idx;
    }
  }
  const optionLetters: string[] = OPTION_LETTERS.slice(0, maxOption + 1);

  // Highest score first; ties keep input order so results are stable.
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const groupSize = n === 0 ? 0 : Math.max(1, Math.round(n * GROUP_FRACTION));
  // With too few students the groups would overlap -- cap so they never do.
  const g = Math.min(groupSize, Math.floor(n / 2));
  const upper = new Set(ranked.slice(0, g).map((s) => s.studentId));
  const lower = new Set(ranked.slice(n - g).map((s) => s.studentId));

  const items: ItemStat[] = [];
  for (let item = 1; item <= itemCount; item++) {
    let correct = 0;
    let upperCorrect = 0;
    let lowerCorrect = 0;
    for (const s of scored) {
      if (s.wrongSet.has(item)) continue;
      correct += 1;
      if (upper.has(s.studentId)) upperCorrect += 1;
      if (lower.has(s.studentId)) lowerCorrect += 1;
    }
    const difficulty = n ? round2(correct / n) : 0;
    const discrimination = g ? round2((upperCorrect - lowerCorrect) / g) : 0;

    // Point-biserial: (mean of those right - mean of those wrong) / SD * sqrt(p*q).
    let pointBiserial: number | null = null;
    const wrongCount = n - correct;
    if (correct > 0 && wrongCount > 0 && sd > 0) {
      let sumRight = 0;
      for (const s of scored) if (!s.wrongSet.has(item)) sumRight += s.score;
      const meanRight = sumRight / correct;
      const meanWrong = (mean * n - sumRight) / wrongCount;
      const p = correct / n;
      pointBiserial = round2(((meanRight - meanWrong) / sd) * Math.sqrt(p * (1 - p)));
    }

    let options: OptionStat[] | null = null;
    if (key) {
      const keyLetter = key[item - 1];
      const withAnswers = scored.filter((s) => s.answers);
      options = [...optionLetters, BLANK].map((option) => {
        let count = 0;
        let up = 0;
        let low = 0;
        for (const s of withAnswers) {
          if (s.answers![item - 1] !== option) continue;
          count += 1;
          if (upper.has(s.studentId)) up += 1;
          if (lower.has(s.studentId)) low += 1;
        }
        const isKey = option === keyLetter;
        let flag: OptionStat["flag"] = null;
        if (!isKey && option !== BLANK && withAnswers.length > 0) {
          if (count === 0) flag = "unused";
          else if (up > low) flag = "misleading";
        }
        return { option, count, upper: up, lower: low, isKey, flag };
      });
    }

    items.push({
      item,
      key: key ? key[item - 1] : null,
      correct,
      upperCorrect,
      lowerCorrect,
      difficulty,
      difficultyLabel: difficultyLabel(difficulty),
      discrimination,
      discriminationLabel: discriminationLabel(discrimination),
      decision: itemDecision(difficulty, discrimination),
      pointBiserial,
      options,
    });
  }

  const easyItems = new Set(items.filter((i) => i.difficulty >= EASY_ITEM_P).map((i) => i.item));

  const students: StudentResult[] = scored.map((s) => {
    const percent = itemCount ? (s.score / itemCount) * 100 : 0;
    const transmuted = transmute(percent, programType);
    const group = upper.has(s.studentId) ? "upper" : lower.has(s.studentId) ? "lower" : "middle";
    return {
      studentId: s.studentId,
      score: s.score,
      percent: round2(percent),
      transmuted,
      group,
      wrongItems: s.wrong,
      missedEasyItems: s.wrong.filter((i) => easyItems.has(i)),
      struggling: transmuted < PASSING_GRADE,
      answers: s.answers,
    };
  });

  const sortedTotals = [...totals].sort((a, b) => a - b);
  const distribution = new Array(itemCount + 1).fill(0);
  for (const t of totals) distribution[t] += 1;
  let kr20: number | null = null;
  if (itemCount >= 2 && variance > 0) {
    const sumPQ = items.reduce((a, i) => a + (i.correct / n) * (1 - i.correct / n), 0);
    kr20 = round2((itemCount / (itemCount - 1)) * (1 - sumPQ / variance));
  }

  return {
    itemCount,
    studentCount: n,
    groupSize: g,
    meanScore: round2(mean),
    items,
    students,
    leastLearned: n ? items.filter((i) => i.difficulty < LEAST_LEARNED_P).map((i) => i.item) : [],
    summary: {
      high: n ? sortedTotals[n - 1] : 0,
      low: n ? sortedTotals[0] : 0,
      median: median(sortedTotals),
      stdDev: round2(sd),
      kr20,
      distribution,
    },
  };
}

// "ABCD ABCD" / "a,b,-,d" -> "ABC-D..." (one letter per item). Whitespace and
// commas are ignored; "-", "." or "_" mark a blank. A key can't have blanks.
// Also accepts 1-5 for A-E, as some answer sheets number the bubbles.
export function parseAnswerString(
  text: string,
  itemCount: number,
  { allowBlank = true }: { allowBlank?: boolean } = {},
): { answers: string; error?: undefined } | { answers?: undefined; error: string } {
  let out = "";
  for (const raw of text.toUpperCase().replace(/[\s,;]+/g, "")) {
    if (raw === "-" || raw === "." || raw === "_") {
      if (!allowBlank) return { error: "The key can't have blanks" };
      out += BLANK;
    } else if ((OPTION_LETTERS as readonly string[]).includes(raw)) {
      out += raw;
    } else if (/^[1-5]$/.test(raw)) {
      out += OPTION_LETTERS[Number(raw) - 1];
    } else {
      return { error: `"${raw}" isn't A-E` };
    }
  }
  if (out.length !== itemCount) return { error: `${out.length} answer${out.length === 1 ? "" : "s"}, need ${itemCount}` };
  return { answers: out };
}

// "ABCDABCDAB" -> "ABCDA BCDAB" (groups of 5, easier to check against a paper).
export function formatAnswerString(answers: string): string {
  return answers.match(/.{1,5}/g)?.join(" ") ?? "";
}

// ZipGrade-style item analysis export: one row per item, with the response
// distribution when there's an answer key.
export function itemAnalysisCsv(analysis: ItemAnalysis): string {
  const optionCols = analysis.items[0]?.options?.map((o) => o.option) ?? [];
  const header = [
    "Item",
    ...(analysis.items[0]?.key ? ["Key"] : []),
    "Correct",
    "Percent correct",
    "Difficulty",
    "Discrimination (27%)",
    "Point-biserial",
    "Decision",
    ...optionCols.map((o) => (o === BLANK ? "Blank" : o)),
  ];
  const esc = (v: string | number | null) => {
    const t = v == null ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = analysis.items.map((i) => {
    const byOption = new Map(i.options?.map((o) => [o.option, o.count]) ?? []);
    return [
      i.item,
      ...(i.key ? [i.key] : []),
      i.correct,
      analysis.studentCount ? Math.round((i.correct / analysis.studentCount) * 100) : 0,
      i.difficulty.toFixed(2),
      i.discrimination.toFixed(2),
      i.pointBiserial == null ? "" : i.pointBiserial.toFixed(2),
      i.decision,
      ...optionCols.map((o) => byOption.get(o) ?? 0),
    ];
  });
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

// "3, 7, 12-15" -> [3, 7, 12, 13, 14, 15]. "none", "0" and "-" mean a perfect
// paper (no wrong items). Returns an error for anything out of 1..itemCount.
export function parseItemList(
  text: string,
  itemCount: number,
): { items: number[]; error?: undefined } | { items?: undefined; error: string } {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "none" || trimmed === "0" || trimmed === "-" || trimmed === "") return { items: [] };

  const result = new Set<number>();
  for (const part of trimmed.split(/[,\s;]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) return { error: `"${part}" is backwards` };
      if (a < 1 || b > itemCount) return { error: `Items must be 1-${itemCount}` };
      for (let i = a; i <= b; i++) result.add(i);
      continue;
    }
    if (!/^\d+$/.test(part)) return { error: `"${part}" isn't an item number` };
    const v = Number(part);
    if (v < 1 || v > itemCount) return { error: `Items must be 1-${itemCount}` };
    result.add(v);
  }
  return { items: [...result].sort((a, b) => a - b) };
}

// [3, 7, 12, 13, 14, 15] -> "3, 7, 12-15"
export function formatItemList(items: number[]): string {
  const sorted = [...new Set(items)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(sorted[i] === start ? String(start) : `${start}-${sorted[i]}`);
  }
  return parts.join(", ");
}
