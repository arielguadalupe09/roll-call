"use client";

import { useState } from "react";
import Button from "@/app/_components/button";
import { useToast } from "@/app/_components/toast";
import { createClient } from "@/lib/supabase/client";
import { applyAnswerKeyToClass, sameSubjectReason, type ClassForShare } from "@/lib/answer-key-share";
import { majorExamLabel } from "@/lib/omr-sheet";
import type { MajorExam } from "@/lib/types";

// "Use this key in other classes": sends this exam's saved answer key to the
// same exam (same term, same written/lab kind) in the teacher's other
// classes. Classes that look like the same subject are listed first and
// ticked; a class that already has a different key is never ticked for the
// teacher, since replacing it re-scores papers scanned there.

type Target = ClassForShare & {
  reason: string | null;
  // That class's exam: null = not set up yet.
  existingKey: string | null;
  hasExam: boolean;
  papers: number;
};

export default function ShareAnswerKey({ exam, answerKey }: { exam: MajorExam; answerKey: string }) {
  const { showToast } = useToast();
  const examLabel = majorExamLabel(exam.period, exam.kind ?? "written").toLowerCase();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function load() {
    setOpen(true);
    setLoading(true);
    const supabase = createClient();
    const { data: classes, error } = await supabase
      .from("classes")
      .select("id, name, subject, course_code")
      .eq("archived", false)
      .order("name");
    if (error || !classes) {
      setLoading(false);
      showToast(error?.message ?? "Couldn't load your classes.");
      return;
    }
    const all = classes as ClassForShare[];
    const source = all.find((c) => c.id === exam.class_id);
    const others = all.filter((c) => c.id !== exam.class_id);

    const { data: exams } = others.length
      ? await supabase
          .from("major_exams")
          .select("id, class_id, answer_key")
          .in(
            "class_id",
            others.map((c) => c.id),
          )
          .eq("period", exam.period)
          .eq("kind", exam.kind ?? "written")
      : { data: [] };
    const examByClass = new Map(
      ((exams ?? []) as { id: string; class_id: string; answer_key: string | null }[]).map((e) => [e.class_id, e]),
    );
    const examIds = [...examByClass.values()].map((e) => e.id);
    const { data: responses } = examIds.length
      ? await supabase.from("major_exam_item_responses").select("major_exam_id").in("major_exam_id", examIds)
      : { data: [] };
    const papersByExam = new Map<string, number>();
    for (const r of (responses ?? []) as { major_exam_id: string }[])
      papersByExam.set(r.major_exam_id, (papersByExam.get(r.major_exam_id) ?? 0) + 1);

    const list: Target[] = others
      .map((c) => {
        const e = examByClass.get(c.id);
        return {
          ...c,
          reason: source ? sameSubjectReason(source, c) : null,
          existingKey: e?.answer_key ?? null,
          hasExam: e != null,
          papers: e ? (papersByExam.get(e.id) ?? 0) : 0,
        };
      })
      .sort((a, b) => Number(b.reason != null) - Number(a.reason != null));
    setTargets(list);
    // Tick same-subject classes, except ones whose own different key would be replaced.
    setChosen(
      new Set(list.filter((t) => t.reason && (!t.existingKey || t.existingKey === answerKey)).map((t) => t.id)),
    );
    setShowAll(!list.some((t) => t.reason));
    setLoading(false);
  }

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (!targets) return;
    const picked = targets.filter((t) => chosen.has(t.id) && t.existingKey !== answerKey);
    if (!picked.length) {
      showToast("Those classes already have this answer key.");
      return;
    }
    const replacing = picked.filter((t) => t.existingKey && t.papers > 0);
    if (
      replacing.length &&
      !window.confirm(
        `${replacing.map((t) => t.name).join(", ")} already ${replacing.length === 1 ? "has" : "have"} a different key with scanned papers. ` +
          "Those papers will be re-scored with this key and their exam scores updated. Continue?",
      )
    )
      return;

    setApplying(true);
    const supabase = createClient();
    const failed: string[] = [];
    const updated = new Set<string>();
    let rescored = 0;
    for (const t of picked) {
      const result = await applyAnswerKeyToClass(
        supabase,
        { classId: t.id, period: exam.period, kind: exam.kind ?? "written" },
        answerKey,
        exam.max_score,
      );
      if (result.error) failed.push(`${t.name}: ${result.error}`);
      else {
        updated.add(t.id);
        rescored += result.rescored;
      }
    }
    setApplying(false);

    const done = updated.size;
    if (failed.length) showToast(`Couldn't update ${failed.join("; ")}`);
    if (done > 0) {
      showToast(
        `Answer key set in ${done} class${done === 1 ? "" : "es"}` +
          (rescored ? ` — ${rescored} paper${rescored === 1 ? "" : "s"} re-scored.` : "."),
      );
      setTargets(
        targets.map((t) => (updated.has(t.id) ? { ...t, existingKey: answerKey, hasExam: true } : t)),
      );
      setChosen(new Set());
    }
  }

  if (!open) {
    return <Button onClick={load}>Use this key in other classes</Button>;
  }

  const visible = targets?.filter((t) => showAll || t.reason) ?? [];
  const hiddenCount = (targets?.length ?? 0) - visible.length;
  const toSend = targets?.filter((t) => chosen.has(t.id) && t.existingKey !== answerKey).length ?? 0;

  return (
    <div className="w-full rounded-[10px] border border-line bg-paper/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Use this answer key in other classes</p>
          <p className="text-xs text-muted">
            Sets the same {answerKey.length}-item key on the {examLabel} of each class you tick. Classes that look like
            the same subject are listed first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs font-semibold text-slate hover:text-navy"
        >
          Close
        </button>
      </div>

      {loading || !targets ? (
        <p className="mt-3 text-sm text-muted">Loading your classes…</p>
      ) : targets.length === 0 ? (
        <p className="mt-3 text-sm text-muted">You have no other active classes.</p>
      ) : (
        <>
          {!targets.some((t) => t.reason) && (
            <p className="mt-3 text-xs text-muted">
              No class looks like the same subject (by Subject, course code or the first word of the name) — tick the
              ones that take this exam.
            </p>
          )}
          <ul className="mt-3 flex flex-col divide-y divide-line/60 rounded-[8px] border border-line bg-card">
            {visible.map((t) => {
              const same = t.existingKey === answerKey;
              const status = same
                ? "✓ Already has this key"
                : t.existingKey
                  ? `Has a different key${t.papers ? ` — ${t.papers} scanned paper${t.papers === 1 ? "" : "s"} will be re-scored` : ""}`
                  : t.hasExam
                    ? "No key yet"
                    : `Exam not set up yet — will be set up out of ${exam.max_score} points`;
              return (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-light/60">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-navy"
                      checked={same || chosen.has(t.id)}
                      disabled={same || applying}
                      onChange={() => toggle(t.id)}
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-ink">
                        {t.name}
                        {t.reason && <span className="ml-2 text-xs font-normal text-muted">({t.reason})</span>}
                      </span>
                      <span
                        className={`text-xs ${
                          same ? "text-success-text" : t.existingKey ? "text-danger" : "text-muted"
                        }`}
                      >
                        {status}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 text-xs font-medium text-navy underline underline-offset-2 hover:no-underline"
            >
              Show my other {hiddenCount} class{hiddenCount === 1 ? "" : "es"}
            </button>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={apply} disabled={applying || toSend === 0}>
              {applying ? "Saving…" : toSend > 0 ? `Set key in ${toSend} class${toSend === 1 ? "" : "es"}` : "Set key"}
            </Button>
            <span className="text-xs text-muted">
              Students in those classes are scored with this key when their sheets are scanned.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
