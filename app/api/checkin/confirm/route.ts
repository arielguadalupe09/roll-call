import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const code = body?.code;

  if (!token || typeof token !== "string" || !code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Missing session token or code." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, class_id, date, closed_at")
    .eq("token", token)
    .is("closed_at", null)
    .maybeSingle();

  if (!session) {
    return NextResponse.json(
      { error: "This session is no longer open." },
      { status: 404 },
    );
  }

  const { data: student } = await supabase
    .from("students")
    .select("id, name")
    .eq("class_id", session.class_id)
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (!student) {
    return NextResponse.json(
      { error: "That code doesn't match any student in this class." },
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

  return NextResponse.json({ name: student.name });
}
