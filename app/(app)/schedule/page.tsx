import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScheduleEntry } from "@/lib/types";
import ScheduleClient from "./schedule-client";

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: entries } = await supabase
    .from("schedule_entries")
    .select("*")
    .eq("teacher_id", user.id)
    .order("start_time", { ascending: true });

  const { data: self } = await supabase
    .from("teachers")
    .select("schedule_shared")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();
  const { data: sharedTeachers } = await admin
    .from("teachers")
    .select("id, full_name, email")
    .eq("schedule_shared", true)
    .neq("id", user.id)
    .order("full_name", { ascending: true });

  return (
    <ScheduleClient
      teacherId={user.id}
      initialEntries={(entries as ScheduleEntry[] | null) ?? []}
      initialShared={self?.schedule_shared ?? false}
      sharedTeachers={
        (sharedTeachers as { id: string; full_name: string | null; email: string }[] | null) ?? []
      }
    />
  );
}
