import type { ClassGradingData } from "./record-card-data";
import { periodForDate } from "./record-card-data";
import { GRADE_EQUIVALENT, SPECIAL_DESCRIPTIVE, TRANSMUTATION } from "./dhvsu-tables";
import { CLASS_STANDING_SLOTS, type CriterionKey } from "./grading-criteria";
import type { AttendanceStatus, GradingConfig, Period, Student } from "./types";

// Grades computed exactly the way the official DHVSU class record
// (lib/templates/dhvsu-1st-3rd-year.xlsx, hidden MidCom/FinCom sheets)
// computes them. The gradebook, student portal and the .xlsx export all go
// through buildTermPlan(), so the app's numbers and the exported file's
// formulas see the same items in the same slots and can't drift apart.
//
// Per term:
// - Every item (one quiz, one recitation, ...) is a "slot" with one max
//   score shared by the whole class. A student's slot value is
//   TRANSMUTATION[FLOOR(score / max * 100)]; a missing score is a flat 0
//   (not transmuted -- the template's IF(score="",0,...)).
// - A category is the plain average of its slots' values, or 0 when it has
//   no slots. Categories are NOT renormalized: an ungraded category with
//   weight still pulls the grade down, same as the official form.
// - Term grade = sum of category value x weight (attendance included).
//   Assignments are not a graded category: they stay a submissions feature
//   only, and Attendance took their weight (migration 0037).
// Final rating = FLOOR(sum of term grade x term weight); equivalent from
// the "New Grade Equivalent" table (below 75 is 5.0), or "FA" (Failure due
// to Absences) when lates / 3 + absences across all terms reach 20% of the
// class dates (FinCom!E6).

// The five Class Standing criteria (lib/grading-criteria.ts) + Major Exam.
export type DhvsuCategory = CriterionKey | "major_exam";

export const DHVSU_CATEGORIES: readonly DhvsuCategory[] = [
  ...CLASS_STANDING_SLOTS.map((s) => s.key),
  "major_exam",
];

// Score slots per category on the template's term sheets (each Class
// Standing block is 5 wide; Major Exam AM:AP is 4 wide).
export const SLOT_CAPACITY: Record<DhvsuCategory, number> = {
  quiz: 5,
  recitation: 5,
  written: 5,
  laboratory: 5,
  other: 5,
  major_exam: 4,
};

// The template's attendance sheet has date columns C:AU.
export const MAX_ATTENDANCE_SESSIONS = 45;

export const WEIGHT_FIELD: Record<DhvsuCategory | "attendance", keyof GradingConfig> = {
  attendance: "weight_attendance",
  quiz: "weight_quiz",
  recitation: "weight_recitation",
  written: "weight_written",
  laboratory: "weight_laboratory",
  other: "weight_other",
  major_exam: "weight_major_exam",
};

export type ProgramType = "Non-board program" | "Board program" | "Board program (Medicine)";

const PROGRAM_COLUMN: Record<ProgramType, 0 | 1 | 2> = {
  "Non-board program": 0,
  "Board program": 1,
  "Board program (Medicine)": 2,
};

// classes.program_type is free text from the class record metadata form;
// anything unrecognized (including null) grades as non-board, and the
// export writes this canonical spelling so the template's formulas match it.
export function normalizeProgramType(value: string | null | undefined): ProgramType {
  const v = (value ?? "").trim().toLowerCase();
  if (v.startsWith("board program (medicine)")) return "Board program (Medicine)";
  if (v.startsWith("board program")) return "Board program";
  return "Non-board program";
}

// Excel's FLOOR on a value that is mathematically an integer but lands a
// hair below it in floating point (e.g. 0.29 * 100) still returns the
// integer, because Excel rounds to 15 significant digits first.
function floorLikeExcel(x: number): number {
  return Math.floor(Number(x.toPrecision(15)));
}

export function transmute(rawPercent: number, programType: ProgramType): number {
  const index = Math.min(100, Math.max(0, floorLikeExcel(rawPercent)));
  return TRANSMUTATION[index][PROGRAM_COLUMN[programType]];
}

