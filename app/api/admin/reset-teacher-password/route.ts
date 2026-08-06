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

  const { teacherId, newPassword } = await request.json();

  if (!teacherId || !newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: "A password of at least 6 characters is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(teacherId, {
    password: newPassword,
  });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
