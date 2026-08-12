import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";

export type ClassStats = {
  classRow: ClassRow;
  studentCount: number;
  attendanceRate: number | null;
  gradingConfigured: boolean;
  lowAttendanceStudentCount: number;
  weekTrend: { previous: number; current: number } | null;
};

export type Insight = {
  severity: "warning" | "info";
  text: string;
};

export const LOW_ATTENDANCE_THRESHOLD = 0.75;
export const TREND_DROP_THRESHOLD = 0.15;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
}

// Present and Late both count as "attended" for rate purposes; Absent and
// Excused don't count toward the numerator (though the session itself still
// counts in the denominator via sessionDates).
function isAttended(a: Attendance): boolean {
  return a.status === "present" || a.status === "late";
}

export function computeClassStats(
  classRow: ClassRow,
  students: Student[],
  attendance: Attendance[],
  gradingConfig: GradingConfig | null,
): ClassStats {
  const studentCount = students.length;
  const sessionDates = Array.from(new Set(attendance.map((a) => a.date)));

  const attendanceRate =
    studentCount > 0 && sessionDates.length > 0
      ? attendance.filter(isAttended).length / (studentCount * sessionDates.length)
      : null;

  const gradingConfigured = gradingConfig
    ? gradingConfig.weight_assignment +
        gradingConfig.weight_recitation +
        gradingConfig.weight_quiz +
        gradingConfig.weight_written +
        gradingConfig.weight_laboratory +
        gradingConfig.weight_major_exam ===
      100
    : false;

  let lowAttendanceStudentCount = 0;
  if (sessionDates.length > 0) {
    const countByStudent = new Map<string, number>();
    for (const a of attendance.filter(isAttended)) {
      countByStudent.set(a.student_id, (countByStudent.get(a.student_id) ?? 0) + 1);
    }
    for (const s of students) {
      const rate = (countByStudent.get(s.id) ?? 0) / sessionDates.length;
      if (rate < LOW_ATTENDANCE_THRESHOLD) lowAttendanceStudentCount += 1;
    }
  }

  let weekTrend: { previous: number; current: number } | null = null;
  if (studentCount > 0) {
    const currentWindowStart = daysAgo(7);
    const previousWindowStart = daysAgo(14);

    const currentDates = sessionDates.filter((d) => d >= currentWindowStart);
    const previousDates = sessionDates.filter(
      (d) => d >= previousWindowStart && d < currentWindowStart,
    );

    if (currentDates.length > 0 && previousDates.length > 0) {
      const currentCount = attendance.filter(
        (a) => a.date >= currentWindowStart && isAttended(a),
      ).length;
      const previousCount = attendance.filter(
        (a) => a.date >= previousWindowStart && a.date < currentWindowStart && isAttended(a),
      ).length;

      weekTrend = {
        previous: previousCount / (studentCount * previousDates.length),
        current: currentCount / (studentCount * currentDates.length),
      };
    }
  }

  return {
    classRow,
    studentCount,
    attendanceRate,
    gradingConfigured,
    lowAttendanceStudentCount,
    weekTrend,
  };
}

export function computeInsights(stats: ClassStats[]): Insight[] {
  const insights: Insight[] = [];

  for (const s of stats) {
    if (s.lowAttendanceStudentCount > 0) {
      insights.push({
        severity: "warning",
        text: `${s.lowAttendanceStudentCount} student${
          s.lowAttendanceStudentCount === 1 ? "" : "s"
        } below ${Math.round(LOW_ATTENDANCE_THRESHOLD * 100)}% attendance in ${s.classRow.name}`,
      });
    }
  }

  const unconfigured = stats.filter((s) => !s.gradingConfigured).map((s) => s.classRow.name);
  if (unconfigured.length > 0) {
    insights.push({
      severity: "warning",
      text: `Grading not set up yet for: ${unconfigured.join(", ")}`,
    });
  }

  const noSubject = stats
    .filter((s) => !s.classRow.subject?.trim())
    .map((s) => s.classRow.name);
  if (noSubject.length > 0) {
    insights.push({
      severity: "info",
      text: `${noSubject.length} class${noSubject.length === 1 ? "" : "es"} have no subject set: ${noSubject.join(", ")}`,
    });
  }

  for (const s of stats) {
    if (!s.weekTrend) continue;
    const drop = s.weekTrend.previous - s.weekTrend.current;
    if (drop > TREND_DROP_THRESHOLD) {
      insights.push({
        severity: "warning",
        text: `Attendance dropped in ${s.classRow.name} this week (${Math.round(
          s.weekTrend.previous * 100,
        )}% → ${Math.round(s.weekTrend.current * 100)}%)`,
      });
    }
  }

  return insights;
}
