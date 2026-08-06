import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .order("start_time", { ascending: true });

  return (
    <ScheduleClient
      teacherId={user.id}
      initialEntries={(entries as ScheduleEntry[] | null) ?? []}
    />
  );
}
