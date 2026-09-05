import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VideoLecture } from "@/lib/types";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = createAdminClient();

  const { data: classRow } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .maybeSingle();

  if (!classRow) notFound();

  const { data: lectures } = await supabase
    .from("video_lectures")
    .select("*")
    .eq("class_id", classId)
    .eq("published", true)
    .order("created_at", { ascending: false });

  const lectureList = (lectures as VideoLecture[] | null) ?? [];

  const withUrls = await Promise.all(
    lectureList.map(async (lecture) => {
      if (!lecture.storage_path) return { ...lecture, signedUrl: null as string | null };
      const { data: signed } = await supabase.storage
        .from("lecture-videos")
        .createSignedUrl(lecture.storage_path, 3600);
      return { ...lecture, signedUrl: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl font-semibold text-ink">{classRow.name}</h1>
        <p className="mt-1 text-ink/60">Video lectures</p>

        {withUrls.length === 0 && (
          <p className="mt-8 text-ink/60">No lectures have been posted for this class yet.</p>
        )}

        <ul className="mt-6 flex flex-col gap-6">
          {withUrls.map((lecture) => (
            <li key={lecture.id} className="rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
              <p className="font-display text-lg font-semibold text-ink">{lecture.title}</p>
              {lecture.description && (
                <p className="mt-1 whitespace-pre-wrap text-ink/80">{lecture.description}</p>
              )}
              {lecture.signedUrl ? (
                <video controls className="mt-3 w-full rounded-sm" src={lecture.signedUrl} />
              ) : lecture.video_url ? (
                <a
                  href={lecture.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-teal underline underline-offset-2"
                >
                  Watch on external site →
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
