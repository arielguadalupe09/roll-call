import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = body?.token;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing session token." }, { status: 400 });
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
      { error: "This session code is closed or invalid." },
      { status: 404 },
    );
  }

  const { data: classRow } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", session.class_id)
    .single();

  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }

  return NextResponse.json({
    classId: classRow.id,
    className: classRow.name,
    date: session.date,
  });
}
