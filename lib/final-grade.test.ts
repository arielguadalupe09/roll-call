import { describe, expect, it } from "vitest";
import { computeFinalGrade } from "./final-grade";
import type { RecordCardStudentData } from "./record-card-data";
import type { GradingConfig, Student } from "./types";

function student(): Student {
  return {
    id: "s1",
    class_id: "class-1",
    name: "Student One",
    code: "ABC123",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function config(overrides: Partial<GradingConfig> = {}): GradingConfig {
  return {
    class_id: "class-1",
    weight_assignment: 20,
    weight_recitation: 20,
    weight_quiz: 20,
    weight_written: 20,
    weight_laboratory: 10,
    weight_major_exam: 10,
    midterm_weight: 50,
    finals_weight: 50,
    midterm_end_date: "2026-07-15",
    show_assignment: true,
    show_recitation: true,
    show_quiz: true,
    show_written: true,
    show_laboratory: true,
    show_major_exam: true,
    show_attendance: true,
    record_card_layout: {},
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function emptyRecordCardData(overrides: Partial<RecordCardStudentData> = {}): RecordCardStudentData {
  return {
    student: student(),
    assignmentEntries: [],
    recitationEntries: [],
    quizEntries: [],
    writtenEntries: [],
    labEntries: [],
    majorExam: { midtermScore: null, midtermMax: null, finalsScore: null, finalsMax: null, average: null },
    attendanceEntries: [],
    ...overrides,
  };
}

describe("computeFinalGrade", () => {
  it("returns nulls when nothing has been graded yet", () => {
    expect(computeFinalGrade(emptyRecordCardData(), config())).toEqual({
      midterm: null,
      finals: null,
      final: null,
    });
  });

  it("computes 100 when every category is a perfect score", () => {
    const data = emptyRecordCardData({
      assignmentEntries: [{ date: "2026-07-01", period: "midterm", score: 100, maxScore: 100 }],
      recitationEntries: [{ date: "2026-07-01", period: "midterm", score: 5, maxScore: 5 }],
      quizEntries: [{ date: "2026-07-01", period: "midterm", score: 100, maxScore: 100 }],
      writtenEntries: [{ date: "2026-07-01", period: "midterm", score: 100, maxScore: 100 }],
      labEntries: [{ date: "2026-07-01", period: "midterm", score: 100, maxScore: 100 }],
      majorExam: { midtermScore: 100, midtermMax: 100, finalsScore: null, finalsMax: null, average: null },
    });
    const grade = computeFinalGrade(data, config());
    expect(grade.midterm).toBe(100);
    expect(grade.finals).toBeNull();
    // Only midterm has data, so the final renormalizes to 100% of the available weight.
    expect(grade.final).toBe(100);
  });

  it("renormalizes over whatever categories actually have graded data", () => {
    // Only the assignment category is graded; it should carry the full
    // period grade rather than being diluted by the other weights.
    const data = emptyRecordCardData({
      assignmentEntries: [{ date: "2026-07-01", period: "midterm", score: 100, maxScore: 100 }],
    });
    expect(computeFinalGrade(data, config()).midterm).toBe(100);
  });

  it("combines midterm and finals using the configured period weights", () => {
    const data = emptyRecordCardData({
      assignmentEntries: [
        { date: "2026-07-01", period: "midterm", score: 80, maxScore: 100 },
        { date: "2026-08-01", period: "finals", score: 60, maxScore: 100 },
      ],
    });
    const soloAssignmentConfig = config({
      weight_assignment: 100,
      weight_recitation: 0,
      weight_quiz: 0,
      weight_written: 0,
      weight_laboratory: 0,
      weight_major_exam: 0,
    });
    const grade = computeFinalGrade(data, soloAssignmentConfig);
    expect(grade.midterm).toBe(80);
    expect(grade.finals).toBe(60);
    expect(grade.final).toBe(70);
  });

  it("returns null when grading weights haven't been configured yet", () => {
    const data = emptyRecordCardData({
      assignmentEntries: [{ date: "2026-07-01", period: "midterm", score: 100, maxScore: 100 }],
    });
    const unconfigured = config({
      weight_assignment: 0,
      weight_recitation: 0,
      weight_quiz: 0,
      weight_written: 0,
      weight_laboratory: 0,
      weight_major_exam: 0,
    });
    expect(computeFinalGrade(data, unconfigured).midterm).toBeNull();
  });
});
