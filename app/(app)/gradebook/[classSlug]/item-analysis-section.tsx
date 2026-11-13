"use client";

import { useMemo, useState } from "react";
import { MAX_SHEET_ITEMS, keyTextToLetters, lettersToKeyText, sheetOptionCount } from "@/lib/omr-sheet";
import ItemAnalysisExportPanel from "./item-analysis-export-panel";
import AnswerKeyBubbles from "@/app/_components/answer-key-bubbles";
import { createClient } from "@/lib/supabase/client";
import type { MajorExam, MajorExamItemResponse, Student } from "@/lib/types";
import type { ProgramType } from "@/lib/dhvsu-grade";
import {
  analyzeItems,
  BLANK,
  EASY_ITEM_P,
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

export default function ItemAnalysisSection({
  classSlug,
  exam,
  students,
  initialResponses,
  programType,
  recordedScores,
  onUseAsScores,
}: {
  classSlug: string;
  exam: MajorExam;
  students: Student[];
  initialResponses: MajorExamItemResponse[];
  programType: ProgramType;
  // The Scores table's current values, to cross-check against item counts.
  recordedScores: Record<string, string>;
  // Fills the Scores table (unsaved) with each checked student's correct count.
  onUseAsScores: (scores: Record<string, string>) => void;
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

  const nameById = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

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
    showToast(`Saved ${dirtyIds.length} paper${dirtyIds.length === 1 ? "" : "s"}`);
  }

  function useAsScores() {
    if (!analysis) return;
    const scores: Record<string, string> = {};
    for (const s of analysis.students) scores[s.studentId] = String(s.score);
    onUseAsScores(scores);
    showToast(`Filled ${analysis.students.length} scores — review them in Scores, then Save all.`);
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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Set the number of items. With an <strong>answer key</strong> (multiple choice), type each student&apos;s
        answers in order (e.g. <span className="font-mono">ABDCA BCD-A</span>; <span className="font-mono">-</span> =
        no answer) and you also see how many picked each choice. Without a key, type the item numbers they got wrong
        (e.g. <span className="font-mono">3, 7, 12-15</span>; <span className="font-mono">none</span> for a perfect
        paper). Leave a box blank if that paper hasn&apos;t been checked.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-32 flex-col gap-1">
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
          <span className="text-xs font-semibold text-ink">Answer key (type it, or scan a shaded key sheet)</span>
          <Input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="e.g. ABDCA BCDAB"
            className="font-mono uppercase"
          />
        </label>
        <Button variant="secondary" onClick={saveSetup} disabled={savingCount}>
          {savingCount ? "Saving..." : "Save"}
        </Button>
      </div>

      {bubbleCount > 0 && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-line px-3 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-semibold text-ink">Shade the answer key</span>
            <span className="text-xs text-muted">
              {keyAnswered} / {bubbleCount} items answered
            </span>
            {showBubbles && (
              <label className="flex items-center gap-1.5 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={shownOptions === 5}
                  disabled={keyLetters.includes("E")}
                  onChange={(e) => setKeyOptions(e.target.checked ? 5 : 4)}
                />
                Choices A–E
              </label>
            )}
            <Button variant="primary" size="sm" onClick={() => setShowBubbles((v) => !v)}>
              {showBubbles ? "Hide bubbles" : "Shade on screen"}
            </Button>
          </div>
          {showBubbles && (
            <>
              <p className="text-xs text-muted">
                Tap the correct oval for each item (tap again to clear) — the same as shading the printed answer-key
                sheet. It fills the answer key box above; press Save to use it.
              </p>
              <AnswerKeyBubbles
                value={keyLetters}
                onChange={(letters) => setKeyDraft(lettersToKeyText(letters))}
                optionCount={shownOptions}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={saveSetup} disabled={savingCount}>
                  {savingCount ? "Saving..." : "Save answer key"}
                </Button>
                {keyAnswered < bubbleCount && (
                  <span className="text-xs text-danger">
                    {bubbleCount - keyAnswered} item{bubbleCount - keyAnswered === 1 ? "" : "s"} still need an answer
                    (numbers in red).
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {itemCount != null && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-line bg-paper/60 px-3 py-2.5">
          <span className="text-sm font-semibold text-ink">Bubble sheets</span>
          {itemCount > MAX_SHEET_ITEMS ? (
            <span className="text-xs text-muted">Sheets fit up to {MAX_SHEET_ITEMS} items.</span>
          ) : (
            <>
              <Button variant="primary" size="sm" href={`/answer-sheets/${classSlug}/${exam.id}`}>
                Print answer sheets
              </Button>
              <Button variant="highlight" size="sm" href={`/answer-sheets/${classSlug}/${exam.id}/scan`}>
                  Scan with phone
                </Button>
              {!(answerKey && answerKey.length === itemCount) && (
                <span className="text-xs text-muted">
                  Shade the key on screen above, or print an <strong>Answer key (teacher)</strong> sheet, shade it, and
                  scan it first.
                </span>
              )}
              <span className="text-xs text-muted">Scanned papers appear here automatically.</span>
            </>
          )}
        </div>
      )}

      {itemCount != null && (
        <ItemAnalysisExportPanel examId={exam.id} savedPapers={saved.size} unsavedPapers={dirtyIds.length} />
      )}

      {itemCount != null && answerKey != null && answerKey.length !== itemCount && (
        <p className="text-xs text-danger">
          The answer key has {answerKey.length} letters but the exam has {itemCount} items — fix one and Save.
        </p>
      )}

      {itemCount != null && !scoresMatchItems && (
        <p className="text-xs text-muted">
          The exam has {itemCount} items but a max score of {exam.max_score}, so items aren&apos;t compared with the
          recorded scores.
        </p>
      )}

      {itemCount != null && (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>{keyMode ? "Answers" : "Wrong items"}</TableHeaderCell>
                <TableHeaderCell align="right">Correct</TableHeaderCell>
                <TableHeaderCell align="right">Incorrect</TableHeaderCell>
                {scoresMatchItems && <TableHeaderCell align="right">Recorded score</TableHeaderCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((s) => {
                const p = parsed[s.id] ?? {};
                const correct = p.wrongItems ? itemCount - p.wrongItems.length : null;
                const recorded = recordedScores[s.id]?.trim() ?? "";
                const mismatch = correct != null && recorded !== "" && Number(recorded) !== correct;
                return (
                  <TableRow key={s.id} striped>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>
                      <Input
                        value={drafts[s.id]?.text ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [s.id]: { text: e.target.value, dirty: true } }))
                        }
                        placeholder="not checked"
                        aria-invalid={!!p.error}
                        className={`!py-1 font-mono text-sm ${keyMode ? "uppercase" : ""} ${p.error ? "!border-danger" : ""}`}
                      />
                      {p.error && <p className="mt-0.5 text-xs text-danger">{p.error}</p>}
                      {keyMode && p.wrongItems && p.wrongItems.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted">Wrong: {formatItemList(p.wrongItems)}</p>
                      )}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {correct != null ? `${correct} / ${itemCount}` : "--"}
                    </TableCell>
                    <TableCell align="right" tabular className={correct != null && correct < itemCount ? "text-danger" : undefined}>
                      {correct != null ? itemCount - correct : "--"}
                    </TableCell>
                    {scoresMatchItems && (
                      <TableCell align="right" tabular className={mismatch ? "text-danger" : undefined}>
                        {recorded === "" ? "--" : recorded}
                        {mismatch && " ≠"}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveAll} disabled={saving || dirtyIds.length === 0}>
              {saving ? "Saving..." : `Save all${dirtyIds.length ? ` (${dirtyIds.length})` : ""}`}
            </Button>
            {scoresMatchItems && checkedCount > 0 && (
              <Button variant="secondary" onClick={useAsScores}>
                Use correct counts as scores
              </Button>
            )}
            {invalidCount > 0 && (
              <span className="text-xs text-danger">
                {invalidCount} box{invalidCount === 1 ? "" : "es"} need fixing
              </span>
            )}
          </div>

          {mismatches.length > 0 && (
            <p className="text-sm text-danger">
              {mismatches.length} recorded score{mismatches.length === 1 ? " doesn't" : "s don't"} match the number of
              correct items: {mismatches.map((m) => nameById.get(m.studentId)).join("; ")}.
            </p>
          )}

          {analysis && checkedCount < 2 && (
            <p className="text-sm text-muted">Check at least 2 papers to see the item analysis.</p>
          )}

          {analysis && checkedCount >= 2 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display text-base font-semibold text-ink">Exam summary</h4>
                <Button variant="secondary" size="sm" onClick={downloadCsv}>
                  Download CSV
                </Button>
              </div>
              <div className="-mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Papers checked" value={`${checkedCount} / ${students.length}`} />
                <Stat
                  label="Mean score"
                  value={`${analysis.meanScore} / ${itemCount}`}
                  note={`${percent(analysis.meanScore, itemCount)}%`}
                />
                <Stat label="Median" value={String(analysis.summary.median)} />
                <Stat label="High · Low" value={`${analysis.summary.high} · ${analysis.summary.low}`} />
                <Stat label="Standard deviation" value={analysis.summary.stdDev.toFixed(2)} />
                <Stat
                  label="Reliability (KR-20)"
                  value={analysis.summary.kr20 == null ? "--" : analysis.summary.kr20.toFixed(2)}
                  note={reliabilityLabel(analysis.summary.kr20)}
                />
                <Stat label="Struggling" value={String(struggling.length)} />
                <Stat
                  label="Retain · Revise · Reject"
                  value={`${decisionCounts.Retain} · ${decisionCounts.Revise} · ${decisionCounts.Reject}`}
                />
              </div>

              <ScoreDistribution analysis={analysis} />

              <div>
                <h4 className="font-display text-base font-semibold text-ink">Struggling students</h4>
                <p className="text-xs text-muted">
                  Exam grade below {PASSING_GRADE} after transmutation. &ldquo;Missed easy items&rdquo; are items at
                  least {Math.round(EASY_ITEM_P * 100)}% of the class got right — likely gaps worth a one-on-one.
                </p>
                {struggling.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/70">No one is below passing on this exam.</p>
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
                          <TableCell tabular className="text-sm">
                            {formatItemList(s.missedEasyItems) || "--"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {analysis.leastLearned.length > 0 && (
                <div>
                  <h4 className="font-display text-base font-semibold text-ink">Least-learned items</h4>
                  <p className="text-xs text-muted">Fewer than half the class got these right — consider reteaching.</p>
                  <p className="mt-1 font-mono text-sm text-ink">{formatItemList(analysis.leastLearned)}</p>
                </div>
              )}

              <div>
                <h4 className="font-display text-base font-semibold text-ink">Per-item analysis</h4>
                <p className="text-xs text-muted">
                  Difficulty = share who got it right. Discrimination compares the top and bottom{" "}
                  {Math.round(GROUP_FRACTION * 100)}% ({analysis.groupSize} students each). Retain: difficulty
                  0.21–0.80 and discrimination ≥ 0.20. Reject: negative discrimination, or both outside range. Pt-biserial
                  correlates the item with total score (above 0.20 is good; negative means stronger students missed it).
                </p>
                {keyMode && (
                  <p className="mt-1 text-xs text-muted">
                    Choice columns show how many picked each letter (hover for the upper/lower group split). The key is
                    bold and green. <span className="text-danger">Red</span> = a wrong choice the upper group picked
                    more than the lower group (check the item for ambiguity);{" "}
                    <span className="italic">italic 0</span> = a wrong choice nobody picked (not a working distractor).
                  </p>
                )}
                <ItemTable analysis={analysis} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-card px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono text-lg font-semibold text-ink">
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
