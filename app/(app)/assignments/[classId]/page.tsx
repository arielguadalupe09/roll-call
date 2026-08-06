import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Assignment } from "@/lib/types";
import AssignmentsClient from "./assignments-client";

export default async function AssignmentsPage({
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

  const { data: assignments } = await supabase
    .from("assignments")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — assignments
        </h1>

        <AssignmentsClient
          classId={classId}
          initialAssignments={(assignments as Assignment[] | null) ?? []}
        />
      </div>
    </div>
  );
}
