import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDeviceLock } from "@/lib/student-device-lock";
import { normalizeEmail } from "@/lib/email";

// Lets a student set (or clear) the email that gets "your grade is posted"
// notices (lib/notify.ts), from the /student portal. Public like the profile
// route, so it goes through the same device lock: only the device the code
// is bound to may change it -- by the time the student sees this form, the
// profile load has already bound or (on "Continue anyway") rebound it.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const deviceId = typeof body?.deviceId === "string" && body.deviceId ? body.deviceId : null;
  const email = normalizeEmail(body?.email);
  if (!code) return NextResponse.json({ error: "Missing code." }, { status: 400 });
  if (email === undefined) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, name, device_id")
    .eq("code", code)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "That code doesn't match any student." }, { status: 404 });

  const lock = await checkDeviceLock(supabase, student, deviceId, false);
  if (!lock.ok) return NextResponse.json({ error: lock.error }, { status: 403 });

  const { error } = await supabase.from("students").update({ email }).eq("id", student.id);
  if (error) return NextResponse.json({ error: "Couldn't save your email. Try again." }, { status: 500 });
  return NextResponse.json({ email });
}
