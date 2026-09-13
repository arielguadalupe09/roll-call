import { notFound } from "next/navigation";
import { createClient, getTeacherRow } from "@/lib/supabase/server";
import type { ClassRow, GradingConfig, Student } from "@/lib/types";
import { buildRecordCardData, fetchClassGradingData } from "@/lib/record-card-data";
import RecordCardClient from "./record-card-client";

export default async function RecordCardPage({
  params,
}: {
  params: Promise<{ classId: string; studentId: string }>;
}) {
  const { classId, studentId } = await params;
  const supabase = await createClient();

  const [{ data: classRow }, { data: student }, { data: classmates }, classData] = await Promise.all([
    supabase.from("classes").select("*").eq("id", classId).single(),
    supabase.from("students").select("*").eq("id", studentId).eq("class_id", classId).single(),
    supabase.from("students").select("id, name").eq("class_id", classId).order("name", { ascending: true }),
    fetchClassGradingData(supabase, classId),
  ]);

  if (!classRow || !student) notFound();

  const roster = (classmates as { id: string; name: string }[] | null) ?? [];
  const currentIndex = roster.findIndex((s) => s.id === studentId);
  const previousStudent = currentIndex > 0 ? roster[currentIndex - 1] : null;
  const nextStudent =
    currentIndex >= 0 && currentIndex < roster.length - 1 ? roster[currentIndex + 1] : null;

  const teacher = await getTeacherRow((classRow as ClassRow).teacher_id);

  const logoUrl = teacher?.card_logo_path
    ? ((await supabase.storage.from("card-logos").createSignedUrl(teacher.card_logo_path, 3600)).data
        ?.signedUrl ?? null)
    : null;

  const data = buildRecordCardData(student as Student, classData);

  return (
    <RecordCardClient
      classId={classId}
      classRow={classRow as ClassRow}
      teacher={teacher}
      data={data}
      config={classData.config as GradingConfig}
      logoUrl={logoUrl}
      previousStudent={previousStudent}
      nextStudent={nextStudent}
    />
  );
}
