"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Toast, { useToast } from "@/app/_components/toast";

export default function CreateClassForm({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { message, showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("classes")
      .insert({ name: name.trim(), teacher_id: teacherId });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    showToast(`"${name.trim()}" added`);
    setName("");
    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="New class name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <button
          type="submit"
          disabled={loading}
          className="whitespace-nowrap rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Adding..." : "Add class"}
        </button>
        {error && <p className="self-center text-sm text-danger">{error}</p>}
      </form>
      <Toast message={message} />
    </>
  );
}
