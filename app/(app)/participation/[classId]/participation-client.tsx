"use client";

import { useMemo, useState } from "react";
import type { ParticipationLog, ParticipationType, Student } from "@/lib/types";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";

export default function ParticipationClient({
  students,
  initialLogs,
}: {
  classId: string;
  students: Student[];
  initialLogs: ParticipationLog[];
}) {
  const [type, setType] = useState<ParticipationType>("recitation");
  const logs = useMemo(
    () => initialLogs.filter((l) => l.type === type),
    [initialLogs, type],
  );

  const useLabelColumns = type === "activity" && logs.some((l) => l.label);
  const columns = useMemo(() => {
    if (useLabelColumns) {
      return Array.from(
        new Set(logs.filter((l) => l.label).map((l) => l.label as string)),
      ).sort();
    }
    return Array.from(new Set(logs.map((l) => l.date))).sort();
  }, [logs, useLabelColumns]);

  const cells = useMemo(() => {
    const map = new Map<string, { count: number; scoreSum: number; scoreCount: number }>();
    for (const log of logs) {
      const col = useLabelColumns ? log.label : log.date;
      if (!col) continue;
      const key = `${log.student_id}_${col}`;
      const entry = map.get(key) ?? { count: 0, scoreSum: 0, scoreCount: 0 };
      entry.count += 1;
      if (log.score != null) {
        entry.scoreSum += log.score;
        entry.scoreCount += 1;
      }
      map.set(key, entry);
    }
    return map;
  }, [logs, useLabelColumns]);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-ink">
            Participation
          </h1>
          <div className="flex gap-1 rounded-sm border border-line p-1">
            {(["recitation", "activity"] as ParticipationType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-sm px-3 py-1.5 text-sm transition ${
                  type === t
                    ? "bg-gold text-navy font-semibold"
                    : "text-muted hover:bg-slate-light"
                }`}
              >
                {t === "recitation" ? "Recitation" : "Activity"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-ink/60">
          Tally of {type === "recitation" ? "recitation" : "activity"} scans
          {useLabelColumns ? ", grouped by activity" : ", by date"}.
        </p>

        <div className="mt-6">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="sticky left-0 bg-navy">Student</TableHeaderCell>
                {columns.map((c) => (
                  <TableHeaderCell key={c} align="center">
                    {c}
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id} striped>
                  <TableCell className="sticky left-0 bg-card">{s.name}</TableCell>
                  {columns.map((c) => {
                    const cell = cells.get(`${s.id}_${c}`);
                    return (
                      <TableCell key={c} align="center" tabular>
                        {cell && cell.count > 0 ? (
                          <>
                            <span className="font-semibold text-gold">
                              {cell.count}
                            </span>
                            {cell.scoreCount > 0 && (
                              <span className="ml-1 text-xs text-ink/60">
                                avg {(cell.scoreSum / cell.scoreCount).toFixed(1)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-ink/20">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={1 + columns.length} className="py-4">
                    No students in this class yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {columns.length === 0 && (
            <p className="mt-3 text-ink/60">
              No {type} scans recorded yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
