import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScheduleEntry, Teacher, TeacherOption } from "@/lib/types";
import ScheduleClient from "./schedule-client";

export default async function SchedulePage() {
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

  const { data: entries } = await supabase
    .from("schedule_entries")
    .select("*")
    .eq("teacher_id", user.id)
    .order("start_time", { ascending: true });

  const { data: myShares } = await supabase
    .from("schedule_shares")
    .select("viewer_id")
    .eq("owner_id", user.id);

  // Both need names/emails across the whole roster, which teachers can't
  // read directly under RLS — safe here since it's server-side and scoped
  // to just id/full_name/email.
  const admin = createAdminClient();

  const { data: allTeachers } = await admin
    .from("teachers")
    .select("id, full_name, email")
    .neq("id", user.id)
    .order("full_name", { ascending: true });

  const { data: sharedWithMeRows } = await admin
    .from("schedule_shares")
    .select("owner_id")
    .eq("viewer_id", user.id);

  const roster = (allTeachers as TeacherOption[] | null) ?? [];
  const sharedWithMeIds = new Set(
    ((sharedWithMeRows as { owner_id: string }[] | null) ?? []).map((r) => r.owner_id),
  );
  const sharedTeachers = roster.filter((t) => sharedWithMeIds.has(t.id));

  return (
    <ScheduleClient
      teacherId={user.id}
      initialEntries={(entries as ScheduleEntry[] | null) ?? []}
      allTeachers={roster}
      initialSharedWithIds={
        ((myShares as { viewer_id: string }[] | null) ?? []).map((r) => r.viewer_id)
      }
      sharedTeachers={sharedTeachers}
      schoolName={teacher?.card_school_name ?? null}
      campusLine={teacher?.card_campus_line ?? null}
      logoUrl={logoUrl}
    />
  );
}
