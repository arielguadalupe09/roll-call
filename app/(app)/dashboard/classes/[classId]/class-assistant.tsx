"use client";

import { useState } from "react";
import CollapsibleSection from "@/app/_components/collapsible-section";

export default function ClassAssistant({ classId }: { classId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, question: question.trim() }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? `Could not get an answer (${res.status}).`);
        return;
      }
      setAnswer(data?.answer ?? "");
    } catch {
      setError("Could not reach the assistant. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <CollapsibleSection
        title="Ask about this class"
        subtitle="Attendance, at-risk students, draft an announcement..."
      >
        <form onSubmit={handleAsk} className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="e.g. Which students are at risk due to attendance?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-w-0 flex-1 rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
          <button
            type="submit"
            disabled={loading}
            className="whitespace-nowrap rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Asking..." : "Ask"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {answer && (
          <div className="mt-3 rounded-sm border border-rule/60 bg-white p-3">
            <p className="whitespace-pre-wrap text-sm text-ink">{answer}</p>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
