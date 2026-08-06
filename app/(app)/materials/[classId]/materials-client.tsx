"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Material } from "@/lib/types";

export default function MaterialsClient({
  classId,
  initialMaterials,
}: {
  classId: string;
  initialMaterials: Material[];
}) {
  const router = useRouter();
  const [materials, setMaterials] = useState(initialMaterials);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("materials")
      .insert({
        class_id: classId,
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim(),
      })
      .select()
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setMaterials((prev) => [data as Material, ...prev]);
    setTitle("");
    setDescription("");
    setUrl("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("materials")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-sm border border-rule bg-white p-4"
      >
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brass"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Adding..." : "Add material"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {materials.map((m) => (
          <li key={m.id} className="rounded-sm border border-rule bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display text-lg font-semibold text-teal underline underline-offset-2"
                >
                  {m.title}
                </a>
                {m.description && (
                  <p className="mt-1 text-ink/80">{m.description}</p>
                )}
                <p className="mt-1 truncate font-mono text-xs text-ink/50">
                  {m.url}
                </p>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="shrink-0 text-sm text-danger underline underline-offset-2"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {materials.length === 0 && (
          <p className="text-ink/60">No materials yet.</p>
        )}
      </ul>
    </div>
  );
}
