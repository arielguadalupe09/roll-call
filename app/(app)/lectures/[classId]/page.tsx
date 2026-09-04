import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { VideoLecture } from "@/lib/types";
import LecturesClient from "./lectures-client";

export default async function LecturesPage({
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

  const { data: lectures } = await supabase
    .from("video_lectures")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — video lectures
        </h1>

        <LecturesClient
          classId={classId}
          initialLectures={(lectures as VideoLecture[] | null) ?? []}
        />
      </div>
    </div>
  );
}
