import { describe, expect, it } from "vitest";
import { formatAnalyticsAnswer } from "./jarvis-analytics";
import { computeClassStats } from "./dashboard-insights";
import type { Attendance, ClassRow, GradingConfig, Student } from "./types";

const classRow: ClassRow = {
  id: "c1",
  teacher_id: "t1",
  name: "Web Development",
  subject: "CS101",
  archived: false,
  program_type: null,
  academic_year: null,
  semester: null,
  course_code: null,
  total_units: null,
  course_type: null,
  year_level: null,
  campus: null,
  college: null,
  department: null,
  program: null,
  session_schedule: null,
  created_at: "2026-01-01",
};

const students: Student[] = [
  { id: "s1", class_id: "c1", name: "Doe, Jane", code: "A1", device_id: null, created_at: "2026-01-01" },
  { id: "s2", class_id: "c1", name: "Roe, Jack", code: "A2", device_id: null, created_at: "2026-01-01" },
];

function attendanceRow(overrides: Partial<Attendance>): Attendance {
  return {
    id: overrides.id ?? "a",
    class_id: "c1",
    student_id: overrides.student_id ?? "s1",
    date: overrides.date ?? "2026-01-01",
    method: "manual",
    status: overrides.status ?? "present",
    recorded_at: "2026-01-01",
  };
}

describe("formatAnalyticsAnswer — single class", () => {
  it("reports no data when there's no attendance yet", () => {
    const answer = formatAnalyticsAnswer("overview", {
      kind: "class",
      classRow,
      students,
      attendance: [],
      gradingConfig: null,
    });
    expect(answer).toContain("No attendance recorded yet");
  });

  it("reports an attendance overview", () => {
    const attendance = [
      attendanceRow({ id: "a1", student_id: "s1", date: "2026-01-01", status: "present" }),
      attendanceRow({ id: "a2", student_id: "s2", date: "2026-01-01", status: "absent" }),
    ];
    const answer = formatAnalyticsAnswer("overview", {
      kind: "class",
      classRow,
      students,
      attendance,
      gradingConfig: null,
    });
    expect(answer).toContain("Web Development");
    expect(answer).toContain("50%");
  });

  it("names students below the attendance threshold", () => {
    const attendance = [attendanceRow({ id: "a1", student_id: "s1", date: "2026-01-01", status: "present" })];
    const answer = formatAnalyticsAnswer("low-attendance", {
      kind: "class",
      classRow,
      students,
      attendance,
      gradingConfig: null,
    });
    expect(answer).toContain("Roe, Jack");
    expect(answer).not.toContain("Doe, Jane");
  });

  it("reports no one below threshold when everyone attends", () => {
    const attendance = [
      attendanceRow({ id: "a1", student_id: "s1", date: "2026-01-01", status: "present" }),
      attendanceRow({ id: "a2", student_id: "s2", date: "2026-01-01", status: "present" }),
    ];
    const answer = formatAnalyticsAnswer("low-attendance", {
      kind: "class",
      classRow,
      students,
      attendance,
      gradingConfig: null,
    });
    expect(answer).toContain("Nobody");
  });

  it("surfaces a grading-not-configured warning", () => {
    const answer = formatAnalyticsAnswer("warnings", {
      kind: "class",
      classRow,
      students,
      attendance: [],
      gradingConfig: null,
    });
    expect(answer).toContain("Grading not set up");
  });
});

describe("formatAnalyticsAnswer — aggregate", () => {
  it("reports no classes yet", () => {
    expect(formatAnalyticsAnswer("overview", { kind: "all", stats: [] })).toContain("don't have any classes");
  });

  it("averages attendance across classes", () => {
    const attendance = [attendanceRow({ id: "a1", student_id: "s1", date: "2026-01-01", status: "present" })];
    const gradingConfig: GradingConfig = {
      class_id: "c1",
      weight_assignment: 100,
      weight_recitation: 0,
      weight_quiz: 0,
      weight_written: 0,
      weight_laboratory: 0,
      weight_major_exam: 0,
      use_prelims: false,
      prelim_weight: 0,
      midterm_weight: 0,
      finals_weight: 0,
      prelim_end_date: null,
      midterm_end_date: null,
      show_assignment: true,
      show_recitation: false,
      show_quiz: false,
      show_written: false,
      show_laboratory: false,
      show_major_exam: false,
      show_attendance: false,
      record_card_layout: {} as GradingConfig["record_card_layout"],
      updated_at: "2026-01-01",
    };
    const stats = [computeClassStats(classRow, students, attendance, gradingConfig)];
    const answer = formatAnalyticsAnswer("overview", { kind: "all", stats });
    expect(answer).toContain("Across 1 class");
  });
});
