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

export type StudentActivityTier = "active" | "at-risk" | "inactive";

// Same 90%/75% bands as the rest of the app's tier coloring (tierFor in
// lib/chart-tiers.ts), just relabeled for a single student's own rate
// rather than a class-wide rate.
export function studentAttendanceTier(rate: number): StudentActivityTier {
  if (rate >= 0.9) return "active";
  if (rate >= LOW_ATTENDANCE_THRESHOLD) return "at-risk";
  return "inactive";
}

/**
 * Per-student attendance tier for a single class, keyed by student id.
 * A class with no sessions yet maps every student to null (nothing to
 * categorize) rather than guessing "active" by default.
 */
export function computeStudentTiers(
  students: Student[],
  attendance: Attendance[],
): Map<string, StudentActivityTier | null> {
  const sessionDates = Array.from(new Set(attendance.map((a) => a.date)));
  const result = new Map<string, StudentActivityTier | null>();

  if (sessionDates.length === 0) {
    for (const s of students) result.set(s.id, null);
    return result;
  }

  const countByStudent = new Map<string, number>();
  for (const a of attendance.filter(isAttended)) {
    countByStudent.set(a.student_id, (countByStudent.get(a.student_id) ?? 0) + 1);
  }

  for (const s of students) {
    const rate = (countByStudent.get(s.id) ?? 0) / sessionDates.length;
    result.set(s.id, studentAttendanceTier(rate));
  }

  return result;
}

/**
 * Buckets every student enrollment (one row per class) into Active/At-risk/
 * Inactive via computeStudentTiers, then tallies the totals across classes
 * -- used by the Dashboard's Students KPI tile breakdown.
 */
export function computeStudentActivityCounts(
  classes: { id: string; students: Student[]; attendance: Attendance[] }[],
): { active: number; atRisk: number; inactive: number } {
  let active = 0;
  let atRisk = 0;
  let inactive = 0;

  for (const c of classes) {
    const tiers = computeStudentTiers(c.students, c.attendance);
    for (const tier of tiers.values()) {
      if (tier === "active") active += 1;
      else if (tier === "at-risk") atRisk += 1;
      else if (tier === "inactive") inactive += 1;
    }
  }

  return { active, atRisk, inactive };
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

/** Per-session attendance rate, oldest to newest, for a single class' trend chart. */
export function computeSessionSeries(
  students: Student[],
  attendance: Attendance[],
): { date: string; rate: number }[] {
  const sessionDates = Array.from(new Set(attendance.map((a) => a.date))).sort();
  if (students.length === 0) return sessionDates.map((date) => ({ date, rate: 0 }));

  const attendedByDate = new Map<string, number>();
  for (const a of attendance.filter(isAttended)) {
    attendedByDate.set(a.date, (attendedByDate.get(a.date) ?? 0) + 1);
  }

  return sessionDates.map((date) => ({
    date,
    rate: (attendedByDate.get(date) ?? 0) / students.length,
  }));
}

/** Names of students below the low-attendance threshold, for a single class. */
export function lowAttendanceStudentNames(students: Student[], attendance: Attendance[]): string[] {
  const sessionDates = Array.from(new Set(attendance.map((a) => a.date)));
  if (sessionDates.length === 0) return [];

  const countByStudent = new Map<string, number>();
  for (const a of attendance.filter(isAttended)) {
    countByStudent.set(a.student_id, (countByStudent.get(a.student_id) ?? 0) + 1);
  }

  return students
    .filter((s) => (countByStudent.get(s.id) ?? 0) / sessionDates.length < LOW_ATTENDANCE_THRESHOLD)
    .map((s) => s.name);
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
