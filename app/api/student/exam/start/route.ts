import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeviceLock, bindDeviceIfUnset } from "@/lib/student-device-lock";
import type { Exam, ExamAnswer, ExamAttempt, ExamOption, ExamQuestion } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  const deviceId = typeof body?.deviceId === "string" && body.deviceId ? body.deviceId : null;
  const examId = body?.examId;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  if (!examId || typeof examId !== "string") {
    return NextResponse.json({ error: "Missing exam." }, { status: 400 });
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

  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .eq("class_id", student.class_id)
    .maybeSingle();

  if (!exam || !(exam as Exam).published) {
    return NextResponse.json({ error: "This exam is not available." }, { status: 404 });
  }

  const now = Date.now();
  const availableFrom = (exam as Exam).available_from;
  const availableUntil = (exam as Exam).available_until;
  if (availableFrom && now < new Date(availableFrom).getTime()) {
    return NextResponse.json({ error: "This exam hasn't opened yet." }, { status: 403 });
  }
  if (availableUntil && now > new Date(availableUntil).getTime()) {
    return NextResponse.json({ error: "This exam is no longer available." }, { status: 403 });
  }

  await bindDeviceIfUnset(supabase, student, deviceId);

  let { data: attempt } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", examId)
    .eq("student_id", student.id)
    .maybeSingle();

  if (!attempt) {
    const { data: created, error: insertError } = await supabase
      .from("exam_attempts")
      .insert({ exam_id: examId, student_id: student.id })
      .select()
      .single();
    if (insertError) {
      return NextResponse.json({ error: "Could not start the exam." }, { status: 500 });
    }
    attempt = created;
  }

  if ((attempt as ExamAttempt).submitted_at) {
    return NextResponse.json(
      {
        error: "You've already submitted this exam.",
        submitted: true,
        score: (attempt as ExamAttempt).score,
        totalPoints: (attempt as ExamAttempt).total_points,
        needsGrading: (attempt as ExamAttempt).needs_grading,
      },
      { status: 409 },
    );
  }

  const { data: questions } = await supabase
    .from("exam_questions")
    .select("id, exam_id, prompt, type, points, order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  const questionList = (questions as Omit<ExamQuestion, "correct_answer" | "created_at">[] | null) ?? [];
  const questionIds = questionList.map((q) => q.id);

  const { data: options } = questionIds.length
    ? await supabase
        .from("exam_options")
        .select("id, question_id, label, order_index")
        .in("question_id", questionIds)
        .order("order_index", { ascending: true })
    : { data: [] as Omit<ExamOption, "is_correct">[] };

  const { data: existingAnswers } = await supabase
    .from("exam_answers")
    .select("question_id, selected_option_id, answer_text, file_path")
    .eq("attempt_id", (attempt as ExamAttempt).id);

  return NextResponse.json({
    exam: {
      id: (exam as Exam).id,
      title: (exam as Exam).title,
      description: (exam as Exam).description,
      kind: (exam as Exam).kind,
      durationMinutes: (exam as Exam).duration_minutes,
      availableUntil: (exam as Exam).available_until,
    },
    attemptId: (attempt as ExamAttempt).id,
    startedAt: (attempt as ExamAttempt).started_at,
    questions: questionList.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      points: q.points,
      options: (options ?? []).filter((o) => o.question_id === q.id),
    })),
    existingAnswers: (existingAnswers as Pick<ExamAnswer, "question_id" | "selected_option_id" | "answer_text" | "file_path">[] | null) ?? [],
  });
}
