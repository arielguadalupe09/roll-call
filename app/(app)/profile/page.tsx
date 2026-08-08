import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Teacher } from "@/lib/types";
import ProfileForm from "./profile-form";
import RecordCardBrandingForm from "./record-card-branding-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: teacherRow } = await supabase
    .from("teachers")
    .select("*")
    .eq("id", user.id)
    .single();

  const teacher = teacherRow as Teacher | null;

  let logoUrl: string | null = null;
  if (teacher?.card_logo_path) {
    const { data: signed } = await supabase.storage
      .from("card-logos")
      .createSignedUrl(teacher.card_logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Profile
        </h1>
        <p className="mt-1 text-ink/70">{user.email}</p>

        <ProfileForm
          teacherId={user.id}
          initialFullName={teacher?.full_name ?? null}
        />

        <RecordCardBrandingForm
          teacherId={user.id}
          initialSchoolName={teacher?.card_school_name ?? null}
          initialCampusLine={teacher?.card_campus_line ?? null}
          initialLogoUrl={logoUrl}
        />
      </div>
    </div>
  );
}