export function slotValue(score: number | null, max: number, programType: ProgramType): number {
  if (score == null) return 0;
  return transmute((score / max) * 100, programType);
}

export type Slot = {
  label: string;
  date: string | null;
  max: number;
  // Missing key or null = no score (counts as a flat 0).
  scores: Map<string, number | null>;
};

export type TermPlan = {
  period: Period;
  adjustments: Map<string, number>; // student -> points
  slots: Record<DhvsuCategory, Slot[]>;
  sessionDates: string[];
  attendance: Map<string, Map<string, AttendanceStatus>>; // student -> date -> status
};

type Item = { label: string; date: string; max: number; scores: Map<string, number | null> };

// More items than the template has slots: merge consecutive items into
// combined slots (scores and maxes summed) so every item still counts. A
// student missing every item in a merged slot stays blank, matching what
// a single blank slot does.
function packSlots(items: Item[], capacity: number): Slot[] {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length <= capacity) {
    return sorted.map((i) => ({ label: i.label, date: i.date, max: i.max, scores: i.scores }));
  }
  const slots: Slot[] = [];
  let start = 0;
  for (let s = 0; s < capacity; s++) {
    const size = Math.floor(sorted.length / capacity) + (s < sorted.length % capacity ? 1 : 0);
    const group = sorted.slice(start, start + size);
    start += size;
    const studentIds = new Set(group.flatMap((i) => [...i.scores.keys()]));
    const scores = new Map<string, number | null>();
    for (const id of studentIds) {
      const values = group.map((i) => i.scores.get(id) ?? null);
      if (values.every((v) => v == null)) continue;
      scores.set(id, values.reduce<number>((sum, v) => sum + (v ?? 0), 0));
    }
    slots.push({
      label: group.map((i) => i.label).join(" + "),
      date: group[0].date,
      max: group.reduce((sum, i) => sum + i.max, 0),
      scores,
    });
  }
  return slots;
}

// A score above the item's max would make the template show "OVER" and
// the whole term grade "ERR"; cap it instead so both sides stay numeric.
function clampScore(score: number | null | undefined, max: number): number | null {
  if (score == null) return null;
  return Math.min(Math.max(score, 0), max);
}

export function buildTermPlan(classData: ClassGradingData, period: Period): TermPlan {
  const cutoffs = classData.config ?? { use_prelims: false, prelim_end_date: null, midterm_end_date: null };

  const scoresByAssessment = new Map<string, Map<string, number | null>>();
  for (const s of classData.assessmentScores) {
    const map = scoresByAssessment.get(s.assessment_id) ?? new Map();
    map.set(s.student_id, s.score);
    scoresByAssessment.set(s.assessment_id, map);
  }
  function assessmentItems(category: CriterionKey): Item[] {
    return classData.assessments
      .filter((a) => a.category === category && a.period === period && a.max_score > 0)
      .map((a) => {
        const raw = scoresByAssessment.get(a.id) ?? new Map();
        const scores = new Map<string, number | null>();
        for (const [id, v] of raw) scores.set(id, clampScore(v, a.max_score));
        return { label: a.title, date: a.date ?? a.created_at.slice(0, 10), max: a.max_score, scores };
      });
  }

  // Scanner recitation taps (participation_logs) are not graded: an extra
  // slot counted as 0 for every student with no taps, halving their
  // recitation. Only gradebook recitation items count.
  const recitationItems = assessmentItems("recitation");

  const majorExamItems: Item[] = classData.majorExams
    .filter((e) => e.period === period && e.max_score > 0)
    .map((e) => {
      const scores = new Map<string, number | null>();
      for (const s of classData.majorExamScores) {
        if (s.major_exam_id === e.id) scores.set(s.student_id, clampScore(s.score, e.max_score));
      }
      // A term's written and laboratory exams are separate slots of the one
      // Major Exam criterion, so with both each counts half of its weight.
      const label = e.kind === "laboratory" ? "Laboratory exam" : "Written exam";
      return { label, date: e.created_at.slice(0, 10), max: e.max_score, scores };
    });

  const items: Record<DhvsuCategory, Item[]> = {
    quiz: assessmentItems("quiz"),
    recitation: recitationItems,
    written: assessmentItems("written"),
    laboratory: assessmentItems("laboratory"),
    other: assessmentItems("other"),
    major_exam: majorExamItems,
  };
  const slots = Object.fromEntries(
    DHVSU_CATEGORIES.map((c) => [c, packSlots(items[c], SLOT_CAPACITY[c])]),
  ) as Record<DhvsuCategory, Slot[]>;

  const periodAttendance = classData.attendance.filter((a) => periodForDate(a.date, cutoffs) === period);
  const sessionDates = Array.from(new Set(periodAttendance.map((a) => a.date))).sort();
  const attendance = new Map<string, Map<string, AttendanceStatus>>();
  for (const a of periodAttendance) {
    const map = attendance.get(a.student_id) ?? new Map();
    map.set(a.date, a.status);
    attendance.set(a.student_id, map);
  }

  const adjustments = new Map<string, number>();
  for (const a of classData.adjustments ?? []) {
    if (a.period === period && Number(a.points)) adjustments.set(a.student_id, Number(a.points));
  }

  return { period, adjustments, slots, sessionDates, attendance };
}

