import { notFound } from "next/navigation";
import { createClient, getTeacherRow } from "@/lib/supabase/server";
import { EXAM_KIND_LABEL, type ClassRow, type Exam, type ExamOption, type ExamQuestion, type QuestionType } from "@/lib/types";
import PrintButton from "./print-button";
import PublishToggle from "./publish-toggle";
import ExamPrintSheet from "./exam-print-sheet";
import Button from "@/app/_components/button";
import { optionLetter } from "@/lib/option-letters";

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  identification: "Identification",
  essay: "Essay",
  file_upload: "File upload",
};

export default async function ExamPreviewPage({
  params,
}: {
  params: Promise<{ classId: string; examId: string }>;
}) {
  const { classId, examId } = await params;
  const supabase = await createClient();

  const [{ data: exam }, { data: classRowData }, { data: questions }] = await Promise.all([
    supabase.from("exams").select("*").eq("id", examId).eq("class_id", classId).single(),
    supabase.from("classes").select("*").eq("id", classId).single(),
    supabase.from("exam_questions").select("*").eq("exam_id", examId).order("order_index", { ascending: true }),
  ]);

  if (!exam || !classRowData) notFound();
  const classRow = classRowData as ClassRow;

  const questionList = (questions as ExamQuestion[] | null) ?? [];
  const questionIds = questionList.map((q) => q.id);

  const [{ data: options }, teacher] = await Promise.all([
    questionIds.length
      ? supabase
          .from("exam_options")
          .select("*")
          .in("question_id", questionIds)
          .order("order_index", { ascending: true })
      : Promise.resolve({ data: [] as ExamOption[] }),
    getTeacherRow(classRow.teacher_id),
  ]);

  const optionsByQuestion = new Map<string, ExamOption[]>();
  for (const o of (options as ExamOption[] | null) ?? []) {
    (optionsByQuestion.get(o.question_id) ?? optionsByQuestion.set(o.question_id, []).get(o.question_id)!).push(o);
  }

  const examRow = exam as Exam;
  const totalPoints = questionList.reduce((sum, q) => sum + q.points, 0);

  const [logoUrl, logoUrlSecondary] = await Promise.all([
    teacher?.card_logo_path
      ? supabase.storage
          .from("card-logos")
          .createSignedUrl(teacher.card_logo_path, 3600)
          .then(({ data }) => data?.signedUrl ?? null)
      : Promise.resolve(null),
    teacher?.card_logo_path_secondary
      ? supabase.storage
          .from("card-logos")
          .createSignedUrl(teacher.card_logo_path_secondary, 3600)
          .then(({ data }) => data?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);

  return (
    <div className="px-8 py-10 print:px-0 print:py-0">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between print:hidden">
          <Button href={`/exams/${classId}/${examId}`} variant="secondary" size="sm">
            ← Back to editing
          </Button>
          <div className="flex items-center gap-3">
            <PublishToggle examId={examId} initialPublished={examRow.published} />
            <PrintButton />
          </div>
        </div>

        <div className="print:hidden">
          <p className="mt-4 text-xs text-muted">
            Preview -- exactly what students will see, plus the answer key
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{examRow.title}</h1>
          <p className="mt-1 text-ink/60">
            {EXAM_KIND_LABEL[examRow.kind]} ·{" "}
            {examRow.published ? "Published" : "Draft"} · {examRow.period} ·{" "}
            {examRow.duration_minutes != null ? `${examRow.duration_minutes} min · ` : ""}
            {questionList.length} question
            {questionList.length === 1 ? "" : "s"} · {totalPoints} pt{totalPoints === 1 ? "" : "s"} total
          </p>
          {examRow.description && <p className="mt-3 text-ink/80">{examRow.description}</p>}

          <ol className="mt-8 flex flex-col gap-5">
            {questionList.map((q, i) => (
              <li key={q.id} className="rounded-[10px] border border-line bg-card p-5">
                <p className="text-xs text-muted">
                  {i + 1}. {TYPE_LABEL[q.type]} · {q.points} pt{q.points === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-ink">{q.prompt}</p>

                {q.type === "multiple_choice" ? (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {(optionsByQuestion.get(q.id) ?? []).map((o, oi) => (
                      <li
                        key={o.id}
                        className={`text-sm ${o.is_correct ? "font-medium text-success-text" : "text-ink/70"}`}
                      >
                        {o.is_correct ? "✓ " : "· "}
                        {optionLetter(oi)}. {o.label}
                      </li>
                    ))}
                  </ul>
                ) : q.type === "essay" || q.type === "file_upload" ? (
                  <p className="mt-3 text-sm text-ink/60">Manually graded -- no fixed answer.</p>
                ) : (
                  <p className="mt-3 text-sm text-success-text">
                    Correct: {q.correct_answer?.split("|").join(" / ")}
                  </p>
                )}
              </li>
            ))}
            {questionList.length === 0 && (
              <p className="text-ink/60">No questions yet -- nothing to preview.</p>
            )}
          </ol>
        </div>
      </div>

      <div id="exam-preview-print" className="hidden print:block">
        <ExamPrintSheet
          classRow={classRow}
          teacher={teacher}
          logoUrl={logoUrl}
          logoUrlSecondary={logoUrlSecondary}
          exam={examRow}
          questions={questionList}
          optionsByQuestion={optionsByQuestion}
        />
      </div>
    </div>
  );
}
