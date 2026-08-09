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

  const { teacherId, isAdmin } = await request.json();

  if (!teacherId || typeof isAdmin !== "boolean") {
    return NextResponse.json(
      { error: "Missing teacherId or isAdmin." },
      { status: 400 },
    );
  }

  if (teacherId === user.id) {
    return NextResponse.json(
      { error: "You can't change your own admin access." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: teacher, error: updateError } = await admin
    .from("teachers")
    .update({ is_admin: isAdmin })
    .eq("id", teacherId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ teacher });
}
