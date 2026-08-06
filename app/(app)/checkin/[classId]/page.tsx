import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SessionClient from "./session-client";

export default async function CheckinSessionPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();

  if (!classRow) notFound();

  return <SessionClient classId={classId} className={classRow.name} />;
}
