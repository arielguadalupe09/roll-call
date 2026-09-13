import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeviceLock } from "@/lib/student-device-lock";
import { gradeAnswer } from "@/lib/exam-grading";
import { syncExamAttemptToGradebook } from "@/lib/exam-gradebook-sync";
import type { Exam, ExamAttempt, ExamOption, ExamQuestion } from "@/lib/types";

type SubmittedAnswer = {
  questionId: string;
  selectedOptionId: string | null;
  answerText: string | null;
  filePath: string | null;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  const deviceId = typeof body?.deviceId === "string" && body.deviceId ? body.deviceId : null;
  const attemptId = body?.attemptId;
  const answers = Array.isArray(body?.answers) ? (body.answers as SubmittedAnswer[]) : [];

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  if (!attemptId || typeof attemptId !== "string") {
    return NextResponse.json({ error: "Missing attempt." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: "That code doesn't match any student." }, { status: 404 });
  }

  const lock = await checkDeviceLock(supabase, student, deviceId);
  if (!lock.ok) {
    return NextResponse.json({ error: lock.error }, { status: 403 });
  }

  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("student_id", student.id)
    .maybeSingle();

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if ((attempt as ExamAttempt).submitted_at) {
    return NextResponse.json(
      {
        score: (attempt as ExamAttempt).score,
        totalPoints: (attempt as ExamAttempt).total_points,
        needsGrading: (attempt as ExamAttempt).needs_grading,
      },
      { status: 200 },
    );
  }

  const { data: questions } = await supabase
    .from("exam_questions")
    .select("*")
    .eq("exam_id", (attempt as ExamAttempt).exam_id);

  const questionList = (questions as ExamQuestion[] | null) ?? [];
  const questionIds = questionList.map((q) => q.id);

  const { data: options } = questionIds.length
    ? await supabase.from("exam_options").select("*").in("question_id", questionIds)
    : { data: [] as ExamOption[] };

  const optionList = (options as ExamOption[] | null) ?? [];
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  let totalPoints = 0;
  let score = 0;
  let needsGrading = false;
  const rows = questionList.map((question) => {
    totalPoints += question.points;
    const submitted = answerByQuestion.get(question.id) ?? {
      questionId: question.id,
      selectedOptionId: null,
      answerText: null,
      filePath: null,
    };
    const questionOptions = optionList.filter((o) => o.question_id === question.id);
    const { isCorrect, pointsAwarded } = gradeAnswer(question, questionOptions, submitted);
    if (pointsAwarded === null) needsGrading = true;
    else score += pointsAwarded;

    return {
      attempt_id: attemptId,
      question_id: question.id,
      selected_option_id: submitted.selectedOptionId,
      answer_text: submitted.answerText,
      file_path: submitted.filePath ?? null,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
    };
  });

  if (rows.length) {
    await supabase.from("exam_answers").upsert(rows, { onConflict: "attempt_id,question_id" });
  }

  await supabase
    .from("exam_attempts")
    .update({ submitted_at: new Date().toISOString(), score, total_points: totalPoints, needs_grading: needsGrading })
    .eq("id", attemptId);

  const { data: examRow } = await supabase
    .from("exams")
    .select("*")
    .eq("id", (attempt as ExamAttempt).exam_id)
    .maybeSingle();
  if (examRow) {
    await syncExamAttemptToGradebook(supabase, examRow as Exam, {
      student_id: student.id,
      score,
      total_points: totalPoints,
      needs_grading: needsGrading,
    });
  }

  return NextResponse.json({ score, totalPoints, needsGrading });
}
