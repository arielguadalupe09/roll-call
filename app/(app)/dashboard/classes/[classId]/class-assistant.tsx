"use client";

import { useRef, useState } from "react";
import type { MLCEngine } from "@mlc-ai/web-llm";
import { createClient } from "@/lib/supabase/client";
import { computeClassStats, computeInsights } from "@/lib/dashboard-insights";
import type { Attendance, ClassRow, GradingConfig, Student } from "@/lib/types";
import CollapsibleSection from "@/app/_components/collapsible-section";

// Small enough for a typical laptop to download once (~900MB) and run at a
// reasonable speed with no dedicated GPU, while still following
// instructions noticeably better than the sub-1B options in the same
// prebuilt list (SmolLM2-360M, Qwen2.5-0.5B) -- id verified against the
// installed package's own prebuiltAppConfig.model_list, not copied from docs.
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

const SYSTEM_PROMPT = `You are the class assistant inside Roll Call, a teacher attendance/grading app.
Answer the teacher's question using only the class data provided below -- don't invent students, numbers, or events not present in it.
Be concise (a few sentences, or a short list). If asked to draft an announcement or message, write it ready to paste in, with no extra commentary around it.`;

type Status = "checking" | "unsupported" | "idle" | "loading" | "ready";

export default function ClassAssistant({ classId }: { classId: string }) {
  const [status, setStatus] = useState<Status>(() =>
    typeof navigator !== "undefined" && "gpu" in navigator ? "idle" : "unsupported",
  );
  const [progress, setProgress] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<MLCEngine | null>(null);

  async function loadModel() {
    setStatus("loading");
    setError(null);
    try {
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      engineRef.current = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (p) => setProgress(p.text),
      });
      setStatus("ready");
    } catch {
      setError("Could not load the local AI model. Try again, or check your browser supports WebGPU.");
      setStatus("idle");
    }
  }

  async function buildContext(): Promise<string> {
    const supabase = createClient();
    const [{ data: classRow }, { data: students }, { data: attendance }, { data: gradingConfig }] =
      await Promise.all([
        supabase.from("classes").select("*").eq("id", classId).single(),
        supabase.from("students").select("*").eq("class_id", classId),
        supabase.from("attendance").select("*").eq("class_id", classId),
        supabase.from("grading_configs").select("*").eq("class_id", classId).maybeSingle(),
      ]);

    const studentRows = (students as Student[] | null) ?? [];
    const attendanceRows = (attendance as Attendance[] | null) ?? [];

    const stats = computeClassStats(
      classRow as ClassRow,
      studentRows,
      attendanceRows,
      (gradingConfig as GradingConfig | null) ?? null,
    );
    const insights = computeInsights([stats]);

    const sessionDates = new Set(attendanceRows.map((a) => a.date));
    const attendedDatesByStudent = new Map<string, Set<string>>();
    for (const a of attendanceRows) {
      if (a.status !== "present" && a.status !== "late") continue;
      const dates = attendedDatesByStudent.get(a.student_id) ?? new Set<string>();
      dates.add(a.date);
      attendedDatesByStudent.set(a.student_id, dates);
    }
    const lowAttendanceNames = studentRows
      .filter((s) => {
        if (sessionDates.size === 0) return false;
        const attended = attendedDatesByStudent.get(s.id)?.size ?? 0;
        return attended / sessionDates.size < 0.75;
      })
      .map((s) => s.name);

    return `Class: ${classRow?.name ?? "Unknown"}${classRow?.subject ? ` (${classRow.subject})` : ""}
Students enrolled: ${stats.studentCount}
Average attendance rate: ${stats.attendanceRate != null ? `${Math.round(stats.attendanceRate * 100)}%` : "no sessions recorded yet"}
Students below 75% attendance: ${lowAttendanceNames.length > 0 ? lowAttendanceNames.join(", ") : "none"}
Insights:
${insights.length > 0 ? insights.map((i) => `- ${i.text}`).join("\n") : "- none"}`;
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !engineRef.current) return;
    setAsking(true);
    setError(null);
    setAnswer(null);

    try {
      const context = await buildContext();
      const reply = await engineRef.current.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Class data:\n${context}\n\nQuestion: ${question.trim()}` },
        ],
      });
      setAnswer(reply.choices[0]?.message?.content ?? "");
    } catch {
      setError("Could not get an answer. Try again.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="mt-6">
      <CollapsibleSection
        title="Ask about this class"
        subtitle="Runs on your device — free, no account, no data leaves your browser"
      >
        {status === "unsupported" && (
          <p className="text-sm text-ink/60">
            Local AI needs a recent Chrome or Edge on a laptop/desktop with WebGPU support —
            it&apos;s not available in this browser.
          </p>
        )}

        {(status === "idle" || status === "loading") && (
          <div>
            <p className="text-sm text-ink/70">
              The first use downloads a small AI model to your browser (~900MB, one time) so
              questions can be answered without any paid service or account. It&apos;s cached
              after that.
            </p>
            <button
              onClick={loadModel}
              disabled={status === "loading"}
              className="mt-3 rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
            >
              {status === "loading" ? progress || "Loading..." : "Load local AI"}
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
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
                disabled={asking}
                className="whitespace-nowrap rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
              >
                {asking ? "Asking..." : "Ask"}
              </button>
            </form>

            {answer && (
              <div className="mt-3 rounded-sm border border-rule/60 bg-white p-3">
                <p className="whitespace-pre-wrap text-sm text-ink">{answer}</p>
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </CollapsibleSection>
    </div>
  );
}
