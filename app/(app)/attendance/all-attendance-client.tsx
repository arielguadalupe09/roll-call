"use client";

import { useMemo, useState } from "react";
import type { Attendance, AttendanceStatus } from "@/lib/types";

type Row = { attendance: Attendance; studentName: string; className: string };

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  excused: "E",
  late: "L",
};

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  present: "bg-teal/20 text-teal",
  absent: "bg-danger/20 text-danger",
  excused: "bg-ink/10 text-ink/70",
  late: "bg-brass/20 text-brass",
};

const METHOD_LABEL: Record<Attendance["method"], string> = {
  scan: "Scanned",
  self: "Self check-in",
  manual: "Manual entry",
};

export default function AllAttendanceClient({ rows }: { rows: Row[] }) {
  const dates = useMemo(
    () => Array.from(new Set(rows.map((r) => r.attendance.date))).sort((a, b) => b.localeCompare(a)),
    [rows],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate ?? dates[0] ?? null;

  const [classFilter, setClassFilter] = useState("all");
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.attendance.class_id, r.className);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const dayRows = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.attendance.date === activeDate &&
            (classFilter === "all" || r.attendance.class_id === classFilter),
        )
        .sort((a, b) => a.className.localeCompare(b.className) || a.studentName.localeCompare(b.studentName)),
    [rows, activeDate, classFilter],
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink/70">
          Date
          <select
            value={activeDate ?? ""}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={dates.length === 0}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 font-mono text-ink outline-none focus:border-brass disabled:opacity-60"
          >
            {dates.length === 0 && <option value="">No dates yet</option>}
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          Class
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 text-ink outline-none focus:border-brass"
          >
            <option value="all">All classes</option>
            {classOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-sm border border-rule">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule bg-white font-mono text-xs uppercase tracking-wide text-ink/60">
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3">Class</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Time</th>
              <th className="py-2 px-3">Method</th>
            </tr>
          </thead>
          <tbody>
            {dayRows.map((r) => (
              <tr key={r.attendance.id} className="border-b border-rule/50 bg-white">
                <td className="py-2 px-3 text-ink">{r.studentName}</td>
                <td className="py-2 px-3 text-ink/70">{r.className}</td>
                <td className="py-2 px-3">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold ${STATUS_CLASS[r.attendance.status]}`}
                  >
                    {STATUS_LABEL[r.attendance.status]}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-xs text-ink/60">
                  {new Date(r.attendance.recorded_at).toLocaleTimeString()}
                </td>
                <td className="py-2 px-3">
                  <span className="inline-block rounded-full bg-ink/10 px-2 py-0.5 font-mono text-xs font-semibold text-ink/70">
                    {METHOD_LABEL[r.attendance.method]}
                  </span>
                </td>
              </tr>
            ))}
            {dayRows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 px-3 text-ink/60">
                  {rows.length === 0 ? "No attendance recorded yet." : "No records match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
