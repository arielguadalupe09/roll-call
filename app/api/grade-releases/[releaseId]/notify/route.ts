import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deliver, renderGradeReleaseEmail, smtpConfigured } from "@/lib/notify";
import type { GradeRelease } from "@/lib/types";

// Emails are sent one by one inside the request (a serverless function
// can't keep a background thread alive the way the Queen of Smiles server
// did), so give a large class time to finish.
export const maxDuration = 60;

// Emails every student of the release's class who has an email on file and
// hasn't already been emailed for this release (failed sends are retried).
// Called by Overview right after "Release ... grades", and again by its
// "Email students" button. Uses the teacher's own RLS-scoped client, so a
// release of someone else's class simply isn't found.
export async function POST(request: NextRequest, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: release } = await supabase
    .from("grade_releases")
    .select("*, classes(name)")
    .eq("id", releaseId)
    .maybeSingle();
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const { classes, ...rel } = release as GradeRelease & { classes: { name: string } | null };

  // A release to one student emails only them. Either way, a student already
  // emailed about this term (through any release of it -- e.g. their own
  // release before the class-wide one) isn't emailed again.
  const { data: termReleases } = await supabase
    .from("grade_releases")
    .select("id")
    .eq("class_id", rel.class_id)
    .eq("period", rel.period);
  let studentsQuery = supabase.from("students").select("id, name, email").eq("class_id", rel.class_id).not("email", "is", null);
  if (rel.student_id) studentsQuery = studentsQuery.eq("id", rel.student_id);
  const [{ data: students, error: studentsError }, { data: previous, error: previousError }] = await Promise.all([
    studentsQuery,
    supabase
      .from("grade_notifications")
      .select("student_id, status")
      .in("release_id", ((termReleases as { id: string }[] | null) ?? [{ id: rel.id }]).map((r) => r.id)),
  ]);
  if (studentsError || previousError) {
    return NextResponse.json({ error: (studentsError ?? previousError)!.message }, { status: 500 });
  }

  // "sent" is final. "logged" (printed only, because SMTP wasn't configured --
  // e.g. a release made from local dev) counts as done only while SMTP is
  // still unconfigured, so it's really emailed once SMTP is set up. "failed"
  // is always retried.
  const isDone = (status: string) => status === "sent" || (status === "logged" && !smtpConfigured());
  const done = new Set(
    ((previous as { student_id: string; status: string }[] | null) ?? [])
      .filter((p) => isDone(p.status) && (!rel.student_id || p.student_id === rel.student_id))
      .map((p) => p.student_id),
  );
  const pending = ((students as { id: string; name: string; email: string }[] | null) ?? []).filter(
    (s) => s.email && !done.has(s.id),
  );

  const portalUrl = process.env.APP_URL || request.nextUrl.origin;
  const counts = { sent: 0, logged: 0, failed: 0 };
  const rows = [];
  for (const s of pending) {
    const { subject, body } = renderGradeReleaseEmail({
      studentName: s.name,
      className: classes?.name ?? "your class",
      period: rel.period,
      portalUrl,
    });
    const result = await deliver(s.email, subject, body);
    counts[result.status]++;
    rows.push({
      release_id: rel.id,
      student_id: s.id,
      recipient: s.email,
      subject,
      status: result.status,
      error: result.error ?? null,
      created_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error } = await supabase.from("grade_notifications").upsert(rows, { onConflict: "release_id,student_id" });
    if (error) console.error(`[email] couldn't record grade notifications: ${error.message}`);
  }

  const { count: withoutEmail } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("class_id", rel.class_id)
    .is("email", null);

  return NextResponse.json({
    ...counts,
    alreadyEmailed: done.size,
    withoutEmail: withoutEmail ?? 0,
    smtpConfigured: smtpConfigured(),
  });
}
