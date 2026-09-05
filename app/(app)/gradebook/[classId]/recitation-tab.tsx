"use client";

import { useMemo, useState } from "react";
import type { GradingConfig, ParticipationLog, Student } from "@/lib/types";
import { summarizeParticipation } from "@/lib/participation";
import { periodForDate } from "@/lib/record-card-data";
import CollapsibleSection from "@/app/_components/collapsible-section";

function SummaryTable({
  title,
  logs,
  students,
}: {
  title: string;
  logs: ParticipationLog[];
  students: Student[];
}) {
  const summary = useMemo(() => summarizeParticipation(logs), [logs]);
  const [showLog, setShowLog] = useState(false);
  const [logDate, setLogDate] = useState<string>("all");

  const logDates = useMemo(
    () => Array.from(new Set(logs.map((l) => l.date))).sort((a, b) => b.localeCompare(a)),
    [logs],
  );

  const filteredLogs = useMemo(
    () => logs.filter((l) => logDate === "all" || l.date === logDate),
    [logs, logDate],
  );

  const logsByStudent = useMemo(() => {
    const map = new Map<string, ParticipationLog[]>();
    for (const log of filteredLogs) {
      const list = map.get(log.student_id) ?? [];
      list.push(log);
      map.set(log.student_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.date === b.date
          ? a.recorded_at.localeCompare(b.recorded_at)
          : a.date.localeCompare(b.date),
      );
    }
    return map;
  }, [filteredLogs]);

  return (
    <CollapsibleSection
      title={title}
      subtitle={`${students.length} students`}
      actions={
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowLog((v) => !v);
          }}
          className="shrink-0 text-sm text-teal underline underline-offset-2"
        >
          {showLog ? "Hide detailed log" : "Show detailed log"}
        </button>
      }
    >
      <div className="overflow-x-auto rounded-2xl border border-rule/60 shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
              {showLog && (
                <th className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <span>Log</span>
                    <select
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                      disabled={logDates.length === 0}
                      className="rounded-sm border border-rule bg-white px-2 py-1 font-mono text-[10px] normal-case tracking-normal text-ink outline-none focus:border-brass disabled:opacity-60"
                    >
                      <option value="all">All recitations</option>
                      {logDates.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              )}
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3">Taps</th>
              <th className="py-2 px-3">Average (/5)</th>
              <th className="py-2 px-3">Normalized (%)</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const entry = summary.get(s.id) ?? { count: 0, sum: 0, avg: null };
              const studentLogs = logsByStudent.get(s.id) ?? [];
              return (
                <tr key={s.id} className="border-b border-rule/50 bg-white align-top">
                  {showLog && (
                    <td className="py-2 px-3 font-mono text-xs text-ink/60">
                      {studentLogs.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {studentLogs.map((log) => (
                            <span key={log.id}>
                              {log.date} · {new Date(log.recorded_at).toLocaleTimeString()} —{" "}
                              {log.score != null ? `${log.score}/5` : "—"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="py-2 px-3 text-ink">{s.name}</td>
                  <td className="py-2 px-3 font-mono text-ink">{entry.count}</td>
                  <td className="py-2 px-3 font-mono text-ink">
                    {entry.avg != null ? entry.avg.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 px-3 font-mono text-ink">
                    {entry.avg != null ? `${((entry.avg / 5) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={showLog ? 5 : 4} className="py-4 px-3 text-ink/60">
                  No students in this class yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
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

  if (!config.use_prelims && !cutoff) {
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

  if (config.use_prelims) {
    const prelimLogs = recitationLogs.filter((l) => periodForDate(l.date, config) === "prelim");
    const midtermLogs = recitationLogs.filter((l) => periodForDate(l.date, config) === "midterm");
    const finalsLogs = recitationLogs.filter((l) => periodForDate(l.date, config) === "finals");

    return (
      <div className="mt-6 flex flex-col gap-4">
        <SummaryTable title="Prelims" logs={prelimLogs} students={students} />
        <SummaryTable title="Midterm" logs={midtermLogs} students={students} />
        <SummaryTable title="Finals" logs={finalsLogs} students={students} />
      </div>
    );
  }

  const midtermLogs = recitationLogs.filter((l) => l.date <= (cutoff as string));
  const finalsLogs = recitationLogs.filter((l) => l.date > (cutoff as string));

  return (
    <div className="mt-6 flex flex-col gap-4">
      <SummaryTable title="Midterm" logs={midtermLogs} students={students} />
      <SummaryTable title="Finals" logs={finalsLogs} students={students} />
    </div>
  );
}
