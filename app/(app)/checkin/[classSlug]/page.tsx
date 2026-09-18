import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Student } from "@/lib/types";
import SessionClient from "./session-client";

export default async function CheckinSessionPage({
  params,
}: {
  params: Promise<{ classSlug: string }>;
}) {
  const { classSlug } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase.from("classes").select("*").eq("slug", classSlug).single();
  if (!classRow) notFound();
  const classId = classRow.id;

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .eq("class_id", classId)
    .order("name", { ascending: true });

  return (
    <SessionClient
      classId={classId}
      className={classRow.name}
      students={(students as Student[] | null) ?? []}
    />
  );
}
