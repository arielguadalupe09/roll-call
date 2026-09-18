import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Material } from "@/lib/types";
import MaterialsClient from "./materials-client";

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ classSlug: string }>;
}) {
  const { classSlug } = await params;
  const supabase = await createClient();

  const { data: classRow } = await supabase.from("classes").select("*").eq("slug", classSlug).single();
  if (!classRow) notFound();
  const classId = classRow.id;

  const { data: materials } = await supabase
    .from("materials")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — materials
        </h1>

        <MaterialsClient
          classId={classId}
          initialMaterials={(materials as Material[] | null) ?? []}
        />
      </div>
    </div>
  );
}
