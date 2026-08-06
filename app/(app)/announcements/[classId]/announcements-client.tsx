"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Announcement } from "@/lib/types";

export default function AnnouncementsClient({
  classId,
  initialAnnouncements,
}: {
  classId: string;
  initialAnnouncements: Announcement[];
}) {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("announcements")
      .insert({ class_id: classId, title: title.trim(), body: body.trim() })
      .select()
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setAnnouncements((prev) => [data as Announcement, ...prev]);
    setTitle("");
    setBody("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("announcements")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={handlePost}
        className="flex flex-col gap-3 rounded-sm border border-rule bg-white p-4"
      >
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <textarea
          placeholder="Write an announcement for this class..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Posting..." : "Post announcement"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {announcements.map((a) => (
          <li key={a.id} className="rounded-sm border border-rule bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-lg font-semibold text-ink">
                  {a.title}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink/80">{a.body}</p>
                <p className="mt-2 font-mono text-xs text-ink/50">
                  {new Date(a.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(a.id)}
                className="shrink-0 text-sm text-danger underline underline-offset-2"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {announcements.length === 0 && (
          <p className="text-ink/60">No announcements yet.</p>
        )}
      </ul>
    </div>
  );
}
