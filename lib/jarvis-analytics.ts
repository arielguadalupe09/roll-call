import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";
import {
  computeClassStats,
  computeInsights,
  lowAttendanceStudentNames,
  LOW_ATTENDANCE_THRESHOLD,
  type ClassStats,
} from "@/lib/dashboard-insights";
import type { AnalyticsQuestion } from "@/lib/voice-commands";

export type AnalyticsScope =
  | {
      kind: "class";
      classRow: ClassRow;
      students: Student[];
      attendance: Attendance[];
      gradingConfig: GradingConfig | null;
    }
  | { kind: "all"; stats: ClassStats[] };

const THRESHOLD_PCT = Math.round(LOW_ATTENDANCE_THRESHOLD * 100);

function formatForClass(
  question: AnalyticsQuestion,
  scope: Extract<AnalyticsScope, { kind: "class" }>,
): string {
  const { classRow, students, attendance, gradingConfig } = scope;
  const stats = computeClassStats(classRow, students, attendance, gradingConfig);

  switch (question) {
    case "overview": {
      const lines: string[] = [];
      if (stats.attendanceRate == null) {
        lines.push(`No attendance recorded yet for ${classRow.name}.`);
      } else {
        const pct = Math.round(stats.attendanceRate * 100);
        const trend = stats.weekTrend
          ? ` (${Math.round(stats.weekTrend.previous * 100)}% → ${Math.round(stats.weekTrend.current * 100)}% this week)`
          : "";
        lines.push(`${classRow.name}: ${pct}% average attendance${trend}.`);
      }
      lines.push(
        `${stats.studentCount} student${stats.studentCount === 1 ? "" : "s"}, ${
          stats.lowAttendanceStudentCount
        } below ${THRESHOLD_PCT}%.`,
      );
      const warnings = computeInsights([stats]).filter((i) => i.severity === "warning");
      lines.push(warnings.length > 0 ? warnings.map((w) => w.text).join(" ") : "No warnings.");
      return lines.join("\n");
    }
    case "low-attendance": {
      const names = lowAttendanceStudentNames(students, attendance);
      if (names.length === 0) {
        return `Nobody in ${classRow.name} is below ${THRESHOLD_PCT}% attendance.`;
      }
      return `${names.length} student${names.length === 1 ? "" : "s"} below ${THRESHOLD_PCT}% attendance in ${
        classRow.name
      }: ${names.join(", ")}.`;
    }
    case "warnings": {
      const warnings = computeInsights([stats]).filter((i) => i.severity === "warning");
      if (warnings.length === 0) return `No warnings for ${classRow.name}.`;
      return warnings.map((w) => w.text).join(" ");
    }
  }
}

function formatForAll(question: AnalyticsQuestion, stats: ClassStats[]): string {
  if (stats.length === 0) return "You don't have any classes yet.";

  switch (question) {
    case "overview": {
      const lines: string[] = [];
      const rates = stats.map((s) => s.attendanceRate).filter((r): r is number => r != null);
      const totalStudents = stats.reduce((sum, s) => sum + s.studentCount, 0);
      const totalLow = stats.reduce((sum, s) => sum + s.lowAttendanceStudentCount, 0);
      if (rates.length === 0) {
        lines.push(`You have ${stats.length} class${stats.length === 1 ? "" : "es"}, but no attendance recorded yet.`);
      } else {
        const avg = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100);
        lines.push(`Across ${stats.length} class${stats.length === 1 ? "" : "es"}: ${avg}% average attendance.`);
      }
      lines.push(
        `${totalStudents} student${totalStudents === 1 ? "" : "s"} total, ${totalLow} below ${THRESHOLD_PCT}%.`,
      );
      const warnings = computeInsights(stats).filter((i) => i.severity === "warning");
      lines.push(warnings.length > 0 ? warnings.map((w) => w.text).join(" ") : "No warnings.");
      return lines.join("\n");
    }
    case "low-attendance": {
      const flagged = stats.filter((s) => s.lowAttendanceStudentCount > 0);
      if (flagged.length === 0) return "No students are below the attendance threshold in any class.";
      const byClass = flagged.map((s) => `${s.lowAttendanceStudentCount} in ${s.classRow.name}`).join(", ");
      return `${byClass} — below ${THRESHOLD_PCT}% attendance.`;
    }
    case "warnings": {
      const warnings = computeInsights(stats).filter((i) => i.severity === "warning");
      if (warnings.length === 0) return "No warnings across your classes.";
      return warnings.map((w) => w.text).join(" ");
    }
  }
}

export function formatAnalyticsAnswer(question: AnalyticsQuestion, scope: AnalyticsScope): string {
  return scope.kind === "class" ? formatForClass(question, scope) : formatForAll(question, scope.stats);
}
