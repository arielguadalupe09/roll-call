import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exam, ExamAttempt } from "./types";

// Bridges a fully-graded online exam attempt into the same gradebook tables
// the teacher's manual score-entry UI writes to (assessment_scores for
// quizzes, major_exam_scores for major exams), so the Record Card and DHVSU
// export -- which only ever read from those tables -- pick up online-exam
// scores with no changes on their end. Only called once an attempt has no
// essay grading left pending (needs_grading false), so a partially-graded
// score is never shown to a student/parent as if it were final.
//
// Framework-agnostic: takes whatever SupabaseClient the caller already has
// (the admin client from the student-facing submit route, or a teacher's
// browser client from the essay-grading UI) since both are RLS/ownership-
// scoped appropriately for their own call site already.
export async function syncExamAttemptToGradebook(
  supabase: SupabaseClient,
  exam: Pick<Exam, "id" | "class_id" | "title" | "kind" | "period">,
  attempt: Pick<ExamAttempt, "student_id" | "score" | "total_points" | "needs_grading">,
): Promise<void> {
  if (attempt.needs_grading || attempt.score === null || attempt.total_points === null) return;

  if (exam.kind === "quiz" || exam.kind === "written" || exam.kind === "laboratory") {
    const { data: assessment } = await supabase
      .from("assessments")
      .upsert(
        {
          class_id: exam.class_id,
          category: exam.kind,
          title: exam.title,
          period: exam.period,
          max_score: attempt.total_points,
          source_exam_id: exam.id,
        },
        { onConflict: "source_exam_id" },
      )
      .select("id")
      .single();
    if (!assessment) return;

    await supabase.from("assessment_scores").upsert(
      {
        assessment_id: assessment.id,
        student_id: attempt.student_id,
        score: attempt.score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assessment_id,student_id" },
    );
    return;
  }

  const { data: majorExam } = await supabase
    .from("major_exams")
    .upsert(
      {
        class_id: exam.class_id,
        period: exam.period,
        max_score: attempt.total_points,
        source_exam_id: exam.id,
      },
      { onConflict: "class_id,period" },
    )
    .select("id")
    .single();
  if (!majorExam) return;

  await supabase.from("major_exam_scores").upsert(
    {
      major_exam_id: majorExam.id,
      student_id: attempt.student_id,
      score: attempt.score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "major_exam_id,student_id" },
  );
}
