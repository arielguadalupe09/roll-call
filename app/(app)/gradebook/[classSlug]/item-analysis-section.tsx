"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_SHEET_ITEMS, keyTextToLetters, lettersToKeyText, sheetOptionCount } from "@/lib/omr-sheet";
import ItemAnalysisExportPanel from "./item-analysis-export-panel";
import AnswerKeyBubbles from "@/app/_components/answer-key-bubbles";
import { createClient } from "@/lib/supabase/client";
import { papersOutOfSync, syncItemScoresToGradebook, type CheckedPaper } from "@/lib/item-score-sync";
import type { MajorExam, MajorExamItemResponse, Student } from "@/lib/types";
import type { ProgramType } from "@/lib/dhvsu-grade";
import {
  analyzeItems,
  BLANK,
  formatAnswerString,
  formatItemList,
  GROUP_FRACTION,
  itemAnalysisCsv,
  PASSING_GRADE,
  parseAnswerString,
  parseItemList,
  wrongItemsFromAnswers,
  type ItemAnalysis,
  type ItemDecision,
  type OptionStat,
} from "@/lib/item-analysis";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { StatusPill, type StatusTone } from "@/app/_components/status-pill";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";

const DECISION_TONE: Record<ItemDecision, StatusTone> = {
  Retain: "success",
  Revise: "warning",
  Reject: "danger",
};

// text = what's typed in the student's box ("Answers" with a key, "Wrong
// items" without); "" = paper not checked yet.
type Draft = { text: string; dirty: boolean };
type Saved = Pick<MajorExamItemResponse, "student_id" | "wrong_items" | "answers">;
type Parsed = { wrongItems?: number[]; answers?: string; error?: string };

function draftsFrom(students: Student[], saved: Map<string, Saved>, keyMode: boolean): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const s of students) {
    const r = saved.get(s.id);
    let text = "";
    if (r && keyMode) text = r.answers ? formatAnswerString(r.answers) : "";
    else if (r) text = formatItemList(r.wrong_items) || "none";
    out[s.id] = { text, dirty: false };
  }
  return out;
}

