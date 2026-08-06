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

  const { teacherId, fullName } = await request.json();
  if (!teacherId) {
    return NextResponse.json({ error: "Missing teacherId." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: teacher, error: updateError } = await admin
    .from("teachers")
    .update({ full_name: fullName?.trim() || null })
    .eq("id", teacherId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ teacher });
}
