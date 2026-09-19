"use client";

import { useMemo, useState } from "react";
import type { Attendance, AttendanceStatus } from "@/lib/types";
import { Select } from "@/app/_components/input";
import { TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";
import { GradebookTable } from "@/app/_components/gradebook-table";
import { StatusPill, type StatusTone } from "@/app/_components/status-pill";
import { StatCard } from "@/app/_components/stat-card";
import { TileIcon } from "@/app/_components/tile-icon";
import { formatTime12h } from "@/lib/time-format";

type Row = { attendance: Attendance; studentName: string; className: string };

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
  late: "Late",
};

const STATUS_TONE: Record<AttendanceStatus, StatusTone> = {
  present: "success",
  absent: "danger",
  excused: "neutral",
  late: "warning",
};

const STATUS_ICON: Record<AttendanceStatus, string> = {
  present: "M3 8.5 6.5 12 13 4.5",
  late: "M8 4v4.3l2.8 1.7M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z",
  excused: "M3.5 2.5h9v11l-4.5-2.3-4.5 2.3v-11z",
  absent: "M4 4l8 8M12 4l-8 8",
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

  const countByStatus = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { present: 0, absent: 0, excused: 0, late: 0 };
    for (const r of dayRows) counts[r.attendance.status] += 1;
    return counts;
  }, [dayRows]);

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((status) => (
          <StatCard
            key={status}
            label={STATUS_LABEL[status]}
            icon={<TileIcon path={STATUS_ICON[status]} tone={STATUS_TONE[status]} />}
            figure={{ kind: "number", value: countByStatus[status], mono: true }}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted">
          Date
          <Select
            value={activeDate ?? ""}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={dates.length === 0}
            className="!w-auto"
          >
            {dates.length === 0 && <option value="">No dates yet</option>}
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Class
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="!w-auto"
          >
            <option value="all">All classes</option>
            {classOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mt-4">
        <GradebookTable title="Attendance log" description="Every scan and check-in for the selected date.">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Student</TableHeaderCell>
              <TableHeaderCell>Class</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Time</TableHeaderCell>
              <TableHeaderCell>Method</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dayRows.map((r) => (
              <TableRow key={r.attendance.id} striped>
                <TableCell>{r.studentName}</TableCell>
                <TableCell className="text-muted">{r.className}</TableCell>
                <TableCell>
                  <StatusPill tone={STATUS_TONE[r.attendance.status]}>
                    {STATUS_LABEL[r.attendance.status]}
                  </StatusPill>
                </TableCell>
                <TableCell tabular className="text-muted">
                  {formatTime12h(r.attendance.recorded_at, { seconds: true })}
                </TableCell>
                <TableCell>
                  <StatusPill tone="neutral">{METHOD_LABEL[r.attendance.method]}</StatusPill>
                </TableCell>
              </TableRow>
            ))}
            {dayRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-muted">
                  {rows.length === 0 ? "No attendance recorded yet." : "No records match your filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </GradebookTable>
      </div>
    </div>
  );
}
