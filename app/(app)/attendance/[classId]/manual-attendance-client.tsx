"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayLocalDate } from "@/lib/date";
import type { Attendance, AttendanceStatus, Student } from "@/lib/types";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";

const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "excused", "late"];

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; full: string; active: string; inactive: string }
> = {
  present: {
    label: "P",
    full: "Present",
    active: "bg-success text-card border-success",
    inactive: "text-success-text border-success/40 hover:bg-success/10",
  },
  absent: {
    label: "A",
    full: "Absent",
    active: "bg-danger text-card border-danger",
    inactive: "text-danger border-danger/40 hover:bg-danger/10",
  },
  excused: {
    label: "E",
    full: "Excused",
    active: "bg-ink text-card border-ink",
    inactive: "text-muted border-line hover:bg-slate-light",
  },
  late: {
    label: "L",
    full: "Late",
    active: "bg-warning text-navy border-warning",
    inactive: "text-warning-text border-warning/40 hover:bg-warning/10",
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
  const [markingAll, setMarkingAll] = useState(false);
  const { showToast } = useToast();
  const confirm = useConfirm();

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

  const unmarkedStudents = useMemo(
    () => students.filter((s) => !byStudent.has(s.id)),
    [students, byStudent],
  );

  async function markRemainingPresent() {
    if (unmarkedStudents.length === 0) return;
    setMarkingAll(true);
    const supabase = createClient();

    const payload = unmarkedStudents.map((s) => ({
      class_id: classId,
      student_id: s.id,
      date,
      method: "manual" as const,
      status: "present" as const,
    }));

    const { data, error } = await supabase
      .from("attendance")
      .upsert(payload, { onConflict: "class_id,student_id,date" })
      .select();

    setMarkingAll(false);

    if (error) {
      showToast(error.message);
      return;
    }

    setAttendance((prev) => [...prev, ...(data as Attendance[])]);
  }

  async function clearDay() {
    if (recordsForDate.length === 0) return;
    const confirmed = await confirm(
      `Delete all ${recordsForDate.length} attendance record(s) for ${date}? This cannot be undone.`,
      { danger: true, confirmLabel: "Delete" },
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
      showToast(error.message);
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
      showToast(error.message);
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
        <label className="flex items-center gap-2 text-sm text-muted">
          Date
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
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
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={markRemainingPresent}
            disabled={markingAll || unmarkedStudents.length === 0}
          >
            {markingAll
              ? "Marking…"
              : `Mark ${unmarkedStudents.length} remaining as Present`}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={clearDay}
            disabled={clearing || recordsForDate.length === 0}
          >
            {clearing ? "Clearing…" : `Clear attendance for ${date}`}
          </Button>
        </div>
      </div>

      <Table className="mt-4">
        <TableHead>
          <TableRow>
            <TableHeaderCell>Student</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {students.map((s) => {
            const current = byStudent.get(s.id);
            return (
              <TableRow key={s.id} striped>
                <TableCell>{s.name}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {STATUS_ORDER.map((status) => {
                      const isActive = current?.status === status;
                      return (
                        <button
                          key={status}
                          onClick={() => markStatus(s.id, status)}
                          disabled={savingId === s.id}
                          title={STATUS_CONFIG[status].full}
                          className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition disabled:opacity-40 ${
                            isActive ? STATUS_CONFIG[status].active : STATUS_CONFIG[status].inactive
                          }`}
                        >
                          {STATUS_CONFIG[status].label}
                        </button>
                      );
                    })}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {students.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="py-4 text-muted">No students in this class yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
