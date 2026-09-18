import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ParticipationLog, Student } from "@/lib/types";
import ParticipationClient from "./participation-client";

export default async function ParticipationPage({
  params,
}: {
  params: Promise<{ classSlug: string }>;
}) {
  const { classSlug } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("slug", classSlug)
    .single();

  if (!classRow) notFound();
  const classId = classRow.id;

  const [{ data: students }, { data: logs }] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("name", { ascending: true }),
    supabase
      .from("participation_logs")
      .select("*")
      .eq("class_id", classId),
  ]);

  return (
    <ParticipationClient
      classId={classId}
      students={(students as Student[] | null) ?? []}
      initialLogs={(logs as ParticipationLog[] | null) ?? []}
    />
  );
}
