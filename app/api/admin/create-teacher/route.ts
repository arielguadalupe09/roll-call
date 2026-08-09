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

  const { email, password, fullName, isAdmin } = await request.json();

  if (!email?.trim() || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Email and a password of at least 6 characters are required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Could not create the account." },
      { status: 400 },
    );
  }

  // handle_new_user already inserted a teachers row (full_name null,
  // is_admin false) via the on-signup trigger — only update it if the
  // caller set a name or asked for admin access.
  const updates: { full_name?: string; is_admin?: boolean } = {};
  if (fullName?.trim()) updates.full_name = fullName.trim();
  if (isAdmin) updates.is_admin = true;

  const { data: teacher } =
    Object.keys(updates).length > 0
      ? await admin
          .from("teachers")
          .update(updates)
          .eq("id", created.user.id)
          .select()
          .single()
      : await admin.from("teachers").select("*").eq("id", created.user.id).single();

  return NextResponse.json({ teacher });
}
