"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Attendance, AttendanceStatus, ParticipationLog, Student } from "@/lib/types";

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

export default function RecordsClient({
  classId,
  className,
  students,
  initialAttendance,
  initialParticipation,
}: {
  classId: string;
  className: string;
  students: Student[];
  initialAttendance: Attendance[];
  initialParticipation: ParticipationLog[];
}) {
  const [attendance, setAttendance] = useState(initialAttendance);
  const [participation, setParticipation] = useState(initialParticipation);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`records-${classId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          filter: `class_id=eq.${classId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setAttendance((prev) => [...prev, payload.new as Attendance]);
          } else if (payload.eventType === "DELETE") {
            setAttendance((prev) =>
              prev.filter((a) => a.id !== (payload.old as Attendance).id),
            );
          } else if (payload.eventType === "UPDATE") {
            setAttendance((prev) =>
              prev.map((a) =>
                a.id === (payload.new as Attendance).id
                  ? (payload.new as Attendance)
                  : a,
              ),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participation_logs",
          filter: `class_id=eq.${classId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setParticipation((prev) => [
              ...prev,
              payload.new as ParticipationLog,
            ]);
          } else if (payload.eventType === "DELETE") {
            setParticipation((prev) =>
              prev.filter(
                (p) => p.id !== (payload.old as ParticipationLog).id,
              ),
            );
          } else if (payload.eventType === "UPDATE") {
            setParticipation((prev) =>
              prev.map((p) =>
                p.id === (payload.new as ParticipationLog).id
                  ? (payload.new as ParticipationLog)
                  : p,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId]);

  const dates = useMemo(
    () =>
      Array.from(
        new Set([
          ...attendance.map((a) => a.date),
          ...participation.map((p) => p.date),
        ]),
      ).sort((a, b) => b.localeCompare(a)),
    [attendance, participation],
  );

  const activeDate = selectedDate ?? dates[0] ?? null;

  const dayAttendance = useMemo(
    () => attendance.filter((a) => a.date === activeDate),
    [attendance, activeDate],
  );
  const dayRecitation = useMemo(
    () =>
      participation.filter((p) => p.date === activeDate && p.type === "recitation"),
    [participation, activeDate],
  );
  const dayActivity = useMemo(
    () => participation.filter((p) => p.date === activeDate && p.type === "activity"),
    [participation, activeDate],
  );

  const attendanceByStudent = useMemo(
    () => new Map(dayAttendance.map((a) => [a.student_id, a])),
    [dayAttendance],
  );

  function summarizeLogs(logs: ParticipationLog[]) {
    const map = new Map<string, { count: number; scoreSum: number; scoreCount: number; labels: Set<string> }>();
    for (const log of logs) {
      const entry = map.get(log.student_id) ?? {
        count: 0,
        scoreSum: 0,
        scoreCount: 0,
        labels: new Set<string>(),
      };
      entry.count += 1;
      if (log.score != null) {
        entry.scoreSum += log.score;
        entry.scoreCount += 1;
      }
      if (log.label) entry.labels.add(log.label);
      map.set(log.student_id, entry);
    }
    return map;
  }

  const recitationByStudent = useMemo(() => summarizeLogs(dayRecitation), [dayRecitation]);
  const activityByStudent = useMemo(() => summarizeLogs(dayActivity), [dayActivity]);

  function downloadCsv() {
    type Event = {
      studentId: string;
      date: string;
      recordedAt: string;
      type: string;
      detail: string;
    };

    const events: Event[] = [
      ...attendance.map((a) => ({
        studentId: a.student_id,
        date: a.date,
        recordedAt: a.recorded_at,
        type: "attendance",
        detail: a.method,
      })),
      ...participation.map((p) => ({
        studentId: p.student_id,
        date: p.date,
        recordedAt: p.recorded_at,
        type: p.type,
        detail: [p.label, p.score != null ? `score ${p.score}/5` : null]
          .filter(Boolean)
          .join(" — "),
      })),
    ];

    const eventsByStudent = new Map<string, Event[]>();
    for (const e of events) {
      const list = eventsByStudent.get(e.studentId) ?? [];
      list.push(e);
      eventsByStudent.set(e.studentId, list);
    }

    const rows: string[][] = [["Student", "Date", "Time", "Type", "Detail"]];

    for (const s of students) {
      const studentEvents = (eventsByStudent.get(s.id) ?? []).sort((x, y) =>
        x.date === y.date
          ? x.recordedAt.localeCompare(y.recordedAt)
          : x.date.localeCompare(y.date),
      );
      if (studentEvents.length === 0) continue;

      studentEvents.forEach((e, i) => {
        rows.push([
          i === 0 ? s.name : "",
          e.date,
          new Date(e.recordedAt).toLocaleTimeString(),
          e.type,
          e.detail,
        ]);
      });
      rows.push(["", "", "", "", ""]);
    }

    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${className.replace(/\s+/g, "-").toLowerCase()}-attendance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">
              {className} — records
            </h1>
            <p className="mt-1 flex flex-wrap gap-4 text-sm text-ink/70">
              <span>
                <span className="inline-block h-3 w-3 rounded-full bg-brass align-middle" />{" "}
                Teacher scan
              </span>
              <span>
                <span className="inline-block h-3 w-3 rounded-full bg-teal align-middle" />{" "}
                Self check-in
              </span>
            </p>
            <p className="mt-2 flex flex-wrap gap-3 text-xs text-ink/60">
              {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((status) => (
                <span key={status} className="flex items-center gap-1">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] font-bold ${STATUS_CLASS[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                  {status[0].toUpperCase() + status.slice(1)}
                </span>
              ))}
            </p>
          </div>
          <button
            onClick={downloadCsv}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3">
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
        </div>

        {dates.length === 0 ? (
          <p className="mt-6 rounded-sm border border-rule bg-white p-4 text-ink/60">
            No records yet.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="overflow-x-auto rounded-sm border border-rule">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
                    <th className="py-2 px-3">Attendance</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const a = attendanceByStudent.get(s.id);
                    return (
                      <tr key={s.id} className="border-b border-rule/50 bg-white">
                        <td className="py-2 px-3 text-ink">{s.name}</td>
                        <td className="py-2 px-3">
                          {a ? (
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${STATUS_CLASS[a.status]}`}
                            >
                              {STATUS_LABEL[a.status]} —{" "}
                              {a.method === "scan"
                                ? "Scanned"
                                : a.method === "self"
                                  ? "Self check-in"
                                  : "Manual entry"}{" "}
                              at {new Date(a.recorded_at).toLocaleTimeString()}
                            </span>
                          ) : (
                            <span className="text-ink/20">— not marked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-4 px-3 text-ink/60">
                        No students in this class yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-sm border border-rule">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
                    <th className="py-2 px-3">Recitation</th>
                    <th className="py-2 px-3">Taps</th>
                    <th className="py-2 px-3">Avg score (/5)</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const r = recitationByStudent.get(s.id);
                    return (
                      <tr key={s.id} className="border-b border-rule/50 bg-white">
                        <td className="py-2 px-3 text-ink">{s.name}</td>
                        <td className="py-2 px-3 font-mono text-ink">{r?.count ?? 0}</td>
                        <td className="py-2 px-3 font-mono text-ink">
                          {r && r.scoreCount > 0
                            ? (r.scoreSum / r.scoreCount).toFixed(1)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-sm border border-rule">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
                    <th className="py-2 px-3">Activity</th>
                    <th className="py-2 px-3">Label</th>
                    <th className="py-2 px-3">Taps</th>
                    <th className="py-2 px-3">Avg score (/5)</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const act = activityByStudent.get(s.id);
                    return (
                      <tr key={s.id} className="border-b border-rule/50 bg-white">
                        <td className="py-2 px-3 text-ink">{s.name}</td>
                        <td className="py-2 px-3 text-ink/70">
                          {act && act.labels.size > 0
                            ? Array.from(act.labels).join(", ")
                            : "—"}
                        </td>
                        <td className="py-2 px-3 font-mono text-ink">{act?.count ?? 0}</td>
                        <td className="py-2 px-3 font-mono text-ink">
                          {act && act.scoreCount > 0
                            ? (act.scoreSum / act.scoreCount).toFixed(1)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
