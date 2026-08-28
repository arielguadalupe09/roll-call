import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = body?.code;
  const deviceId = typeof body?.deviceId === "string" && body.deviceId ? body.deviceId : null;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, name, class_id, device_id")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (!student) {
    return NextResponse.json(
      { error: "That code doesn't match any student." },
      { status: 404 },
    );
  }

  // A student's code locks to whichever device it's first successfully
  // used from, so a classmate can't check them in from their own phone --
  // and a device locks to whichever student it first checks in, so that
  // same phone can't then check in a second, third, ... classmate just
  // because *they* don't have a device bound yet. Both checked here,
  // before the session lookup, so a blocked device never learns whether a
  // session happens to be open.
  if (deviceId) {
    const { data: deviceOwner } = await supabase
      .from("students")
      .select("id")
      .eq("device_id", deviceId)
      .neq("id", student.id)
      .maybeSingle();

    if (deviceOwner) {
      return NextResponse.json(
        { error: "This device has already been used to check in a different student." },
        { status: 403 },
      );
    }

    if (student.device_id && student.device_id !== deviceId) {
      return NextResponse.json(
        {
          error:
            "This code is already linked to another device. Ask your teacher to reset it if this is your phone.",
        },
        { status: 403 },
      );
    }
  }

  // No date filter here on purpose -- this route runs in UTC while the
  // school is UTC+8, so matching against a server-computed "today" would
  // misidentify the date for hours around midnight. "Currently open" is
  // the actual gate; the session's own date (set by the teacher, in their
  // local terms) is what gets written to the attendance record below.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, class_id, date, closed_at")
    .eq("class_id", student.class_id)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return NextResponse.json(
      { error: "No active check-in session for your class right now. Ask your teacher to start one." },
      { status: 404 },
    );
  }

  const { error: insertError } = await supabase.from("attendance").insert({
    class_id: session.class_id,
    student_id: student.id,
    date: session.date,
    method: "self",
    status: "present",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You've already checked in today." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Could not record attendance." },
      { status: 500 },
    );
  }

  // Bind the device only now that check-in actually succeeded, so a
  // blocked or failed attempt never claims a device on someone's behalf.
  if (deviceId && !student.device_id) {
    await supabase.from("students").update({ device_id: deviceId }).eq("id", student.id);
  }

  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .eq("class_id", session.class_id)
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({ name: student.name, announcements: announcements ?? [] });
}
