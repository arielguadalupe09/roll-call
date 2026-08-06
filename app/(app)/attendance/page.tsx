import { createClient } from "@/lib/supabase/server";
import type { Attendance, ClassRow, Student } from "@/lib/types";
import AllAttendanceClient from "./all-attendance-client";

export default async function AllAttendancePage() {
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .order("name", { ascending: true });

  const classList = (classes as ClassRow[] | null) ?? [];
  const classIds = classList.map((c) => c.id);

  const [{ data: students }, { data: attendance }] = classIds.length
    ? await Promise.all([
        supabase.from("students").select("*").in("class_id", classIds),
        supabase.from("attendance").select("*").in("class_id", classIds),
      ])
    : [{ data: [] as Student[] }, { data: [] as Attendance[] }];

  const classById = new Map(classList.map((c) => [c.id, c]));
  const studentById = new Map(((students as Student[] | null) ?? []).map((s) => [s.id, s]));

  const rows = ((attendance as Attendance[] | null) ?? []).map((a) => ({
    attendance: a,
    studentName: studentById.get(a.student_id)?.name ?? "Unknown student",
    className: classById.get(a.class_id)?.name ?? "Unknown class",
  }));

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          All attendance
        </h1>
        <p className="mt-1 text-ink/70">
          A combined log across all of your classes. For per-class attendance
          sheets and CSV export, open a class&apos;s Records tab.
        </p>

        <AllAttendanceClient rows={rows} />
      </div>
    </div>
  );
}
