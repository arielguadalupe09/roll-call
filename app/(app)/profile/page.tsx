import { redirect } from "next/navigation";
import { createClient, getUser, getTeacherRow } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";
import RecordCardBrandingForm from "./record-card-branding-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  if (!user) redirect("/login");

  const teacher = await getTeacherRow(user.id);

  const [logoUrl, logoUrlSecondary] = await Promise.all([
    teacher?.card_logo_path
      ? supabase.storage
          .from("card-logos")
          .createSignedUrl(teacher.card_logo_path, 3600)
          .then(({ data }) => data?.signedUrl ?? null)
      : Promise.resolve(null),
    teacher?.card_logo_path_secondary
      ? supabase.storage
          .from("card-logos")
          .createSignedUrl(teacher.card_logo_path_secondary, 3600)
          .then(({ data }) => data?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);

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
          initialDefaultUsePrelims={teacher?.default_use_prelims ?? false}
        />

        <RecordCardBrandingForm
          teacherId={user.id}
          initialSchoolName={teacher?.card_school_name ?? null}
          initialCampusLine={teacher?.card_campus_line ?? null}
          initialLogoUrl={logoUrl}
          initialLogoUrlSecondary={logoUrlSecondary}
        />
      </div>
    </div>
  );
}
