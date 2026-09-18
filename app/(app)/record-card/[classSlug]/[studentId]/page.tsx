import { notFound } from "next/navigation";
import { createClient, getTeacherRow } from "@/lib/supabase/server";
import type { ClassRow, GradingConfig, Student } from "@/lib/types";
import { buildRecordCardData, fetchClassGradingData } from "@/lib/record-card-data";
import RecordCardClient from "./record-card-client";

export default async function RecordCardPage({
  params,
}: {
  params: Promise<{ classSlug: string; studentId: string }>;
}) {
  const { classSlug, studentId } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase.from("classes").select("*").eq("slug", classSlug).single();
  if (!classRow) notFound();
  const classId = (classRow as ClassRow).id;

  const [{ data: student }, { data: classmates }, classData] = await Promise.all([
    supabase.from("students").select("*").eq("id", studentId).eq("class_id", classId).single(),
    supabase.from("students").select("id, name").eq("class_id", classId).order("name", { ascending: true }),
    fetchClassGradingData(supabase, classId),
  ]);

  if (!student) notFound();

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
