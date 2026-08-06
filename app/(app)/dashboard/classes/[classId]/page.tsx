import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClassRow, Student } from "@/lib/types";
import StudentsManager from "./students-manager";
import SubjectEditor from "./subject-editor";

export default async function ClassDetailPage({
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

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .eq("class_id", classId)
    .order("name", { ascending: true });

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name}
        </h1>
        <SubjectEditor
          classId={classId}
          initialSubject={(classRow as ClassRow).subject}
        />

        <StudentsManager
          classId={classId}
          initialStudents={(students as Student[] | null) ?? []}
        />
      </div>
    </div>
  );
}
