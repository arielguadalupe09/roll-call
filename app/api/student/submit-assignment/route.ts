import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bindDeviceIfUnset, checkDeviceLock } from "@/lib/student-device-lock";
import { nextStatusAfterUpload } from "@/lib/submission-status";
import type { Assignment, Submission } from "@/lib/types";

const SUBMISSIONS_BUCKET = "submissions";
// Routed through this server route (rather than a direct anonymous browser
// upload to Storage) so no new public Storage RLS policy is needed -- same
// service-role trust model as every other student-facing route. That means
// the file rides in this request's body, which Vercel caps around ~4.5MB;
// stay comfortably under it.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const code = form.get("code");
  const deviceId = form.get("deviceId");
  const assignmentId = form.get("assignmentId");
  const file = form.get("file");

  if (typeof code !== "string" || !code) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  if (typeof assignmentId !== "string" || !assignmentId) {
    return NextResponse.json({ error: "Missing assignment." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is too large -- please keep it under 4MB." },
      { status: 413 },
    );
  }

  const supabase = createAdminClient();

  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (!student) {
    return NextResponse.json(
      { error: "That code doesn't match any student." },
      { status: 404 },
    );
  }

  const lock = await checkDeviceLock(
    supabase,
    student,
    typeof deviceId === "string" && deviceId ? deviceId : null,
  );
  if (!lock.ok) {
    return NextResponse.json({ error: lock.error }, { status: 403 });
  }
  await bindDeviceIfUnset(supabase, student, typeof deviceId === "string" ? deviceId : null);

  const { data: submission } = await supabase
    .from("submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", student.id)
    .maybeSingle();

  if (!submission) {
    return NextResponse.json(
      { error: "This assignment doesn't apply to you." },
      { status: 404 },
    );
  }

  const { data: assignment } = await supabase
    .from("assignments")
    .select("teacher_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  }

  const path = `${(assignment as Assignment).teacher_id}/${assignmentId}/${student.id}/${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(SUBMISSIONS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const nextStatus = nextStatusAfterUpload((submission as Submission).status);

  const { error: upsertError } = await supabase.from("submissions").upsert(
    {
      assignment_id: assignmentId,
      student_id: student.id,
      status: nextStatus,
      score: (submission as Submission).score,
      feedback: (submission as Submission).feedback,
      file_path: path,
      file_name: file.name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "assignment_id,student_id" },
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: signed } = await supabase.storage
    .from(SUBMISSIONS_BUCKET)
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    status: nextStatus,
    fileName: file.name,
    fileSignedUrl: signed?.signedUrl ?? null,
  });
}
