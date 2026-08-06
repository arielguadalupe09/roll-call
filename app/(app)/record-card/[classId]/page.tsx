import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClassRow, Student, Teacher } from "@/lib/types";
import { buildRecordCardData, fetchClassGradingData } from "@/lib/record-card-data";
import RecordCardAllClient from "./record-card-all-client";

export default async function RecordCardAllPage({
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

  const { data: teacher } = await supabase
    .from("teachers")
    .select("*")
    .eq("id", (classRow as ClassRow).teacher_id)
    .single();

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .eq("class_id", classId)
    .order("name", { ascending: true });

  const classData = await fetchClassGradingData(supabase, classId);
  const allData = ((students as Student[] | null) ?? []).map((student) =>
    buildRecordCardData(student, classData),
  );

  return (
    <RecordCardAllClient
      classRow={classRow as ClassRow}
      teacher={teacher as Teacher | null}
      allData={allData}
    />
  );
}
