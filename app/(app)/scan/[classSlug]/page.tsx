import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScanClient from "./scan-client";

export default async function ScanPage({
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

  return <ScanClient classId={classId} className={classRow.name} />;
}
