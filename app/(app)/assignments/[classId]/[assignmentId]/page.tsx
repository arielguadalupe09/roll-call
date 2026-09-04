import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, Student, Submission } from "@/lib/types";
import SubmissionRoster from "./submission-roster";

export default async function AssignmentRosterPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
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

  const { count: linkCount } = await supabase
    .from("assignment_classes")
    .select("*", { count: "exact", head: true })
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId);

  if (!linkCount) notFound();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();

  if (!assignment) notFound();

  const [{ data: submissions }, { data: classStudents }] = await Promise.all([
    supabase.from("submissions").select("*").eq("assignment_id", assignmentId),
    supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("name", { ascending: true }),
  ]);

  const submissionsList = (submissions as Submission[] | null) ?? [];
  const studentIdsWithSubmission = new Set(submissionsList.map((s) => s.student_id));
  const classStudentIds = new Set(((classStudents as Student[] | null) ?? []).map((s) => s.id));

  // The roster shows only this class's slice of the shared assignment —
  // students who have a submission row for it AND belong to this class.
  const students = ((classStudents as Student[] | null) ?? []).filter((s) =>
    studentIdsWithSubmission.has(s.id),
  );
  const rosterSubmissions = submissionsList.filter((s) => classStudentIds.has(s.student_id));

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — {(assignment as Assignment).title}
        </h1>
        {assignment.description && (
          <p className="mt-1 text-ink/70">{assignment.description}</p>
        )}

        <SubmissionRoster
          teacherId={user.id}
          assignment={assignment as Assignment}
          students={students}
          initialSubmissions={rosterSubmissions}
        />
      </div>
    </div>
  );
}
