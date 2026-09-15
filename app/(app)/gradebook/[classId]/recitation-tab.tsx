"use client";

import { useMemo, useState } from "react";
import type { GradingConfig, ParticipationLog, Student } from "@/lib/types";
import { summarizeParticipation } from "@/lib/participation";
import { periodForDate } from "@/lib/record-card-data";
import CollapsibleSection from "@/app/_components/collapsible-section";
import { Select } from "@/app/_components/input";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";

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
          className="shrink-0 text-sm text-slate underline underline-offset-2"
        >
          {showLog ? "Hide detailed log" : "Show detailed log"}
        </button>
      }
    >
      <Table>
        <TableHead>
          <TableRow>
            {showLog && (
              <TableHeaderCell>
                <div className="flex items-center gap-2">
                  <span>Log</span>
                  <Select
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    disabled={logDates.length === 0}
                    className="!w-auto !py-1 text-xs"
                  >
                    <option value="all">All recitations</option>
                    {logDates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
              </TableHeaderCell>
            )}
            <TableHeaderCell>Student</TableHeaderCell>
            <TableHeaderCell>Taps</TableHeaderCell>
            <TableHeaderCell>Average (/5)</TableHeaderCell>
            <TableHeaderCell>Normalized (%)</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {students.map((s) => {
            const entry = summary.get(s.id) ?? { count: 0, sum: 0, avg: null };
            const studentLogs = logsByStudent.get(s.id) ?? [];
            return (
              <TableRow key={s.id} striped className="align-top">
                {showLog && (
                  <TableCell tabular className="text-xs text-muted">
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
                  </TableCell>
                )}
                <TableCell>{s.name}</TableCell>
                <TableCell tabular>{entry.count}</TableCell>
                <TableCell tabular>{entry.avg != null ? entry.avg.toFixed(1) : "—"}</TableCell>
                <TableCell tabular>
                  {entry.avg != null ? `${((entry.avg / 5) * 100).toFixed(1)}%` : "—"}
                </TableCell>
              </TableRow>
            );
          })}
          {students.length === 0 && (
            <TableRow>
              <TableCell colSpan={showLog ? 5 : 4} className="py-4 text-muted">
                No students in this class yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
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
        <p className="mb-4 rounded-sm border border-gold/40 bg-gold-soft px-3 py-2 text-sm text-ink">
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
