import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Teacher } from "@/lib/types";
import AdminTeachersClient from "./admin-teachers-client";

export default async function AdminTeachersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/dashboard");

  const { data: caller } = await supabase
    .from("teachers")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!caller?.is_admin) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: teachers } = await admin
    .from("teachers")
    .select("id, email, full_name, is_admin, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Teacher accounts
        </h1>
        <p className="mt-1 text-ink/70">
          Create login accounts for other teachers. They can sign in immediately
          with the email and password you set here.
        </p>

        <AdminTeachersClient initialTeachers={(teachers as Teacher[] | null) ?? []} />
      </div>
    </div>
  );
}
