import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EXAM_KIND_LABEL, type Exam, type ExamKind, type ExamOption, type ExamQuestion } from "@/lib/types";
import ExamBuilderClient from "./exam-builder-client";
import ExamInstructionsForm from "./exam-instructions-form";
import Button from "@/app/_components/button";

const GRADEBOOK_TAB_FOR_KIND: Record<ExamKind, string> = {
  quiz: "quiz",
  major_exam: "major-exam",
  written: "written",
  laboratory: "laboratory",
};

export default async function ExamBuilderPage({
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

  const { data: questions } = await supabase
    .from("exam_questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  const questionList = (questions as ExamQuestion[] | null) ?? [];
  const questionIds = questionList.map((q) => q.id);

  const { data: options } = questionIds.length
    ? await supabase.from("exam_options").select("*").in("question_id", questionIds).order("order_index", { ascending: true })
    : { data: [] as ExamOption[] };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Button
            href={`/gradebook/${classId}?tab=${GRADEBOOK_TAB_FOR_KIND[(exam as Exam).kind]}`}
            variant="secondary"
            size="sm"
          >
            ← Back to gradebook
          </Button>
          <Button href={`/exams/${classId}/${examId}/preview`} variant="secondary" size="sm">
            Preview exam →
          </Button>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          {(exam as Exam).title}
        </h1>
        <p className="mt-1 text-ink/60">
          {EXAM_KIND_LABEL[(exam as Exam).kind]} ·{" "}
          {(exam as Exam).published ? "Published" : "Draft"}
          {(exam as Exam).duration_minutes != null ? ` · ${(exam as Exam).duration_minutes} min` : ""}
        </p>

        <ExamInstructionsForm examId={examId} initialDescription={(exam as Exam).description} />

        <ExamBuilderClient
          examId={examId}
          initialQuestions={questionList}
          initialOptions={(options as ExamOption[] | null) ?? []}
        />
      </div>
    </div>
  );
}
