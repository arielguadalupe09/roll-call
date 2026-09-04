import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, ClassRow, GradingConfig, Student } from "@/lib/types";
import AssignmentsClient from "./assignments-client";

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (!classRow || !user) notFound();

  const { data: links } = await supabase
    .from("assignment_classes")
    .select("assignment_id")
    .eq("class_id", classId);
  const linkedIds = (links as { assignment_id: string }[] | null)?.map((l) => l.assignment_id) ?? [];

  const [{ data: assignments }, { data: config }, { data: teacherClasses }] = await Promise.all([
    linkedIds.length
      ? supabase.from("assignments").select("*").in("id", linkedIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Assignment[] }),
    supabase.from("grading_configs").select("*").eq("class_id", classId).single(),
    supabase
      .from("classes")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);

  const teacherClassIds = (teacherClasses as ClassRow[] | null)?.map((c) => c.id) ?? [];
  const { data: allStudents } = teacherClassIds.length
    ? await supabase
        .from("students")
        .select("*")
        .in("class_id", teacherClassIds)
        .order("name", { ascending: true })
    : { data: [] as Student[] };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <AssignmentsClient
          classId={classId}
          teacherId={user.id}
          teacherClasses={(teacherClasses as ClassRow[] | null) ?? []}
          allStudents={(allStudents as Student[] | null) ?? []}
          initialAssignments={(assignments as Assignment[] | null) ?? []}
          usePrelims={(config as GradingConfig | null)?.use_prelims ?? false}
        />
      </div>
    </div>
  );
}
