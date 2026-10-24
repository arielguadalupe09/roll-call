import { describe, expect, it } from "vitest";
import {
  buildTermPlan,
  computeDhvsuGrades,
  gradeDescriptive,
  gradeEquivalent,
  normalizeProgramType,
  slotValue,
  termBreakdown,
  transmute,
} from "./dhvsu-grade";
import type { ClassGradingData } from "./record-card-data";
import type { Assessment, AssessmentScore, GradingConfig } from "./types";

function config(overrides: Partial<GradingConfig> = {}): GradingConfig {
  return {
    class_id: "c1",
    weight_attendance: 0,
    weight_assignment: 0,
    weight_recitation: 0,
    weight_quiz: 0,
    weight_written: 0,
    weight_laboratory: 0,
    weight_major_exam: 0,
    weight_other: 0,
    criteria_labels: {},
    use_prelims: false,
    prelim_weight: 0,
    midterm_weight: 50,
    finals_weight: 50,
    prelim_end_date: null,
    midterm_end_date: "2026-10-31",
    show_assignment: true,
    show_recitation: true,
    show_quiz: true,
    show_written: true,
    show_laboratory: true,
    show_other: true,
    show_major_exam: true,
    show_attendance: true,
    record_card_layout: {},
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function data(overrides: Partial<ClassGradingData> = {}): ClassGradingData {
  return {
    config: config(),
    assignments: [],
    submissions: [],
    assessments: [],
    assessmentScores: [],
    majorExams: [],
    majorExamScores: [],
    recitationLogs: [],
    attendance: [],
    adjustments: [],
    ...overrides,
  };
}

function assessment(id: string, category: Assessment["category"], max: number, date: string): Assessment {
  return {
    id,
    class_id: "c1",
    category,
    title: id,
    date,
    max_score: max,
    period: "midterm",
    created_at: `${date}T00:00:00Z`,
  } as Assessment;
}

function score(assessmentId: string, studentId: string, value: number | null): AssessmentScore {
  return { id: `${assessmentId}-${studentId}`, assessment_id: assessmentId, student_id: studentId, score: value } as AssessmentScore;
}

const NB = "Non-board program" as const;

describe("transmute / slotValue", () => {
  it("uses the template's non-board table", () => {
    expect(transmute(100, NB)).toBe(100);
    expect(transmute(85, NB)).toBe(84.45);
    expect(transmute(50, NB)).toBe(75);
    expect(transmute(0, NB)).toBe(60);
  });

  it("floors the raw percentage like the template (78.33 -> 78, not #N/A)", () => {
    expect(transmute(78.33, NB)).toBe(transmute(78, NB));
    expect(slotValue(47, 60, NB)).toBe(transmute(78, NB)); // 78.33%
  });

  it("treats a missing score as a flat 0 but a typed 0 as transmuted", () => {
    expect(slotValue(null, 100, NB)).toBe(0);
    expect(slotValue(0, 100, NB)).toBe(60);
  });

  it("floors values that are integers but land just below in floating point", () => {
    expect(slotValue(29, 100, NB)).toBe(transmute(29, NB));
    expect(slotValue(0.29 * 10, 10, NB)).toBe(transmute(29, NB));
  });
});

describe("normalizeProgramType", () => {
  it("defaults blank/unknown to non-board and keeps the template's spelling", () => {
    expect(normalizeProgramType(null)).toBe("Non-board program");
    expect(normalizeProgramType("NON-BOARD PROGRAM")).toBe("Non-board program");
    expect(normalizeProgramType("board program")).toBe("Board program");
    expect(normalizeProgramType("Board program (Medicine)")).toBe("Board program (Medicine)");
  });
});

describe("termBreakdown", () => {
  it("averages a category over all its slots, missing scores as 0", () => {
    // The screenshot's recitation: one item /100, a second /10 nobody has a
    // score for -- 90 then becomes (90 + 0) / 2 = 45.
    const d = data({
      assessments: [assessment("r1", "recitation", 100, "2026-09-01"), assessment("r2", "recitation", 10, "2026-09-02")],
      assessmentScores: [score("r1", "s1", 90)],
    });
    const plan = buildTermPlan(d, "midterm");
    expect(termBreakdown(plan, "s1", config(), NB).categories.recitation).toBe(45);
  });

  it("gives an ungraded category 0 and does not renormalize weights", () => {
    const d = data({
      config: config({ weight_quiz: 50, weight_recitation: 50 }),
      assessments: [assessment("q1", "quiz", 100, "2026-09-01")],
      assessmentScores: [score("q1", "s1", 100)],
    });
    const plan = buildTermPlan(d, "midterm");
    expect(termBreakdown(plan, "s1", d.config!, NB).grade).toBe(50);
  });

  it("scores attendance P=5, L=3, E=2, A=0 out of 5 per session, transmuted", () => {
    const d = data({
      config: config({ weight_attendance: 100 }),
      attendance: [
        { id: "a1", class_id: "c1", student_id: "s1", date: "2026-09-01", method: "manual", status: "present", recorded_at: "" },
        { id: "a2", class_id: "c1", student_id: "s1", date: "2026-09-02", method: "manual", status: "late", recorded_at: "" },
        { id: "a3", class_id: "c1", student_id: "s2", date: "2026-09-03", method: "manual", status: "present", recorded_at: "" },
      ],
    });
    const plan = buildTermPlan(d, "midterm");
    // s1: 5 + 3 + 0 (no record on 09-03) = 8 of 15 -> 53%
    expect(termBreakdown(plan, "s1", d.config!, NB).attendance).toBe(transmute(53, NB));
  });

  it("merges items beyond the template's 5 slots instead of dropping them", () => {
    const quizzes = Array.from({ length: 7 }, (_, i) => assessment(`q${i}`, "quiz", 10, `2026-09-0${i + 1}`));
    const d = data({ assessments: quizzes, assessmentScores: quizzes.map((q) => score(q.id, "s1", 10)) });
    const plan = buildTermPlan(d, "midterm");
    expect(plan.slots.quiz).toHaveLength(5);
    expect(plan.slots.quiz.reduce((sum, s) => sum + s.max, 0)).toBe(70);
    expect(termBreakdown(plan, "s1", config(), NB).categories.quiz).toBe(100);
  });

  it("caps a score above the item's max", () => {
    const d = data({ assessments: [assessment("q1", "quiz", 10, "2026-09-01")], assessmentScores: [score("q1", "s1", 12)] });
    expect(buildTermPlan(d, "midterm").slots.quiz[0].scores.get("s1")).toBe(10);
  });

  it("ignores scanner recitation taps (only gradebook recitation items count)", () => {
    const d = data({
      assessments: [assessment("r1", "recitation", 100, "2026-09-01")],
      assessmentScores: [score("r1", "s1", 90), score("r1", "s2", 90)],
      recitationLogs: [
        { id: "l1", class_id: "c1", student_id: "s1", type: "recitation", label: null, score: 5, date: "2026-09-01", recorded_at: "" },
      ],
    });
    const plan = buildTermPlan(d, "midterm");
    expect(plan.slots.recitation).toHaveLength(1);
    // s2 has no taps and is not penalized for it.
    expect(termBreakdown(plan, "s2", config(), NB).categories.recitation).toBe(transmute(90, NB));
  });
});

describe("computeDhvsuGrades", () => {
  it("combines terms by the class's term weights and floors the final rating", () => {
    const d = data({
      config: config({ weight_quiz: 100, midterm_weight: 40, finals_weight: 60 }),
      assessments: [
        assessment("m", "quiz", 100, "2026-09-01"),
        { ...assessment("f", "quiz", 100, "2026-11-15"), period: "finals" } as Assessment,
      ],
      assessmentScores: [score("m", "s1", 85), score("f", "s1", 95)],
      // No class dates at all would make the template mark FA.
      attendance: [
        { id: "a", class_id: "c1", student_id: "s1", date: "2026-09-01", method: "manual", status: "present", recorded_at: "" },
      ],
    });
    const grade = computeDhvsuGrades(d, [{ id: "s1" }], null).get("s1")!;
    expect(grade.midterm).toBe(84.45);
    expect(grade.finals).toBe(93.9);
    expect(grade.final).toBe(Math.floor(84.45 * 0.4 + 93.9 * 0.6)); // 90
    expect(grade.equivalent).toBe(1.75);
  });

  it("maps ratings below 75 to 5.0", () => {
    expect(gradeEquivalent(74)).toBe(5);
    expect(gradeEquivalent(75)).toBe(3);
    expect(gradeEquivalent(100)).toBe(1);
  });
});

describe("failure due to absences", () => {
  it("is FA when lates / 3 + absences reach 20% of class dates", () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
    const record = (student: string, date: string, status: "present" | "late" | "excused" | "absent") => ({
      id: `${student}${date}`, class_id: "c1", student_id: student, date, method: "manual" as const, status, recorded_at: "",
    });
    const d = data({
      attendance: [
        ...dates.map((date) => record("s0", date, "present")),
        // s1: one absence (no record) out of 5 = 20% -> FA
        ...dates.slice(1).map((date) => record("s1", date, "present")),
        // s2: two lates (2/3) and one excused -> not FA
        record("s2", dates[0], "late"), record("s2", dates[1], "late"), record("s2", dates[2], "excused"),
        record("s2", dates[3], "present"), record("s2", dates[4], "present"),
      ],
    });
    const grades = computeDhvsuGrades(d, [{ id: "s1" }, { id: "s2" }], null);
    expect(grades.get("s1")!.equivalent).toBe("FA");
    expect(grades.get("s2")!.equivalent).not.toBe("FA");
  });
});

describe("assignments", () => {
  it("never count toward the grade, even with a leftover assignment weight", () => {
    const d = data({
      config: config({ weight_assignment: 100 }),
      assignments: [
        { id: "a1", title: "HW", max_score: 10, period: "midterm", due_date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" } as ClassGradingData["assignments"][number],
      ],
      submissions: [{ assignment_id: "a1", student_id: "s1", score: 10 } as ClassGradingData["submissions"][number]],
    });
    expect(termBreakdown(buildTermPlan(d, "midterm"), "s1", d.config!, NB).grade).toBe(0);
  });
});

describe("5th Class Standing criterion", () => {
  it("grades 'other' items with the weight_other weight", () => {
    const d = data({
      config: config({ weight_other: 100 }),
      assessments: [assessment("o1", "other", 50, "2026-09-01")],
      assessmentScores: [score("o1", "s1", 50)],
    });
    expect(termBreakdown(buildTermPlan(d, "midterm"), "s1", d.config!, NB).grade).toBe(100);
  });
});

describe("term equivalents and remarks", () => {
  it("grades each term on its own scale with the template's descriptive", () => {
    expect(gradeDescriptive(1)).toBe("High Pass");
    expect(gradeDescriptive(2.75)).toBe("Pass");
    expect(gradeDescriptive(3)).toBe("Low Pass");
    expect(gradeDescriptive(5)).toBe("Failed");
    expect(gradeDescriptive("FA")).toBe("Failure due to Absences");

    const d = data({
      config: config({ weight_quiz: 100 }),
      assessments: [
        assessment("m", "quiz", 100, "2026-09-01"),
        { ...assessment("f", "quiz", 100, "2026-11-15"), period: "finals" } as Assessment,
      ],
      assessmentScores: [score("m", "s1", 85), score("f", "s1", 40)],
      attendance: [
        { id: "a", class_id: "c1", student_id: "s1", date: "2026-09-01", method: "manual", status: "present", recorded_at: "" },
      ],
    });
    const g = computeDhvsuGrades(d, [{ id: "s1" }], null).get("s1")!;
    expect(g.termEquivalents.midterm).toBe(2.25); // 84.45
    expect(g.termEquivalents.finals).toBe(5); // 72
  });
});

describe("written + laboratory major exams", () => {
  it("count half of the Major Exam weight each when a term has both", () => {
    const exam = (id: string, kind: "written" | "laboratory") =>
      ({ id, class_id: "c1", period: "midterm", kind, max_score: 100, created_at: "2026-09-01T00:00:00Z" }) as ClassGradingData["majorExams"][number];
    const d = data({
      config: config({ weight_major_exam: 30, weight_quiz: 70 }),
      majorExams: [exam("w", "written"), exam("l", "laboratory")],
      majorExamScores: [
        { id: "1", major_exam_id: "w", student_id: "s1", score: 100 },
        { id: "2", major_exam_id: "l", student_id: "s1", score: 50 },
      ] as ClassGradingData["majorExamScores"],
    });
    const t = termBreakdown(buildTermPlan(d, "midterm"), "s1", d.config!, NB);
    // (100 + transmute(50)=75) / 2 = 87.5 -> x 30% = 15% x 100 + 15% x 75
    expect(t.categories.major_exam).toBe(87.5);
    expect(t.grade).toBeCloseTo(0.15 * 100 + 0.15 * 75);
  });
});

describe("adjustments", () => {
  it("add straight onto that term's grade (and its equivalent)", () => {
    const d = data({
      config: config({ weight_quiz: 100 }),
      assessments: [assessment("m", "quiz", 100, "2026-09-01")],
      assessmentScores: [score("m", "s1", 85)],
      attendance: [
        { id: "a", class_id: "c1", student_id: "s1", date: "2026-09-01", method: "manual", status: "present", recorded_at: "" },
      ],
      adjustments: [{ id: "x", class_id: "c1", student_id: "s1", period: "midterm", points: 3, updated_at: "" }],
    });
    const g = computeDhvsuGrades(d, [{ id: "s1" }], null).get("s1")!;
    expect(g.midterm).toBeCloseTo(87.45); // 84.45 + 3
    expect(g.terms.midterm!.adjustment).toBe(3);
    expect(g.termEquivalents.midterm).toBe(2); // 87 -> 2.00 instead of 84 -> 2.25
  });
});
