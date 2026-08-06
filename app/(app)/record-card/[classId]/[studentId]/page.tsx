import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClassRow, Student, Teacher } from "@/lib/types";
import { buildRecordCardData, fetchClassGradingData } from "@/lib/record-card-data";
import RecordCardClient from "./record-card-client";

export default async function RecordCardPage({
  params,
}: {
  params: Promise<{ classId: string; studentId: string }>;
}) {
  const { classId, studentId } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("id", studentId)
    .eq("class_id", classId)
    .single();

  if (!classRow || !student) notFound();

  const { data: teacher } = await supabase
    .from("teachers")
    .select("*")
    .eq("id", (classRow as ClassRow).teacher_id)
    .single();

  const classData = await fetchClassGradingData(supabase, classId);
  const data = buildRecordCardData(student as Student, classData);

  return (
    <RecordCardClient
      classRow={classRow as ClassRow}
      teacher={teacher as Teacher | null}
      data={data}
    />
  );
}
