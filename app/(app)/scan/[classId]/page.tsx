import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScanClient from "./scan-client";

export default async function ScanPage({
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

  return <ScanClient classId={classId} className={classRow.name} />;
}
