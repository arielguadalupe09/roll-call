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

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (!classRow) notFound();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("class_id", classId)
    .single();

  if (!assignment) notFound();

  const [{ data: students }, { data: submissions }] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("name", { ascending: true }),
    supabase.from("submissions").select("*").eq("assignment_id", assignmentId),
  ]);

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
          classId={classId}
          assignment={assignment as Assignment}
          students={(students as Student[] | null) ?? []}
          initialSubmissions={(submissions as Submission[] | null) ?? []}
        />
      </div>
    </div>
  );
}
