import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Teacher } from "@/lib/types";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: teacher } = await supabase
    .from("teachers")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Profile
        </h1>
        <p className="mt-1 text-ink/70">{user.email}</p>

        <ProfileForm
          teacherId={user.id}
          initialFullName={(teacher as Teacher | null)?.full_name ?? null}
        />
      </div>
    </div>
  );
}
