import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, ParticipationLog, Student } from "@/lib/types";
import RecordsClient from "./records-client";

export default async function RecordsPage({
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

  const [{ data: students }, { data: attendance }, { data: participation }] =
    await Promise.all([
      supabase
        .from("students")
        .select("*")
        .eq("class_id", classId)
        .order("name", { ascending: true }),
      supabase
        .from("attendance")
        .select("*")
        .eq("class_id", classId)
        .order("date", { ascending: true }),
      supabase
        .from("participation_logs")
        .select("*")
        .eq("class_id", classId)
        .order("date", { ascending: true }),
    ]);

  return (
    <RecordsClient
      classId={classId}
      className={classRow.name}
      students={(students as Student[] | null) ?? []}
      initialAttendance={(attendance as Attendance[] | null) ?? []}
      initialParticipation={(participation as ParticipationLog[] | null) ?? []}
    />
  );
}