// The template's attendance points: P = 5, L = 3, E = 2, A/blank = 0.
const ATTENDANCE_POINTS: Record<AttendanceStatus, number> = { present: 5, late: 3, excused: 2, absent: 0 };

function attendanceScore(plan: TermPlan, studentId: string, programType: ProgramType) {
  const max = plan.sessionDates.length * 5;
  const byDate = plan.attendance.get(studentId);
  const points = plan.sessionDates.reduce(
    (sum, d) => sum + ATTENDANCE_POINTS[byDate?.get(d) ?? "absent"],
    0,
  );
  // No sessions yet: the template looks up a raw 0, i.e. the floor grade.
  const value = max === 0 ? transmute(0, programType) : transmute((points / max) * 100, programType);
  return { value, points, max };
}

export type TermBreakdown = {
  // Transmuted attendance grade, plus the raw P5/L3/E2 points behind it.
  attendance: number;
  attendancePoints: number;
  attendanceMax: number;
  categories: Record<DhvsuCategory, number>;
  // The "+" Adjustments column (AR), already included in grade.
  adjustment: number;
  grade: number;
};

export function termBreakdown(
  plan: TermPlan,
  studentId: string,
  config: GradingConfig,
  programType: ProgramType,
): TermBreakdown {
  const categories = {} as Record<DhvsuCategory, number>;
  for (const c of DHVSU_CATEGORIES) {
    const slots = plan.slots[c];
    categories[c] =
      slots.length === 0
        ? 0
        : slots.reduce((sum, s) => sum + slotValue(s.scores.get(studentId) ?? null, s.max, programType), 0) /
          slots.length;
  }
  const { value: attendance, points: attendancePoints, max: attendanceMax } = attendanceScore(
    plan,
    studentId,
    programType,
  );
  const weight = (key: DhvsuCategory | "attendance") => (Number(config[WEIGHT_FIELD[key]]) || 0) / 100;
  // Term grade = SUM(category x weight, ..., AR) -- MidCom/FinCom!AS.
  const adjustment = plan.adjustments.get(studentId) ?? 0;
  const grade =
    attendance * weight("attendance") +
    DHVSU_CATEGORIES.reduce((sum, c) => sum + categories[c] * weight(c), 0) +
    adjustment;
  return { attendance, attendancePoints, attendanceMax, categories, adjustment, grade };
}

export type DhvsuEquivalent = number | "FA";

export type DhvsuGrade = {
  prelim: number | null;
  midterm: number | null;
  finals: number | null;
  final: number | null;
  equivalent: DhvsuEquivalent | null;
  // Each term graded on its own 100-point scale, with its own equivalent
  // (the term sheets' EQUIVALENT / DESCRIPTIVE columns, AT/AU).
  termEquivalents: Partial<Record<Period, DhvsuEquivalent>>;
  // Per-term detail (attendance, category values) for display.
  terms: Partial<Record<Period, TermBreakdown>>;
};

