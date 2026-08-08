import { describe, expect, it } from "vitest";
import { buildRecordCardData, periodForDate, type ClassGradingData } from "./record-card-data";
import type {
  Assignment,
  GradingConfig,
  MajorExam,
  MajorExamScore,
  ParticipationLog,
  Student,
  Submission,
} from "./types";

function student(id: string): Student {
  return { id, class_id: "class-1", name: id, code: id, created_at: "2026-01-01T00:00:00Z" };
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
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function emptyClassData(overrides: Partial<ClassGradingData> = {}): ClassGradingData {
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
    ...overrides,
  };
}

describe("periodForDate", () => {
  it("defaults to midterm when there's no cutoff configured", () => {
    expect(periodForDate("2026-12-31", null)).toBe("midterm");
  });

  it("treats the cutoff date itself as midterm, and the day after as finals", () => {
    expect(periodForDate("2026-07-15", "2026-07-15")).toBe("midterm");
    expect(periodForDate("2026-07-16", "2026-07-15")).toBe("finals");
  });
});

describe("buildRecordCardData", () => {
  it("returns empty entries for a student with no recorded data", () => {
    const data = buildRecordCardData(student("s1"), emptyClassData());
    expect(data.assignmentEntries).toEqual([]);
    expect(data.recitationEntries).toEqual([]);
    expect(data.majorExam).toEqual({
      midtermScore: null,
      midtermMax: null,
      finalsScore: null,
      finalsMax: null,
      average: null,
    });
  });

  it("maps a student's own submission onto their assignment, ignoring other students'", () => {
    const assignment: Assignment = {
      id: "a1",
      class_id: "class-1",
      title: "HW1",
      description: null,
      due_date: "2026-07-10",
      max_score: 100,
      period: "midterm",
      created_at: "2026-01-01T00:00:00Z",
    };
    const submissions: Submission[] = [
      {
        id: "sub1",
        assignment_id: "a1",
        student_id: "s1",
        status: "graded",
        file_path: null,
        file_name: null,
        score: 90,
        feedback: null,
        updated_at: "2026-07-10T00:00:00Z",
      },
      {
        id: "sub2",
        assignment_id: "a1",
        student_id: "s2",
        status: "graded",
        file_path: null,
        file_name: null,
        score: 10,
        feedback: null,
        updated_at: "2026-07-10T00:00:00Z",
      },
    ];
    const data = buildRecordCardData(
      student("s1"),
      emptyClassData({ assignments: [assignment], submissions }),
    );
    expect(data.assignmentEntries).toEqual([
      { date: "2026-07-10", period: "midterm", score: 90, maxScore: 100 },
    ]);
  });

  it("splits recitation entries into midterm/finals using the configured cutoff", () => {
    const logs: ParticipationLog[] = [
      {
        id: "l1",
        class_id: "class-1",
        student_id: "s1",
        type: "recitation",
        label: null,
        score: 5,
        date: "2026-07-10",
        recorded_at: "2026-07-10T08:00:00Z",
      },
      {
        id: "l2",
        class_id: "class-1",
        student_id: "s1",
        type: "recitation",
        label: null,
        score: 3,
        date: "2026-07-20",
        recorded_at: "2026-07-20T08:00:00Z",
      },
    ];
    const data = buildRecordCardData(student("s1"), emptyClassData({ recitationLogs: logs }));
    expect(data.recitationEntries).toEqual([
      { date: "2026-07-10", period: "midterm", score: 5, maxScore: 5 },
      { date: "2026-07-20", period: "finals", score: 3, maxScore: 5 },
    ]);
  });

  it("averages midterm and finals major exam scores", () => {
    const majorExams: MajorExam[] = [
      { id: "e1", class_id: "class-1", period: "midterm", max_score: 100, created_at: "2026-01-01T00:00:00Z" },
      { id: "e2", class_id: "class-1", period: "finals", max_score: 100, created_at: "2026-01-01T00:00:00Z" },
    ];
    const majorExamScores: MajorExamScore[] = [
      { id: "s1", major_exam_id: "e1", student_id: "s1", score: 80, updated_at: "2026-07-10T00:00:00Z" },
      { id: "s2", major_exam_id: "e2", student_id: "s1", score: 90, updated_at: "2026-08-01T00:00:00Z" },
    ];
    const data = buildRecordCardData(
      student("s1"),
      emptyClassData({ majorExams, majorExamScores }),
    );
    expect(data.majorExam.average).toBe(85);
  });

  it("leaves the major exam average null until both periods are scored", () => {
    const majorExams: MajorExam[] = [
      { id: "e1", class_id: "class-1", period: "midterm", max_score: 100, created_at: "2026-01-01T00:00:00Z" },
    ];
    const majorExamScores: MajorExamScore[] = [
      { id: "s1", major_exam_id: "e1", student_id: "s1", score: 80, updated_at: "2026-07-10T00:00:00Z" },
    ];
    const data = buildRecordCardData(
      student("s1"),
      emptyClassData({ majorExams, majorExamScores }),
    );
    expect(data.majorExam.midtermScore).toBe(80);
    expect(data.majorExam.average).toBeNull();
  });
});
