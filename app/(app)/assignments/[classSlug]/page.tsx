import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Assignment, ClassRow, GradingConfig, Student } from "@/lib/types";
import AssignmentsClient from "./assignments-client";

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ classSlug: string }>;
}) {
  const { classSlug } = await params;
  const supabase = await createClient();

  // getUser() and the classRow-by-slug lookup don't depend on each other --
  // run them together. The assignment_classes link query needs the real
  // classId the slug resolves to, so it can't join this Promise.all.
  const [
    {
      data: { user },
    },
    { data: classRow },
  ] = await Promise.all([
    getUser(),
    supabase.from("classes").select("*").eq("slug", classSlug).single(),
  ]);

  if (!classRow || !user) notFound();
  const classId = (classRow as ClassRow).id;

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

  // submissions only needs linkedIds (already resolved above), not
  // allStudents -- run them together instead of serializing one after
  // the other.
  const [{ data: allStudents }, { data: submissions }] = await Promise.all([
    teacherClassIds.length
      ? supabase
          .from("students")
          .select("*")
          .in("class_id", teacherClassIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as Student[] }),
    linkedIds.length
      ? supabase
          .from("submissions")
          .select("assignment_id, student_id, status")
          .in("assignment_id", linkedIds)
      : Promise.resolve({ data: [] as { assignment_id: string; student_id: string; status: string }[] }),
  ]);

  const studentsInThisClass = new Set(
    ((allStudents as Student[] | null) ?? [])
      .filter((s) => s.class_id === classId)
      .map((s) => s.id),
  );

  const submissionCounts: Record<string, { submitted: number; total: number }> = {};
  for (const row of submissions ?? []) {
    if (!studentsInThisClass.has(row.student_id)) continue;
    const counts = submissionCounts[row.assignment_id] ?? { submitted: 0, total: 0 };
    counts.total += 1;
    if (row.status !== "missing") counts.submitted += 1;
    submissionCounts[row.assignment_id] = counts;
  }

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <AssignmentsClient
          classId={classId}
          classSlug={classSlug}
          teacherId={user.id}
          teacherClasses={(teacherClasses as ClassRow[] | null) ?? []}
          allStudents={(allStudents as Student[] | null) ?? []}
          initialAssignments={(assignments as Assignment[] | null) ?? []}
          usePrelims={(config as GradingConfig | null)?.use_prelims ?? false}
          submissionCounts={submissionCounts}
        />
      </div>
    </div>
  );
}