function percent(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function reliabilityLabel(kr20: number | null) {
  if (kr20 == null) return "--";
  if (kr20 >= 0.8) return "High";
  if (kr20 >= 0.7) return "Acceptable";
  if (kr20 >= 0.5) return "Low";
  return "Very low";
}

// Which half of the section the Major Exam tab is showing; both stay mounted
// (one instance), so typed papers survive switching.
export type ItemAnalysisView = "sheets" | "results";

export default function ItemAnalysisSection({
  view,
  classSlug,
  exam,
  students,
  initialResponses,
  programType,
  recordedScores,
  onScoresSynced,
}: {
  view: ItemAnalysisView;
  classSlug: string;
  exam: MajorExam;
  students: Student[];
  initialResponses: MajorExamItemResponse[];
  programType: ProgramType;
  // The Scores table's current values, to cross-check against item counts.
  recordedScores: Record<string, string>;
  // Checked papers were just saved as the exam's scores (correct counts, out
  // of maxScore); "" = a removed paper's score was cleared.
  onScoresSynced: (scores: Record<string, string>, maxScore: number) => void;
}) {
  const { showToast } = useToast();
  const [itemCount, setItemCount] = useState<number | null>(exam.item_count ?? null);
  const [itemCountDraft, setItemCountDraft] = useState(String(exam.item_count ?? ""));
  const [answerKey, setAnswerKey] = useState<string | null>(exam.answer_key ?? null);
  const [keyDraft, setKeyDraft] = useState(exam.answer_key ? formatAnswerString(exam.answer_key) : "");
  // On-screen answer-key bubbles (open by default until a key is saved).
  const [showBubbles, setShowBubbles] = useState(!exam.answer_key);
  const [keyOptions, setKeyOptions] = useState<4 | 5>(sheetOptionCount(exam.answer_key));
  const draftCount = Number(itemCountDraft);
  const bubbleCount =
    Number.isInteger(draftCount) && draftCount >= 1 && draftCount <= 500 ? draftCount : (itemCount ?? 0);
  const keyLetters = useMemo(() => keyTextToLetters(keyDraft, bubbleCount), [keyDraft, bubbleCount]);
  const keyAnswered = keyLetters.filter(Boolean).length;
  const shownOptions = keyLetters.includes("E") ? 5 : keyOptions;
  const [savingCount, setSavingCount] = useState(false);
  const [saved, setSaved] = useState(
    () => new Map<string, Saved>(initialResponses.map((r) => [r.student_id, r])),
  );
  const keyMode = answerKey != null;
  const [drafts, setDrafts] = useState(() => draftsFrom(students, saved, keyMode));
  const [saving, setSaving] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const nameById = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

  // Every saved paper is the student's exam score (lib/item-score-sync.ts).
  async function syncScores(count: number, papers: CheckedPaper[], cleared: string[] = []): Promise<boolean> {
    if (!papers.length && !cleared.length) return true;
    const result = await syncItemScoresToGradebook(createClient(), exam, count, papers, cleared);
    if (result.error) {
      showToast(`Papers saved, but the scores weren't updated: ${result.error}`);
      return false;
    }
    onScoresSynced(
      {
        ...Object.fromEntries(Object.entries(result.scores).map(([id, v]) => [id, String(v)])),
        ...Object.fromEntries(cleared.map((id) => [id, ""])),
      },
      result.maxScore,
    );
    return true;
  }

  // Papers checked before scores were synced automatically (or edited since in
  // Scores): bring the Scores table in line once when the section opens.
  const caughtUp = useRef(false);
  useEffect(() => {
    if (caughtUp.current || !itemCount) return;
    caughtUp.current = true;
    const recorded = Object.fromEntries(
      Object.entries(recordedScores).map(([id, v]) => [id, v.trim() === "" ? null : Number(v)]),
    );
    const stale = papersOutOfSync(itemCount, [...saved.values()], recorded);
    if (stale.length || (saved.size && exam.max_score !== itemCount)) {
      void syncScores(itemCount, stale.length ? stale : [...saved.values()]);
    }
    // Runs once, with the values the section opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parse every box once per render; an invalid box blocks Save all.
  const parsed = useMemo(() => {
    const out: Record<string, Parsed> = {};
    if (!itemCount) return out;
    const key = answerKey && answerKey.length === itemCount ? answerKey : null;
    for (const s of students) {
      const text = drafts[s.id]?.text ?? "";
      if (text.trim() === "") out[s.id] = {};
      else if (answerKey) {
        const r = parseAnswerString(text, itemCount);
        out[s.id] = r.error
          ? { error: r.error }
          : key
            ? { answers: r.answers, wrongItems: wrongItemsFromAnswers(r.answers!, key) }
            : { error: "Answer key needs fixing" };
      } else {
        const r = parseItemList(text, itemCount);
        out[s.id] = r.error ? { error: r.error } : { wrongItems: r.items };
      }
    }
    return out;
  }, [drafts, itemCount, answerKey, students]);

  // Analysis reflects what's typed (saved or not), so the teacher sees
  // results update while checking papers.
  const analysis = useMemo(() => {
    if (!itemCount) return null;
    const responses = students
      .filter((s) => parsed[s.id]?.wrongItems)
      .map((s) => ({ studentId: s.id, wrongItems: parsed[s.id].wrongItems!, answers: parsed[s.id].answers ?? null }));
    return analyzeItems(itemCount, responses, programType, answerKey);
  }, [itemCount, parsed, students, programType, answerKey]);

  const checkedCount = analysis?.studentCount ?? 0;
  const dirtyIds = students.filter((s) => drafts[s.id]?.dirty).map((s) => s.id);
  const invalidCount = students.filter((s) => parsed[s.id]?.error).length;
  const scoresMatchItems = itemCount != null && itemCount === exam.max_score;

  async function saveSetup() {
    if (dirtyIds.length > 0) {
      showToast("Save or finish the papers you're checking first.");
      return;
    }
    // A typed key decides the item count when the count box is left empty.
    const keyText = keyDraft.trim();
    const keyLetters = keyText.replace(/[\s,;]+/g, "");
    const value = itemCountDraft.trim() === "" && keyLetters ? keyLetters.length : Number(itemCountDraft);
    if (!Number.isInteger(value) || value < 1 || value > 500) {
      showToast("Enter a whole number of items from 1 to 500.");
      return;
    }
    let key: string | null = null;
    if (keyText) {
      const missing = keyTextToLetters(keyDraft, value).flatMap((l, i) => (l ? [] : [i + 1]));
      if (missing.length) {
        showToast(`Answer key: choose an answer for item${missing.length === 1 ? "" : "s"} ${formatItemList(missing)}.`);
        return;
      }
      const r = parseAnswerString(keyText, value, { allowBlank: false });
      if (r.error) {
        showToast(`Answer key: ${r.error}`);
        return;
      }
      key = r.answers!;
    }
    setSavingCount(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("major_exams")
      .update({ item_count: value, answer_key: key })
      .eq("id", exam.id);
    if (error) {
      setSavingCount(false);
      showToast(error.message);
      return;
    }

    // A changed key re-scores every paper whose answers were recorded, so the
    // stored wrong items stay in step with the key.
    const nextSaved = new Map(saved);
    if (key) {
      const rescored = [...saved.values()]
        .filter((r) => r.answers && r.answers.length === value)
        .map((r) => ({ ...r, wrong_items: wrongItemsFromAnswers(r.answers!, key!) }));
      if (rescored.length) {
        const { error: rescoreError } = await supabase.from("major_exam_item_responses").upsert(
          rescored.map((r) => ({
            major_exam_id: exam.id,
            student_id: r.student_id,
            wrong_items: r.wrong_items,
            answers: r.answers,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "major_exam_id,student_id" },
        );
        if (rescoreError) showToast(`Couldn't re-score papers: ${rescoreError.message}`);
        else for (const r of rescored) nextSaved.set(r.student_id, r);
      }
    }
    setSavingCount(false);
    setSaved(nextSaved);
    // A new key or item count changes every paper's correct count.
    if (key || value !== itemCount) await syncScores(value, [...nextSaved.values()]);
    setItemCount(value);
    setItemCountDraft(String(value));
    setAnswerKey(key);
    setKeyDraft(key ? formatAnswerString(key) : "");
    setDrafts(draftsFrom(students, nextSaved, key != null));
    showToast(key ? `Saved ${value}-item answer key` : `Set to ${value} items`);
  }

  async function saveAll() {
    if (invalidCount > 0) {
      showToast("Fix the highlighted boxes first.");
      return;
    }
    if (dirtyIds.length === 0) return;
    setSaving(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    const toUpsert = dirtyIds.filter((id) => parsed[id]?.wrongItems);
    const toClear = dirtyIds.filter((id) => !parsed[id]?.wrongItems);

    const [upsertRes, deleteRes] = await Promise.all([
      toUpsert.length
        ? supabase.from("major_exam_item_responses").upsert(
            toUpsert.map((id) => ({
              major_exam_id: exam.id,
              student_id: id,
              wrong_items: parsed[id].wrongItems!,
              answers: parsed[id].answers ?? null,
              updated_at: now,
            })),
            { onConflict: "major_exam_id,student_id" },
          )
        : Promise.resolve({ error: null }),
      toClear.length
        ? supabase
            .from("major_exam_item_responses")
            .delete()
            .eq("major_exam_id", exam.id)
            .in("student_id", toClear)
        : Promise.resolve({ error: null }),
    ]);
    setSaving(false);

    const error = upsertRes.error ?? deleteRes.error;
    if (error) {
      showToast(error.message);
      return;
    }
    setSaved((prev) => {
      const next = new Map(prev);
      for (const id of toUpsert)
        next.set(id, { student_id: id, wrong_items: parsed[id].wrongItems!, answers: parsed[id].answers ?? null });
      for (const id of toClear) next.delete(id);
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of dirtyIds) next[id] = { ...next[id], dirty: false };
      return next;
    });
    const synced = await syncScores(
      itemCount!,
      toUpsert.map((id) => ({ student_id: id, wrong_items: parsed[id].wrongItems! })),
      toClear.filter((id) => saved.has(id)),
    );
    if (synced) {
      showToast(
        `Saved ${dirtyIds.length} paper${dirtyIds.length === 1 ? "" : "s"} — ${
          toUpsert.length === 1 ? "score" : "scores"
        } updated in Scores`,
      );
    }
  }

  const mismatches =
    analysis && scoresMatchItems
      ? analysis.students.filter((s) => {
          const recorded = recordedScores[s.studentId]?.trim();
          return recorded !== undefined && recorded !== "" && Number(recorded) !== s.score;
        })
      : [];

  const struggling = analysis
    ? analysis.students.filter((s) => s.struggling).sort((a, b) => a.score - b.score)
    : [];
  function downloadCsv() {
    if (!analysis) return;
    const blob = new Blob([itemAnalysisCsv(analysis)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `item-analysis-${exam.period}-${exam.kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const decisionCounts = { Retain: 0, Revise: 0, Reject: 0 };
  for (const item of analysis?.items ?? []) decisionCounts[item.decision] += 1;

  const keyReady = itemCount != null && answerKey != null && answerKey.length === itemCount;
  const sheetsFit = itemCount != null && itemCount <= MAX_SHEET_ITEMS;

  // ---- Bubble sheets: three numbered steps, typing papers tucked away ----
  const sheetsView = (
    <div className="flex flex-col gap-4">
      <Step
        n={1}
        title="Set the answer key"
        done={keyReady}
        doneText={keyReady ? `Answer key saved — ${itemCount} items` : undefined}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-36 flex-col gap-1">
            <span className="text-xs font-semibold text-ink">Number of items</span>
            <Input
              type="number"
              min={1}
              max={500}
              value={itemCountDraft}
              onChange={(e) => setItemCountDraft(e.target.value)}
              className="font-mono"
            />
          </label>
          <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
            <span className="text-xs font-semibold text-ink">Correct answers, in order</span>
            <Input
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="e.g. ABDCA BCDAB"
              className="font-mono uppercase"
            />
          </label>
          <Button onClick={saveSetup} disabled={savingCount}>
            {savingCount ? "Saving…" : "Save answer key"}
          </Button>
        </div>
        {itemCount != null && answerKey != null && answerKey.length !== itemCount && (
          <p className="text-sm text-danger">
            The answer key has {answerKey.length} answers but the exam has {itemCount} items — fix one and save.
          </p>
        )}
        {bubbleCount > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant="secondary" onClick={() => setShowBubbles((v) => !v)}>
                {showBubbles ? "Hide the answer ovals" : "Tap the answers on screen instead"}
              </Button>
              {showBubbles && (
                <>
                  <span className="text-xs text-muted">
                    {keyAnswered} of {bubbleCount} answered
                  </span>
                  <label className="flex items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={shownOptions === 5}
                      disabled={keyLetters.includes("E")}
                      onChange={(e) => setKeyOptions(e.target.checked ? 5 : 4)}
                    />
                    Include choice E
                  </label>
                </>
              )}
            </div>
            {showBubbles && (
              <>
                <p className="text-xs text-muted">
                  Tap the correct oval for each item (tap again to clear), then press Save answer key.
                </p>
                <AnswerKeyBubbles
                  value={keyLetters}
                  onChange={(letters) => setKeyDraft(lettersToKeyText(letters))}
                  optionCount={shownOptions}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={saveSetup} disabled={savingCount}>
                    {savingCount ? "Saving…" : "Save answer key"}
                  </Button>
                  {keyAnswered < bubbleCount && (
                    <span className="text-sm text-danger">
                      {bubbleCount - keyAnswered} item{bubbleCount - keyAnswered === 1 ? "" : "s"} still need an
                      answer (numbers in red).
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <p className="text-xs text-muted">
          Or print an answer-key sheet in step 2, shade it, and scan it first in step 3.
        </p>
      </Step>

      <Step n={2} title="Print the answer sheets" disabled={itemCount == null}>
        {itemCount == null ? (
          <p className="text-xs text-muted">Set the number of items first.</p>
        ) : !sheetsFit ? (
          <p className="text-xs text-muted">Bubble sheets fit up to {MAX_SHEET_ITEMS} items.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button href={`/answer-sheets/${classSlug}/${exam.id}`}>Print answer sheets</Button>
            <span className="text-xs text-muted">One sheet per student, with their name already on it.</span>
          </div>
        )}
      </Step>

      <Step n={3} title="Scan the papers with your phone" disabled={itemCount == null || !sheetsFit}>
        {itemCount != null && sheetsFit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="highlight" href={`/answer-sheets/${classSlug}/${exam.id}/scan`}>
              Scan with phone
            </Button>
            <span className="text-xs text-muted">
              {saved.size > 0
                ? `${saved.size} of ${students.length} papers checked. Each one is scored and recorded in Scores automatically.`
                : "Each scanned paper is scored and recorded in Scores automatically."}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted">Available once the answer sheets can be printed.</p>
        )}
      </Step>

      {itemCount != null && (
        <div className="rounded-[10px] border border-line">
          <button
            type="button"
            onClick={() => setShowTyping((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={showTyping}
          >
            <span>
              <span className="block text-base font-semibold text-ink">No phone? Type the answers instead</span>
              <span className="block text-xs text-muted">
                {keyMode
                  ? "Type each student's answers, e.g. ABDCA BCD-A (- = no answer)."
                  : "Type the item numbers each student got wrong, e.g. 3, 7, 12-15."}
              </span>
            </span>
            <span className="text-xs font-medium text-navy">{showTyping ? "Hide" : "Show"}</span>
          </button>
          {showTyping && (
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
              {!scoresMatchItems && (
                <p className="text-xs text-muted">
                  The exam has {itemCount} items but is out of {exam.max_score} points. Saving a paper changes it to
                  out of {itemCount}.
                </p>
              )}
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell>{keyMode ? "Answers" : "Wrong items"}</TableHeaderCell>
                    <TableHeaderCell align="right">Score</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {students.map((s) => {
                    const p = parsed[s.id] ?? {};
                    const correct = p.wrongItems ? itemCount - p.wrongItems.length : null;
                    return (
                      <TableRow key={s.id} striped>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>
                          <Input
                            value={drafts[s.id]?.text ?? ""}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [s.id]: { text: e.target.value, dirty: true } }))
                            }
                            placeholder={keyMode ? "not checked" : "not checked (none = perfect)"}
                            aria-invalid={!!p.error}
                            className={`!py-1.5 font-mono ${keyMode ? "uppercase" : ""} ${p.error ? "!border-danger" : ""}`}
                          />
                          {p.error && <p className="mt-0.5 text-xs text-danger">{p.error}</p>}
                          {keyMode && p.wrongItems && p.wrongItems.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted">Wrong: {formatItemList(p.wrongItems)}</p>
                          )}
                        </TableCell>
                        <TableCell align="right" tabular>
                          {correct != null ? `${correct} / ${itemCount}` : "--"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={saveAll} disabled={saving || dirtyIds.length === 0}>
                  {saving ? "Saving…" : `Save${dirtyIds.length ? ` ${dirtyIds.length} paper${dirtyIds.length === 1 ? "" : "s"}` : ""}`}
                </Button>
                {invalidCount > 0 && (
                  <span className="text-sm text-danger">
                    {invalidCount} box{invalidCount === 1 ? "" : "es"} need fixing
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---- Results: what a teacher acts on first; the statistics on request ----
  const resultsView = (
    <div className="flex flex-col gap-5">
      {!analysis || checkedCount < 2 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-paper/60 px-5 py-6">
          <p className="text-base font-semibold text-ink">No results yet.</p>
          <p className="mt-1 text-xs text-muted">
            Results appear once at least 2 papers are scanned or typed in Bubble sheets
            {checkedCount === 1 ? " (1 so far)" : ""}.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Papers checked" value={`${checkedCount} of ${students.length}`} />
            <Stat
              label="Average score"
              value={`${analysis.meanScore} / ${itemCount}`}
              note={`${percent(analysis.meanScore, itemCount!)}%`}
            />
            <Stat label="Highest · Lowest" value={`${analysis.summary.high} · ${analysis.summary.low}`} />
            <Stat label="Below passing" value={String(struggling.length)} tone={struggling.length ? "danger" : undefined} />
          </div>

          {mismatches.length > 0 && (
            <p className="text-sm text-danger">
              {mismatches.length} score{mismatches.length === 1 ? " in Scores doesn't" : "s in Scores don't"} match the
              paper: {mismatches.map((m) => nameById.get(m.studentId)).join("; ")}. Reopen this page to update them.
            </p>
          )}

          <section>
            <h4 className="font-display text-base font-semibold text-ink">Students below passing</h4>
            <p className="text-xs text-muted">
              Exam grade below {PASSING_GRADE}. &ldquo;Missed easy items&rdquo; are items most of the class got right —
              worth a one-on-one.
            </p>
            {struggling.length === 0 ? (
              <p className="mt-2 text-sm text-success-text">✓ No one is below passing on this exam.</p>
            ) : (
              <Table className="mt-2">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Student</TableHeaderCell>
                    <TableHeaderCell align="right">Score</TableHeaderCell>
                    <TableHeaderCell align="right">Grade</TableHeaderCell>
                    <TableHeaderCell>Missed easy items</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {struggling.map((s) => (
                    <TableRow key={s.studentId} striped>
                      <TableCell>{nameById.get(s.studentId)}</TableCell>
                      <TableCell align="right" tabular>
                        {s.score} / {itemCount}
                      </TableCell>
                      <TableCell align="right" tabular className="text-danger">
                        {s.transmuted}
                      </TableCell>
                      <TableCell tabular>{formatItemList(s.missedEasyItems) || "--"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section>
            <h4 className="font-display text-base font-semibold text-ink">Items to reteach</h4>
            {analysis.leastLearned.length > 0 ? (
              <>
                <p className="text-xs text-muted">Fewer than half the class got these right.</p>
                <p className="mt-1 font-mono text-sm text-ink">{formatItemList(analysis.leastLearned)}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-success-text">✓ More than half the class got every item right.</p>
            )}
          </section>
        </>
      )}

      {itemCount != null && (
        <ItemAnalysisExportPanel examId={exam.id} savedPapers={saved.size} unsavedPapers={dirtyIds.length} />
      )}

      {analysis && checkedCount >= 2 && (
        <div className="rounded-[10px] border border-line">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={showDetails}
          >
            <span>
              <span className="block text-base font-semibold text-ink">Detailed item analysis</span>
              <span className="block text-xs text-muted">
                Difficulty, discrimination and reliability for each item — for reviewing the test itself.
              </span>
            </span>
            <span className="text-xs font-medium text-navy">{showDetails ? "Hide" : "Show"}</span>
          </button>
          {showDetails && (
            <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Median" value={String(analysis.summary.median)} />
                  <Stat label="Standard deviation" value={analysis.summary.stdDev.toFixed(2)} />
                  <Stat
                    label="Reliability (KR-20)"
                    value={analysis.summary.kr20 == null ? "--" : analysis.summary.kr20.toFixed(2)}
                    note={reliabilityLabel(analysis.summary.kr20)}
                  />
                  <Stat
                    label="Retain · Revise · Reject"
                    value={`${decisionCounts.Retain} · ${decisionCounts.Revise} · ${decisionCounts.Reject}`}
                  />
                </div>
              </div>
              <ScoreDistribution analysis={analysis} />
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-display text-base font-semibold text-ink">Per-item analysis</h4>
                  <Button variant="secondary" size="sm" onClick={downloadCsv}>
                    Download CSV
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  Difficulty = share who got it right. Discrimination compares the top and bottom{" "}
                  {Math.round(GROUP_FRACTION * 100)}% ({analysis.groupSize} students each). Retain: difficulty
                  0.21–0.80 and discrimination ≥ 0.20. Reject: negative discrimination, or both outside range.
                  Pt-biserial above 0.20 is good; negative means stronger students missed it.
                </p>
                {keyMode && (
                  <p className="mt-1 text-xs text-muted">
                    Choice columns show how many picked each letter. The key is bold and green.{" "}
                    <span className="text-danger">Red</span> = a wrong choice the upper group picked more than the
                    lower group (check for ambiguity); <span className="italic">italic 0</span> = a wrong choice nobody
                    picked.
                  </p>
                )}
                <ItemTable analysis={analysis} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return view === "results" ? resultsView : sheetsView;
}

// One numbered step of the bubble-sheet workflow.
function Step({
  n,
  title,
  done,
  doneText,
  disabled,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  doneText?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 rounded-[10px] border border-line px-4 py-4 ${disabled ? "opacity-60" : ""}`}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          done ? "bg-success text-card" : "bg-navy text-card"
        }`}
        aria-hidden
      >
        {done ? "✓" : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h4 className="font-display text-base font-semibold text-ink">
            <span className="sr-only">Step {n}: </span>
            {title}
          </h4>
          {done && doneText && <p className="text-xs text-success-text">{doneText}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-[10px] border border-line bg-card px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-mono text-lg font-semibold ${tone === "danger" ? "text-danger" : "text-ink"}`}>
        {value}
        {note && <span className="ml-1.5 font-sans text-xs font-normal text-muted">{note}</span>}
      </p>
    </div>
  );
}

// Histogram of total scores. Wide exams are binned so there are at most ~25 bars.
function ScoreDistribution({ analysis }: { analysis: ItemAnalysis }) {
  const dist = analysis.summary.distribution;
  const width = Math.max(1, Math.ceil(dist.length / 25));
  const bins: { label: string; count: number }[] = [];
  for (let start = 0; start < dist.length; start += width) {
    const end = Math.min(dist.length - 1, start + width - 1);
    let count = 0;
    for (let i = start; i <= end; i++) count += dist[i];
    bins.push({ label: start === end ? String(start) : `${start}-${end}`, count });
  }
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div>
      <h4 className="font-display text-base font-semibold text-ink">Score distribution</h4>
      <p className="text-xs text-muted">Students per total score (out of {analysis.itemCount}).</p>
      <div className="mt-2 flex h-32 items-end gap-0.5 border-b border-line" role="img" aria-label="Score distribution">
        {bins.map((b) => (
          <div
            key={b.label}
            className="group relative flex h-full min-w-0 flex-1 items-end"
            title={`Score ${b.label}: ${b.count} student${b.count === 1 ? "" : "s"}`}
          >
            <div
              className="w-full rounded-t-[4px] bg-chart-good group-hover:opacity-80"
              style={{ height: b.count ? `${(b.count / max) * 100}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-muted">
        {bins.map((b, i) => (
          <span key={b.label} className="min-w-0 flex-1 truncate text-center font-mono">
            {i % Math.ceil(bins.length / 10) === 0 || i === bins.length - 1 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function OptionCell({ o }: { o: OptionStat | undefined }) {
  if (!o) return <TableCell align="right">--</TableCell>;
  const cls = o.isKey
    ? "font-semibold text-success"
    : o.flag === "misleading"
      ? "text-danger"
      : o.flag === "unused"
        ? "italic text-muted"
        : "";
  return (
    <TableCell align="right" tabular className={cls}>
      <span title={`Upper group ${o.upper} · lower group ${o.lower}`}>{o.count}</span>
    </TableCell>
  );
}

function ItemTable({ analysis }: { analysis: ItemAnalysis }) {
  const n = analysis.studentCount;
  const hasKey = analysis.items[0]?.key != null;
  // Option columns, dropping "Blank" when nobody left an item blank.
  const optionCols = (analysis.items[0]?.options ?? [])
    .map((o) => o.option)
    .filter((opt) => opt !== BLANK || analysis.items.some((i) => i.options?.some((o) => o.option === BLANK && o.count)));
  return (
    <Table className="mt-2">
      <TableHead>
        <TableRow>
          <TableHeaderCell align="right">Item</TableHeaderCell>
          {hasKey && <TableHeaderCell>Key</TableHeaderCell>}
          <TableHeaderCell align="right">Correct</TableHeaderCell>
          <TableHeaderCell>Difficulty</TableHeaderCell>
          <TableHeaderCell>Discrimination</TableHeaderCell>
          <TableHeaderCell align="right">Pt-biserial</TableHeaderCell>
          {optionCols.map((opt) => (
            <TableHeaderCell key={opt} align="right">
              {opt === BLANK ? "Blank" : opt}
            </TableHeaderCell>
          ))}
          <TableHeaderCell>Decision</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {analysis.items.map((item) => {
          const byOption = new Map(item.options?.map((o) => [o.option, o]) ?? []);
          return (
            <TableRow key={item.item} striped>
              <TableCell align="right" tabular>
                {item.item}
              </TableCell>
              {hasKey && <TableCell className="font-mono font-semibold">{item.key}</TableCell>}
              <TableCell align="right" tabular className="whitespace-nowrap">
                {item.correct} / {n} <span className="text-xs text-muted">({percent(item.correct, n)}%)</span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="font-mono">{item.difficulty.toFixed(2)}</span>{" "}
                <span className="text-xs text-muted">{item.difficultyLabel}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="font-mono">{item.discrimination.toFixed(2)}</span>{" "}
                <span className="text-xs text-muted">{item.discriminationLabel}</span>
              </TableCell>
              <TableCell
                align="right"
                tabular
                className={item.pointBiserial != null && item.pointBiserial < 0 ? "text-danger" : undefined}
              >
                {item.pointBiserial == null ? "--" : item.pointBiserial.toFixed(2)}
              </TableCell>
              {optionCols.map((opt) => (
                <OptionCell key={opt} o={byOption.get(opt)} />
              ))}
              <TableCell>
                <StatusPill tone={DECISION_TONE[item.decision]}>{item.decision}</StatusPill>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
