"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayLocalDate } from "@/lib/date";
import type { Attendance, AttendanceStatus, Student } from "@/lib/types";

const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "excused", "late"];

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; full: string; active: string; inactive: string }
> = {
  present: {
    label: "P",
    full: "Present",
    active: "bg-teal text-chalk border-teal",
    inactive: "text-teal border-teal/40 hover:bg-teal/10",
  },
  absent: {
    label: "A",
    full: "Absent",
    active: "bg-danger text-chalk border-danger",
    inactive: "text-danger border-danger/40 hover:bg-danger/10",
  },
  excused: {
    label: "E",
    full: "Excused",
    active: "bg-ink text-chalk border-ink",
    inactive: "text-ink/70 border-ink/30 hover:bg-ink/5",
  },
  late: {
    label: "L",
    full: "Late",
    active: "bg-brass text-chalk border-brass",
    inactive: "text-brass border-brass/40 hover:bg-brass/10",
  },
};

export default function ManualAttendanceClient({
  classId,
  students,
  initialAttendance,
}: {
  classId: string;
  students: Student[];
  initialAttendance: Attendance[];
}) {
  const [date, setDate] = useState(todayLocalDate());
  const [attendance, setAttendance] = useState(initialAttendance);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const byStudent = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const a of attendance) {
      if (a.date === date) map.set(a.student_id, a);
    }
    return map;
  }, [attendance, date]);

  const recordsForDate = useMemo(
    () => attendance.filter((a) => a.date === date),
    [attendance, date],
  );

  async function clearDay() {
    if (recordsForDate.length === 0) return;
    const confirmed = window.confirm(
      `Delete all ${recordsForDate.length} attendance record(s) for ${date}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setClearing(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("class_id", classId)
      .eq("date", date);

    setClearing(false);

    if (error) {
      window.alert(error.message);
      return;
    }

    setAttendance((prev) => prev.filter((a) => a.date !== date));
  }

  async function markStatus(studentId: string, status: AttendanceStatus) {
    setSavingId(studentId);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("attendance")
      .upsert(
        { class_id: classId, student_id: studentId, date, method: "manual", status },
        { onConflict: "class_id,student_id,date" },
      )
      .select()
      .single();

    setSavingId(null);

    if (error) {
      window.alert(error.message);
      return;
    }

    const saved = data as Attendance;
    setAttendance((prev) => {
      const withoutThis = prev.filter(
        (a) => !(a.student_id === studentId && a.date === date),
      );
      return [...withoutThis, saved];
    });
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink/70">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 font-mono text-ink outline-none focus:border-brass"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink/60">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${STATUS_CONFIG[s].active}`}
              >
                {STATUS_CONFIG[s].label}
              </span>
              {STATUS_CONFIG[s].full}
            </span>
          ))}
        </div>
        <button
          onClick={clearDay}
          disabled={clearing || recordsForDate.length === 0}
          className="ml-auto rounded-sm border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
        >
          {clearing ? "Clearing…" : `Clear attendance for ${date}`}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-sm border border-rule">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule bg-white font-mono text-xs uppercase tracking-wide text-ink/60">
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const current = byStudent.get(s.id);
              return (
                <tr key={s.id} className="border-b border-rule/50 bg-white">
                  <td className="py-2 px-3 text-ink">{s.name}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2">
                      {STATUS_ORDER.map((status) => {
                        const isActive = current?.status === status;
                        return (
                          <button
                            key={status}
                            onClick={() => markStatus(s.id, status)}
                            disabled={savingId === s.id}
                            title={STATUS_CONFIG[status].full}
                            className={`flex h-8 w-8 items-center justify-center rounded-full border font-mono text-xs font-bold transition disabled:opacity-40 ${
                              isActive ? STATUS_CONFIG[status].active : STATUS_CONFIG[status].inactive
                            }`}
                          >
                            {STATUS_CONFIG[status].label}
                          </button>
                        );
                      })}
                    </div>
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
    </div>
  );
}
