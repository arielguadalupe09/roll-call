"use client";

import { useMemo } from "react";
import type { GradingConfig, ParticipationLog, Student } from "@/lib/types";

function summarize(logs: ParticipationLog[], students: Student[]) {
  const byStudent = new Map<string, { sum: number; count: number }>();
  for (const s of students) byStudent.set(s.id, { sum: 0, count: 0 });
  for (const log of logs) {
    if (log.score == null) continue;
    const entry = byStudent.get(log.student_id);
    if (!entry) continue;
    entry.sum += log.score;
    entry.count += 1;
  }
  return byStudent;
}

function SummaryTable({
  title,
  logs,
  students,
}: {
  title: string;
  logs: ParticipationLog[];
  students: Student[];
}) {
  const summary = useMemo(() => summarize(logs, students), [logs, students]);

  return (
    <div className="rounded-sm border border-rule bg-white p-4">
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      <div className="mt-3 overflow-x-auto rounded-sm border border-rule">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3">Taps</th>
              <th className="py-2 px-3">Average (/5)</th>
              <th className="py-2 px-3">Normalized (%)</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const entry = summary.get(s.id) ?? { sum: 0, count: 0 };
              const avg = entry.count > 0 ? entry.sum / entry.count : null;
              return (
                <tr key={s.id} className="border-b border-rule/50 bg-white">
                  <td className="py-2 px-3 text-ink">{s.name}</td>
                  <td className="py-2 px-3 font-mono text-ink">{entry.count}</td>
                  <td className="py-2 px-3 font-mono text-ink">
                    {avg != null ? avg.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 px-3 font-mono text-ink">
                    {avg != null ? `${((avg / 5) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 px-3 text-ink/60">
                  No students in this class yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RecitationTab({
  students,
  initialLogs,
  config,
}: {
  students: Student[];
  initialLogs: ParticipationLog[];
  config: GradingConfig;
}) {
  const recitationLogs = useMemo(
    () => initialLogs.filter((l) => l.type === "recitation"),
    [initialLogs],
  );

  const cutoff = config.midterm_end_date;

  if (!cutoff) {
    return (
      <div className="mt-6">
        <p className="mb-4 rounded-sm border border-brass bg-brass/10 px-3 py-2 text-sm text-ink">
          Set a midterm end date in Setup to split recitation scores into
          Midterm and Finals. Showing combined totals for now.
        </p>
        <SummaryTable
          title="Recitation (all terms)"
          logs={recitationLogs}
          students={students}
        />
      </div>
    );
  }

  const midtermLogs = recitationLogs.filter((l) => l.date <= cutoff);
  const finalsLogs = recitationLogs.filter((l) => l.date > cutoff);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <SummaryTable title="Midterm" logs={midtermLogs} students={students} />
      <SummaryTable title="Finals" logs={finalsLogs} students={students} />
    </div>
  );
}
