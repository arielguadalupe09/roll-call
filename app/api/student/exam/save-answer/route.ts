import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeviceLock } from "@/lib/student-device-lock";
import type { ExamAttempt } from "@/lib/types";

// Autosaves an in-progress typed/multiple-choice answer for written/laboratory
// activities, which (unlike quizzes) can be worked on across multiple visits
// over hours or days -- called on a debounce from the client, not on every
// keystroke. Never touches points_awarded/is_correct/file_path, so it can't
// clobber grading state or a separately-uploaded file answer.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  const deviceId = typeof body?.deviceId === "string" && body.deviceId ? body.deviceId : null;
  const attemptId = body?.attemptId;
  const questionId = body?.questionId;
  const selectedOptionId = typeof body?.selectedOptionId === "string" ? body.selectedOptionId : null;
  const answerText = typeof body?.answerText === "string" ? body.answerText : null;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  if (!attemptId || typeof attemptId !== "string") {
    return NextResponse.json({ error: "Missing attempt." }, { status: 400 });
  }
  if (!questionId || typeof questionId !== "string") {
    return NextResponse.json({ error: "Missing question." }, { status: 400 });
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
    return NextResponse.json({ error: "This activity has already been turned in." }, { status: 409 });
  }

  await supabase.from("exam_answers").upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      selected_option_id: selectedOptionId,
      answer_text: answerText,
    },
    { onConflict: "attempt_id,question_id" },
  );

  return NextResponse.json({ ok: true });
}
