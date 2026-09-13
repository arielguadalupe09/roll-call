import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXAM_KIND_LABEL, type Exam, type ExamAnswer, type ExamAttempt, type ExamQuestion, type ExamViolation, type Student } from "@/lib/types";
import { syncExamAttemptToGradebook } from "@/lib/exam-gradebook-sync";
import ExamResultsClient from "./exam-results-client";
import Button from "@/app/_components/button";

export default async function ExamResultsPage({
  params,
}: {
  params: Promise<{ classId: string; examId: string }>;
}) {
  const { classId, examId } = await params;
  const supabase = await createClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .eq("class_id", classId)
    .single();

  if (!exam) notFound();

  const [{ data: students }, { data: attempts }, { data: questions }] = await Promise.all([
    supabase.from("students").select("*").eq("class_id", classId).order("name", { ascending: true }),
    supabase.from("exam_attempts").select("*").eq("exam_id", examId),
    supabase.from("exam_questions").select("*").eq("exam_id", examId).order("order_index", { ascending: true }),
  ]);

  const attemptList = (attempts as ExamAttempt[] | null) ?? [];
  const attemptIds = attemptList.map((a) => a.id);

  // Self-heals attempts that were fully graded before the gradebook-sync
  // pipeline existed (or if a sync call ever failed silently) -- upserts are
  // idempotent, so re-syncing an already-synced attempt on every results-page
  // view is harmless.
  await Promise.all(
    attemptList
      .filter((a) => a.submitted_at && !a.needs_grading)
      .map((a) => syncExamAttemptToGradebook(supabase, exam as Exam, a)),
  );

  const [{ data: violations }, { data: answers }] = await Promise.all([
    attemptIds.length
      ? supabase
          .from("exam_violations")
          .select("*")
          .in("attempt_id", attemptIds)
          .order("occurred_at", { ascending: true })
      : Promise.resolve({ data: [] as ExamViolation[] }),
    attemptIds.length
      ? supabase.from("exam_answers").select("*").in("attempt_id", attemptIds)
      : Promise.resolve({ data: [] as ExamAnswer[] }),
  ]);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl">
        <Button href={`/exams/${classId}/${examId}`} variant="secondary" size="sm">
          ← Back to exam
        </Button>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          {(exam as Exam).title} — results
        </h1>
        <p className="mt-1 text-ink/60">
          {EXAM_KIND_LABEL[(exam as Exam).kind]}
        </p>

        <ExamResultsClient
          exam={exam as Exam}
          students={(students as Student[] | null) ?? []}
          attempts={attemptList}
          violations={(violations as ExamViolation[] | null) ?? []}
          questions={(questions as ExamQuestion[] | null) ?? []}
          answers={(answers as ExamAnswer[] | null) ?? []}
        />
      </div>
    </div>
  );
}
