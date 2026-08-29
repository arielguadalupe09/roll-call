import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Student } from "@/lib/types";
import SessionClient from "./session-client";

export default async function CheckinSessionPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const [{ data: classRow }, { data: students }] = await Promise.all([
    supabase.from("classes").select("*").eq("id", classId).single(),
    supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("name", { ascending: true }),
  ]);

  if (!classRow) notFound();

  return (
    <SessionClient
      classId={classId}
      className={classRow.name}
      students={(students as Student[] | null) ?? []}
    />
  );
}
