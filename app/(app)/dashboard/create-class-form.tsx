"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";

export default function CreateClassForm({
  teacherId,
  defaultUsePrelims = false,
}: {
  teacherId: string;
  defaultUsePrelims?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: newClass, error: insertError } = await supabase
      .from("classes")
      .insert({ name: name.trim(), teacher_id: teacherId })
      .select()
      .single();

    if (insertError) {
      setLoading(false);
      setError(insertError.message);
      return;
    }

    // The DB trigger that auto-creates this class's grading_configs row has
    // already run by the time insert() resolves, so this is a plain update,
    // not a race against that trigger.
    if (defaultUsePrelims && newClass) {
      await supabase
        .from("grading_configs")
        .update({ use_prelims: true })
        .eq("class_id", newClass.id);
    }

    setLoading(false);
    showToast(`"${name.trim()}" added`);
    setName("");
    router.refresh();
  }

  return (
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
  );
}
