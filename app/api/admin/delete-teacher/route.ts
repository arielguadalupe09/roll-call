import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("teachers")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!caller?.is_admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { teacherId } = await request.json();
  if (!teacherId) {
    return NextResponse.json({ error: "Missing teacherId." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("teachers")
    .select("is_admin")
    .eq("id", teacherId)
    .single();

  if (!target) {
    return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
  }

  if (target.is_admin) {
    return NextResponse.json(
      { error: "Admin accounts can't be deleted from this page." },
      { status: 400 },
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(teacherId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
