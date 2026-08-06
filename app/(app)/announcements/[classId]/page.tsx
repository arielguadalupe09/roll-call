import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Announcement } from "@/lib/types";
import AnnouncementsClient from "./announcements-client";

export default async function AnnouncementsPage({
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

  const { data: announcements } = await supabase
    .from("announcements")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {classRow.name} — announcements
        </h1>

        <AnnouncementsClient
          classId={classId}
          initialAnnouncements={(announcements as Announcement[] | null) ?? []}
        />
      </div>
    </div>
  );
}
