import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, Student } from "@/lib/types";
import ManualAttendanceClient from "./manual-attendance-client";

export default async function ManualAttendancePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (!classRow) notFound();

  const [{ data: students }, { data: attendance }] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("name", { ascending: true }),
    supabase.from("attendance").select("*").eq("class_id", classId),
  ]);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — attendance
        </h1>
        <p className="mt-1 text-ink/70">
          Mark attendance manually for a date — useful when a student&apos;s QR
          code won&apos;t scan. Tapping a status saves it immediately.
        </p>

        <ManualAttendanceClient
          classId={classId}
          students={(students as Student[] | null) ?? []}
          initialAttendance={(attendance as Attendance[] | null) ?? []}
        />
      </div>
    </div>
  );
}
