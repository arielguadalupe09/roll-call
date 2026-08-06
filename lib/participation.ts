import type { ParticipationLog } from "@/lib/types";

export type ParticipationSummary = { count: number; sum: number; avg: number | null };

export function summarizeParticipation(
  logs: ParticipationLog[],
): Map<string, ParticipationSummary> {
  const byStudent = new Map<string, ParticipationSummary>();
  for (const log of logs) {
    const entry = byStudent.get(log.student_id) ?? { count: 0, sum: 0, avg: null };
    entry.count += 1;
    if (log.score != null) entry.sum += log.score;
    byStudent.set(log.student_id, entry);
  }
  for (const entry of byStudent.values()) {
    entry.avg = entry.count > 0 ? entry.sum / entry.count : null;
  }
  return byStudent;
}
