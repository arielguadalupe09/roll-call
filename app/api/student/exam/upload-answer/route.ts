import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeviceLock } from "@/lib/student-device-lock";
import type { ExamAttempt } from "@/lib/types";

const SUBMISSIONS_BUCKET = "exam-submissions";
// Rides in this request's body, which Vercel caps around ~4.5MB -- same
// constraint/convention as MAX_FILE_BYTES in submit-assignment/route.ts.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const code = form.get("code");
  const deviceId = form.get("deviceId");
  const attemptId = form.get("attemptId");
  const questionId = form.get("questionId");
  const file = form.get("file");

  if (typeof code !== "string" || !code) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  if (typeof attemptId !== "string" || !attemptId) {
    return NextResponse.json({ error: "Missing attempt." }, { status: 400 });
  }
  if (typeof questionId !== "string" || !questionId) {
    return NextResponse.json({ error: "Missing question." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 4MB)." }, { status: 400 });
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

  const lock = await checkDeviceLock(
    supabase,
    student,
    typeof deviceId === "string" && deviceId ? deviceId : null,
  );
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

  const { data: exam } = await supabase
    .from("exams")
    .select("class_id")
    .eq("id", (attempt as ExamAttempt).exam_id)
    .maybeSingle();

  if (!exam) {
    return NextResponse.json({ error: "Could not find this activity." }, { status: 404 });
  }

  const path = `${(exam as { class_id: string }).class_id}/${(attempt as ExamAttempt).exam_id}/${student.id}/${questionId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from(SUBMISSIONS_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    return NextResponse.json({ error: "Could not upload that file." }, { status: 500 });
  }

  await supabase.from("exam_answers").upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      file_path: path,
    },
    { onConflict: "attempt_id,question_id" },
  );

  const { data: signedUrlData } = await supabase.storage
    .from(SUBMISSIONS_BUCKET)
    .createSignedUrl(path, 60 * 60);

  return NextResponse.json({ filePath: path, fileName: file.name, signedUrl: signedUrlData?.signedUrl ?? null });
}
