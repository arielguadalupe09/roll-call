import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeviceLock } from "@/lib/student-device-lock";
import type { ExamAttempt, ViolationType } from "@/lib/types";

const SNAPSHOTS_BUCKET = "exam-snapshots";
const VALID_TYPES: ViolationType[] = [
  "tab_switch",
  "window_blur",
  "fullscreen_exit",
  "copy_paste",
  "periodic",
];
// Snapshots are a single frame, not a video -- keep the size sane without
// needing to inspect actual JPEG dimensions.
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const code = form.get("code");
  const deviceId = form.get("deviceId");
  const attemptId = form.get("attemptId");
  const type = form.get("type");
  const snapshot = form.get("snapshot");

  if (typeof code !== "string" || !code) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  if (typeof attemptId !== "string" || !attemptId) {
    return NextResponse.json({ error: "Missing attempt." }, { status: 400 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as ViolationType)) {
    return NextResponse.json({ error: "Invalid violation type." }, { status: 400 });
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

  if (!attempt || (attempt as ExamAttempt).submitted_at) {
    // Already-submitted attempts don't need violations recorded anymore --
    // fail quietly rather than surface an error mid-exam over a late event.
    return NextResponse.json({ ok: true });
  }

  const { data: exam } = await supabase
    .from("exams")
    .select("class_id")
    .eq("id", (attempt as ExamAttempt).exam_id)
    .maybeSingle();

  let snapshotPath: string | null = null;
  if (snapshot instanceof File && exam) {
    if (snapshot.size <= MAX_SNAPSHOT_BYTES) {
      const path = `${(exam as { class_id: string }).class_id}/${(attempt as ExamAttempt).exam_id}/${student.id}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(SNAPSHOTS_BUCKET)
        .upload(path, snapshot, { contentType: snapshot.type || "image/jpeg" });
      if (!uploadError) snapshotPath = path;
    }
  }

  await supabase.from("exam_violations").insert({
    attempt_id: attemptId,
    type: type as ViolationType,
    snapshot_path: snapshotPath,
  });

  // Periodic snapshots are a spot-check, not a flagged violation -- don't
  // inflate violation_count (which drives the teacher-facing "N flagged"
  // badge) with routine timed captures.
  if (type !== "periodic") {
    await supabase
      .from("exam_attempts")
      .update({ violation_count: (attempt as ExamAttempt).violation_count + 1 })
      .eq("id", attemptId);
  }

  return NextResponse.json({ ok: true });
}

