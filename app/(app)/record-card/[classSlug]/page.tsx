import { notFound } from "next/navigation";
import { createClient, getTeacherRow } from "@/lib/supabase/server";
import type { ClassRow, GradingConfig, Student } from "@/lib/types";
import { buildRecordCardData, fetchClassGradingData } from "@/lib/record-card-data";
import RecordCardAllClient from "./record-card-all-client";

export default async function RecordCardAllPage({
  params,
}: {
  params: Promise<{ classSlug: string }>;
}) {
  const { classSlug } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("slug", classSlug)
    .single();

  if (!classRow) notFound();
  const classId = (classRow as ClassRow).id;

  const [teacher, { data: students }, classData] = await Promise.all([
    getTeacherRow((classRow as ClassRow).teacher_id),
    supabase.from("students").select("*").eq("class_id", classId).order("name", { ascending: true }),
    fetchClassGradingData(supabase, classId),
  ]);

  const logoUrl = teacher?.card_logo_path
    ? ((await supabase.storage.from("card-logos").createSignedUrl(teacher.card_logo_path, 3600)).data
        ?.signedUrl ?? null)
    : null;

  const allData = ((students as Student[] | null) ?? []).map((student) =>
    buildRecordCardData(student, classData),
  );

  return (
    <RecordCardAllClient
      classRow={classRow as ClassRow}
      teacher={teacher}
      allData={allData}
      config={classData.config as GradingConfig}
      logoUrl={logoUrl}
    />
  );
}