// The "New Grade Equivalent" sheet's DESCRIPTIVE for an equivalent
// (High Pass / Pass / Low Pass / Failed / Failure due to Absences).
export function gradeDescriptive(equivalent: DhvsuEquivalent): string {
  if (typeof equivalent === "string") return SPECIAL_DESCRIPTIVE[equivalent] ?? equivalent;
  return GRADE_EQUIVALENT.find(([, eq]) => eq === equivalent)?.[2] ?? "";
}

// FinCom!E6: (lates / 3 + absences) >= 20% of all class dates, summed over
// every term. Excused doesn't count; no record on a class date is absent.
export function failedDueToAbsences(plans: TermPlan[], studentId: string): boolean {
  let sessions = 0;
  let missed = 0;
  for (const plan of plans) {
    sessions += plan.sessionDates.length;
    const byDate = plan.attendance.get(studentId);
    for (const d of plan.sessionDates) {
      const status = byDate?.get(d) ?? "absent";
      if (status === "absent") missed += 1;
      else if (status === "late") missed += 1 / 3;
    }
  }
  // With no class dates at all this is 0 >= 0, so the template marks
  // everyone FA; kept identical so the app and the file never disagree.
  return missed >= 0.2 * sessions;
}

export function gradeEquivalent(finalRating: number): number {
  if (finalRating < 75) return 5;
  const row = GRADE_EQUIVALENT.find(([rating]) => rating === Math.min(100, floorLikeExcel(finalRating)));
  return row ? row[1] : 5;
}

// Grades for every student in a class. Term plans are built once per
// class, not per student.
export function computeDhvsuGrades(
  classData: ClassGradingData,
  students: Pick<Student, "id">[],
  programTypeRaw: string | null | undefined,
): Map<string, DhvsuGrade> {
  const config = classData.config;
  const result = new Map<string, DhvsuGrade>();
  if (!config) {
    for (const s of students) {
      result.set(s.id, {
        prelim: null,
        midterm: null,
        finals: null,
        final: null,
        equivalent: null,
        termEquivalents: {},
        terms: {},
      });
    }
    return result;
  }
  const programType = normalizeProgramType(programTypeRaw);
  const periods: Period[] = config.use_prelims ? ["prelim", "midterm", "finals"] : ["midterm", "finals"];
  const plans = new Map(periods.map((p) => [p, buildTermPlan(classData, p)]));
  const termWeight: Record<Period, number> = {
    prelim: (Number(config.prelim_weight) || 0) / 100,
    midterm: (Number(config.midterm_weight) || 0) / 100,
    finals: (Number(config.finals_weight) || 0) / 100,
  };

  for (const s of students) {
    const terms: Partial<Record<Period, TermBreakdown>> = {};
    for (const [p, plan] of plans) terms[p] = termBreakdown(plan, s.id, config, programType);
    const term = (p: Period) => terms[p]?.grade ?? null;
    const prelim = term("prelim");
    const midterm = term("midterm");
    const finals = term("finals");
    const final = floorLikeExcel(
      (prelim ?? 0) * (config.use_prelims ? termWeight.prelim : 0) +
        (midterm ?? 0) * termWeight.midterm +
        (finals ?? 0) * termWeight.finals,
    );
    const fa = failedDueToAbsences([...plans.values()], s.id);
    const equivalent = fa ? "FA" : gradeEquivalent(final);
    // Term equivalents (MidCom/FinCom!AT): FA only ever shows on the last
    // term -- the template's absence check lives in the Final Term sheet.
    const lastPeriod = periods[periods.length - 1];
    const termEquivalents: Partial<Record<Period, DhvsuEquivalent>> = {};
    for (const p of periods) {
      const g = terms[p]?.grade;
      if (g == null) continue;
      termEquivalents[p] = fa && p === lastPeriod ? "FA" : gradeEquivalent(g);
    }
    result.set(s.id, { prelim, midterm, finals, final, equivalent, termEquivalents, terms });
  }
  return result;
}
