import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClassRow, Student, Teacher } from "@/lib/types";
import StudentsManager from "./students-manager";
import SubjectEditor from "./subject-editor";
import ClassRecordInfoForm from "./class-record-info-form";
import ArchiveButton from "../../archive-button";

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

  const [{ data: students }, { data: teacher }] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("name", { ascending: true }),
    supabase
      .from("teachers")
      .select("*")
      .eq("id", (classRow as ClassRow).teacher_id)
      .single(),
  ]);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-ink">
            {classRow.name}
          </h1>
          <ArchiveButton
            classId={classId}
            name={classRow.name}
            archived={(classRow as ClassRow).archived}
          />
        </div>
        <SubjectEditor
          classId={classId}
          initialSubject={(classRow as ClassRow).subject}
        />
        <ClassRecordInfoForm
          classId={classId}
          initialClass={classRow as ClassRow}
          initialFacultyRank={(teacher as Teacher | null)?.faculty_rank ?? null}
        />

        <StudentsManager
          classId={classId}
          initialStudents={(students as Student[] | null) ?? []}
        />
      </div>
    </div>
  );
}
