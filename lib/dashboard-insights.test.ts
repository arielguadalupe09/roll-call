import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeClassStats, computeInsights, type ClassStats } from "./dashboard-insights";
import type { Attendance, ClassRow, GradingConfig, Student } from "./types";

function classRow(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: "class-1",
    teacher_id: "teacher-1",
    name: "BS Info Tech 1A",
    subject: "Intro to Programming",
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
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function student(id: string): Student {
  return { id, class_id: "class-1", name: id, code: id, created_at: "2026-01-01T00:00:00Z" };
}

function attendanceRow(overrides: Partial<Attendance> & { id: string; student_id: string; date: string; status: Attendance["status"] }): Attendance {
  return {
    class_id: "class-1",
    method: "manual",
    recorded_at: `${overrides.date}T08:00:00Z`,
    ...overrides,
  };
}

function config(overrides: Partial<GradingConfig> = {}): GradingConfig {
  return {
    class_id: "class-1",
    weight_assignment: 0,
    weight_recitation: 0,
    weight_quiz: 0,
    weight_written: 0,
    weight_laboratory: 0,
    weight_major_exam: 0,
    use_prelims: false,
    prelim_weight: 0,
    midterm_weight: 50,
    finals_weight: 50,
    prelim_end_date: null,
    midterm_end_date: null,
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

describe("computeClassStats", () => {
  it("returns a null attendance rate when there are no sessions yet", () => {
    const stats = computeClassStats(classRow(), [student("s1")], [], null);
    expect(stats.attendanceRate).toBeNull();
    expect(stats.studentCount).toBe(1);
  });

  it("computes attendance rate as attended / (students * sessions)", () => {
    const students = [student("s1"), student("s2")];
    const attendance = [
      attendanceRow({ id: "1", student_id: "s1", date: "2026-08-01", status: "present" }),
      attendanceRow({ id: "2", student_id: "s2", date: "2026-08-01", status: "absent" }),
    ];
    const stats = computeClassStats(classRow(), students, attendance, null);
    expect(stats.attendanceRate).toBe(0.5);
  });

  it("treats late as attended, same as present", () => {
    const attendance = [attendanceRow({ id: "1", student_id: "s1", date: "2026-08-01", status: "late" })];
    const stats = computeClassStats(classRow(), [student("s1")], attendance, null);
    expect(stats.attendanceRate).toBe(1);
  });

  it("flags gradingConfigured only when weights sum to exactly 100", () => {
    expect(computeClassStats(classRow(), [], [], null).gradingConfigured).toBe(false);
    expect(
      computeClassStats(classRow(), [], [], config({ weight_assignment: 100 })).gradingConfigured,
    ).toBe(true);
    expect(
      computeClassStats(classRow(), [], [], config({ weight_assignment: 50 })).gradingConfigured,
    ).toBe(false);
  });

  it("counts students below the low-attendance threshold", () => {
    const students = [student("s1"), student("s2")];
    const attendance = [
      attendanceRow({ id: "1", student_id: "s1", date: "2026-08-01", status: "present" }),
      attendanceRow({ id: "2", student_id: "s1", date: "2026-08-02", status: "present" }),
      attendanceRow({ id: "3", student_id: "s2", date: "2026-08-01", status: "absent" }),
    ];
    const stats = computeClassStats(classRow(), students, attendance, null);
    // s1 attended 2/2 sessions (100%), s2 attended 0/2 (0%, below 75%).
    expect(stats.lowAttendanceStudentCount).toBe(1);
  });

  describe("week-over-week trend", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-08T00:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("detects a drop between the previous and current 7-day windows", () => {
      const attendance = [
        attendanceRow({ id: "1", student_id: "s1", date: "2026-07-27", status: "present" }),
        attendanceRow({ id: "2", student_id: "s1", date: "2026-07-28", status: "present" }),
        attendanceRow({ id: "3", student_id: "s1", date: "2026-08-05", status: "absent" }),
      ];
      const stats = computeClassStats(classRow(), [student("s1")], attendance, null);
      expect(stats.weekTrend).not.toBeNull();
      expect(stats.weekTrend!.previous).toBeGreaterThan(stats.weekTrend!.current);
    });
  });
});

describe("computeInsights", () => {
  function stat(overrides: Partial<ClassStats>): ClassStats {
    return {
      classRow: classRow(),
      studentCount: 0,
      attendanceRate: null,
      gradingConfigured: true,
      lowAttendanceStudentCount: 0,
      weekTrend: null,
      ...overrides,
    };
  }

  it("flags classes with low-attendance students", () => {
    const insights = computeInsights([
      stat({ classRow: classRow({ name: "BSIT 1A" }), lowAttendanceStudentCount: 1 }),
    ]);
    expect(
      insights.some((i) => i.severity === "warning" && i.text.includes("BSIT 1A")),
    ).toBe(true);
  });

  it("flags classes with no subject set", () => {
    const insights = computeInsights([
      stat({ classRow: classRow({ name: "BSIT 1A", subject: null }) }),
    ]);
    expect(
      insights.some((i) => i.severity === "info" && i.text.includes("no subject set")),
    ).toBe(true);
  });

  it("flags classes with unconfigured grading weights", () => {
    const insights = computeInsights([stat({ gradingConfigured: false })]);
    expect(insights.some((i) => i.text.includes("Grading not set up"))).toBe(true);
  });

  it("returns no insights for a fully healthy, fully configured class", () => {
    const insights = computeInsights([stat({ studentCount: 10, attendanceRate: 0.95 })]);
    expect(insights).toEqual([]);
  });
});
