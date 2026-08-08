import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClassRow, GradingConfig, Student, Teacher } from "@/lib/types";
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

  const { data: teacherRow } = await supabase
    .from("teachers")
    .select("*")
    .eq("id", (classRow as ClassRow).teacher_id)
    .single();

  const teacher = teacherRow as Teacher | null;

  let logoUrl: string | null = null;
  if (teacher?.card_logo_path) {
    const { data: signed } = await supabase.storage
      .from("card-logos")
      .createSignedUrl(teacher.card_logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  const classData = await fetchClassGradingData(supabase, classId);
  const data = buildRecordCardData(student as Student, classData);

  return (
    <RecordCardClient
      classRow={classRow as ClassRow}
      teacher={teacher}
      data={data}
      config={classData.config as GradingConfig}
      logoUrl={logoUrl}
    />
  );
}
