"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MajorExam, MajorExamItemResponse, MajorExamKind, MajorExamScore, Period, Student } from "@/lib/types";
import type { ProgramType } from "@/lib/dhvsu-grade";
import ItemAnalysisSection, { type ItemAnalysisView } from "./item-analysis-section";
import ScoreEntryTable, { type ScoreRow } from "./score-entry-table";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Card } from "@/app/_components/card";
import { Input } from "@/app/_components/input";

// Major Exam tab. Built for teachers who aren't comfortable with busy
// screens: pick ONE exam from the tiles at the top, then one of three plain
// jobs for it (Scores / Bubble sheets / Results). Every exam stays mounted
// (only hidden), so switching tiles or views never drops unsaved typing.

const PERIOD_TITLE: Record<Period, string> = { prelim: "Prelim", midterm: "Midterm", finals: "Final" };
const KIND_TITLE: Record<MajorExamKind, string> = { written: "Written exam", laboratory: "Laboratory exam" };
const KINDS: MajorExamKind[] = ["written", "laboratory"];

// `scores` = saved, non-blank scores by student id -- what the sibling exam
// (same term, other kind) can copy.
type Summary = { setUp: boolean; maxScore: number; scored: number; scores: Record<string, string> };
type CopySource = { label: string; maxScore: number; scores: Record<string, string> };
type View = "scores" | ItemAnalysisView;

const VIEWS: { view: View; label: string; hint: string }[] = [
  { view: "scores", label: "Scores", hint: "Type, paste or upload" },
  { view: "sheets", label: "Bubble sheets", hint: "Print and scan with your phone" },
  { view: "results", label: "Results", hint: "Who struggled, which items" },
];

function savedScores(scores: MajorExamScore[]): Record<string, string> {
  return Object.fromEntries(scores.filter((s) => s.score != null).map((s) => [s.student_id, String(s.score)]));
}

function sameSummary(a: Summary, b: Summary): boolean {
  return (
    a.setUp === b.setUp &&
    a.maxScore === b.maxScore &&
    a.scored === b.scored &&
    JSON.stringify(a.scores) === JSON.stringify(b.scores)
  );
}

function ExamSection({
  classId,
  classSlug,
  period,
  kind,
  initialExam,
  students,
  initialScores,
  initialItemResponses,
  programType,
  copySource,
  onSummary,
}: {
  classId: string;
  classSlug: string;
  period: Period;
  kind: MajorExamKind;
  initialExam: MajorExam | null;
  students: Student[];
  initialScores: MajorExamScore[];
  initialItemResponses: MajorExamItemResponse[];
  programType: ProgramType;
  // The other exam of the same term (written <-> laboratory), when it has scores.
  copySource: CopySource | null;
  onSummary: (summary: Summary) => void;
}) {
  const { showToast } = useToast();
  const label = `${PERIOD_TITLE[period]} ${KIND_TITLE[kind].toLowerCase()}`;
  const [exam, setExam] = useState(initialExam);
  const [maxScore, setMaxScore] = useState(String(initialExam?.max_score ?? 100));
  const [editingMax, setEditingMax] = useState(false);
  const [savingMax, setSavingMax] = useState(false);
  const [view, setView] = useState<View>("scores");
  const [rows, setRows] = useState<Record<string, ScoreRow>>(() => {
    const byStudent: Record<string, ScoreRow> = {};
    for (const s of students) byStudent[s.id] = { score: "", saving: false };
    for (const score of initialScores) {
      byStudent[score.student_id] = {
        score: score.score != null ? String(score.score) : "",
        saving: false,
      };
    }
    return byStudent;
  });

  const saved: Record<string, string> = {};
  for (const s of students) {
    const row = rows[s.id];
    if (row && !row.dirty && row.score.trim() !== "") saved[s.id] = row.score.trim();
  }
  const scored = Object.keys(saved).length;
  const savedKey = JSON.stringify(saved);

  // Keeps the tile at the top (and the sibling exam's copy button) in step with this exam.
  useEffect(() => {
    onSummary({ setUp: exam != null, maxScore: exam?.max_score ?? 0, scored, scores: saved });
    // onSummary is a fresh closure each parent render; the values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, savedKey]);

  function updateRow(studentId: string, patch: Partial<ScoreRow>) {
    setRows((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  async function handleSaveMaxScore() {
    const value = Number(maxScore);
    if (!Number.isFinite(value) || value <= 0) {
      showToast("Enter how many points the exam is worth, e.g. 100.");
      return;
    }
    const saved = await saveMaxScore(value);
    if (saved) showToast(exam ? `${label}: now out of ${value} points` : `${label} is ready — enter scores or scan papers.`);
  }

  async function saveMaxScore(value: number): Promise<MajorExam | null> {
    setSavingMax(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("major_exams")
      .upsert({ class_id: classId, period, kind, max_score: value }, { onConflict: "class_id,period,kind" })
      .select()
      .single();

    setSavingMax(false);
    if (error) {
      showToast(error.message);
      return null;
    }
    setExam(data as MajorExam);
    setMaxScore(String(value));
    setEditingMax(false);
    return data as MajorExam;
  }

  // Fills the score boxes with the other exam's saved scores (e.g. the lab
  // exam gets the same grades as the written one). Like pasting, nothing is
  // written until Save all, so the filled table is the preview. Students
  // with no score in the source are left alone.
  function copyScoresFrom(source: CopySource, targetMax: number) {
    let filled = 0;
    let replaced = 0;
    for (const s of students) {
      const value = source.scores[s.id];
      if (value == null) continue;
      const current = (rows[s.id]?.score ?? "").trim();
      if (current === value) continue;
      if (current !== "") replaced += 1;
      updateRow(s.id, { score: value, dirty: true });
      filled += 1;
    }
    if (filled === 0) {
      showToast(`Nothing to copy — every student already has the same score as the ${source.label.toLowerCase()}.`);
      return;
    }
    let message = `Copied ${filled} score${filled === 1 ? "" : "s"} from the ${source.label.toLowerCase()} — review, then Save all.`;
    if (replaced > 0) message += ` ${replaced} existing score${replaced === 1 ? " was" : "s were"} replaced (not saved yet).`;
    if (source.maxScore !== targetMax)
      message += ` Note: that exam is out of ${source.maxScore}, this one out of ${targetMax}.`;
    showToast(message);
  }

  async function setUpAndCopy(source: CopySource) {
    const created = await saveMaxScore(source.maxScore);
    if (created) copyScoresFrom(source, created.max_score);
  }

  const copyCount = copySource ? Object.keys(copySource.scores).length : 0;

  async function handleSaveScore(studentId: string) {
    if (!exam) return;
    updateRow(studentId, { saving: true });
    const row = rows[studentId];
    const supabase = createClient();

    const { error } = await supabase.from("major_exam_scores").upsert(
      {
        major_exam_id: exam.id,
        student_id: studentId,
        score: row.score.trim() === "" ? null : Number(row.score),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "major_exam_id,student_id" },
    );

    updateRow(studentId, { saving: false, ...(error ? {} : { dirty: false }) });
    if (error) showToast(error.message);
  }

  // One request for every edited row, instead of a Save click per student.
  async function handleSaveAll() {
    if (!exam) return;
    const dirtyIds = Object.keys(rows).filter((id) => rows[id].dirty);
    if (dirtyIds.length === 0) return;
    for (const id of dirtyIds) updateRow(id, { saving: true });

    const supabase = createClient();
    const now = new Date().toISOString();
    const { error } = await supabase.from("major_exam_scores").upsert(
      dirtyIds.map((id) => ({
        major_exam_id: exam.id,
        student_id: id,
        score: rows[id].score.trim() === "" ? null : Number(rows[id].score),
        updated_at: now,
      })),
      { onConflict: "major_exam_id,student_id" },
    );

    for (const id of dirtyIds) updateRow(id, { saving: false, ...(error ? {} : { dirty: false }) });
    showToast(error ? error.message : `Saved ${dirtyIds.length} score${dirtyIds.length === 1 ? "" : "s"}`);
  }

  const maxScoreForm = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-ink">
        Out of
        <Input
          type="number"
          min={1}
          value={maxScore}
          onChange={(e) => setMaxScore(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSaveMaxScore()}
          className="!w-24 text-center font-mono"
          aria-label="Total points"
          autoFocus={editingMax}
        />
        points
      </label>
      <Button onClick={handleSaveMaxScore} disabled={savingMax}>
        {savingMax ? "Saving…" : exam ? "Save" : "Set up this exam"}
      </Button>
      {exam && (
        <Button
          variant="secondary"
          onClick={() => {
            setMaxScore(String(exam.max_score));
            setEditingMax(false);
          }}
        >
          Cancel
        </Button>
      )}
    </div>
  );

  if (!exam) {
    return (
      <Card className="flex flex-col gap-4">
        <h3 className="font-display text-lg font-semibold text-ink">{label}</h3>
        <div className="rounded-[10px] border border-dashed border-line bg-paper/60 px-5 py-6">
          <p className="text-base font-semibold text-ink">This exam isn&apos;t set up yet.</p>
          <p className="mt-1 text-xs text-muted">How many points is it worth? You can change this later.</p>
          <div className="mt-4">{maxScoreForm}</div>
          {copySource && (
            <div className="mt-4 border-t border-line/60 pt-4">
              <p className="text-xs text-muted">
                Same grades as the {copySource.label.toLowerCase()}? Sets this exam up out of {copySource.maxScore}{" "}
                points and fills in its {copyCount} score{copyCount === 1 ? "" : "s"} for you to review and save.
              </p>
              <Button className="mt-2" onClick={() => setUpAndCopy(copySource)} disabled={savingMax}>
                Set up with the {copySource.label.toLowerCase()} scores
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  }

  const percentScored = students.length ? Math.round((scored / students.length) * 100) : 0;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{label}</h3>
          {editingMax ? (
            <div className="mt-2">{maxScoreForm}</div>
          ) : (
            <p className="mt-1 text-sm text-ink/80">
              Out of <strong className="font-mono">{exam.max_score}</strong> points{" "}
              <button
                type="button"
                onClick={() => setEditingMax(true)}
                className="ml-1 text-xs font-medium text-navy underline underline-offset-2 hover:no-underline"
              >
                Change
              </button>
            </p>
          )}
        </div>
        <div className="min-w-48 text-right">
          <p className="text-sm text-ink">
            <strong>{scored}</strong> of {students.length} students scored
          </p>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-light">
            <div
              className={`h-full rounded-full ${scored === students.length ? "bg-success" : "bg-navy"}`}
              style={{ width: `${percentScored}%` }}
            />
          </div>
        </div>
      </div>

      <div role="tablist" aria-label={`${label} tasks`} className="grid gap-2 sm:grid-cols-3">
        {VIEWS.map((v) => {
          const active = view === v.view;
          return (
            <button
              key={v.view}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(v.view)}
              className={`rounded-[10px] border px-4 py-3 text-left transition ${
                active ? "border-navy bg-navy text-card" : "border-line bg-card text-ink hover:bg-slate-light"
              }`}
            >
              <span className="block text-base font-semibold">{v.label}</span>
              <span className={`block text-xs ${active ? "text-card/80" : "text-muted"}`}>{v.hint}</span>
            </button>
          );
        })}
      </div>

      <div className={view === "scores" ? "" : "hidden"}>
        {copySource && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-line/60 bg-paper/60 p-3">
            <p className="text-sm text-ink">
              Same grades as the <strong>{copySource.label.toLowerCase()}</strong>?{" "}
              <span className="text-xs text-muted">
                ({copyCount} saved score{copyCount === 1 ? "" : "s"}, out of {copySource.maxScore})
              </span>
            </p>
            <Button onClick={() => copyScoresFrom(copySource, exam.max_score)}>
              Copy {copySource.label.toLowerCase()} scores
            </Button>
          </div>
        )}
        <ScoreEntryTable
          students={students}
          rows={rows}
          maxScore={exam.max_score}
          classId={classId}
          title={label}
          onScoreChange={(studentId, value) => updateRow(studentId, { score: value, dirty: true })}
          onSave={handleSaveScore}
          onSaveAll={handleSaveAll}
        />
      </div>
      <div className={view === "scores" ? "hidden" : ""}>
        <ItemAnalysisSection
          view={view === "results" ? "results" : "sheets"}
          classSlug={classSlug}
          exam={exam}
          students={students}
          initialResponses={initialItemResponses}
          programType={programType}
          recordedScores={Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.score]))}
          onScoresSynced={(scores, synced) => {
            // Already saved -- shown as saved, not as unsaved edits.
            for (const [id, score] of Object.entries(scores)) updateRow(id, { score, dirty: false });
            if (synced !== exam.max_score) {
              setExam({ ...exam, max_score: synced });
              setMaxScore(String(synced));
            }
          }}
        />
      </div>
    </Card>
  );
}

export default function MajorExamTab({
  classId,
  classSlug,
  students,
  initialExams,
  initialScores,
  initialItemResponses,
  programType,
  usePrelims,
}: {
  classId: string;
  classSlug: string;
  students: Student[];
  initialExams: MajorExam[];
  initialScores: MajorExamScore[];
  initialItemResponses: MajorExamItemResponse[];
  programType: ProgramType;
  usePrelims: boolean;
}) {
  const periods: Period[] = usePrelims ? ["prelim", "midterm", "finals"] : ["midterm", "finals"];
  const examFor = (period: Period, kind: MajorExamKind) =>
    initialExams.find((e) => e.period === period && (e.kind ?? "written") === kind) ?? null;
  const slots = periods.flatMap((period) =>
    KINDS.map((kind) => ({ period, kind, key: `${period}:${kind}`, exam: examFor(period, kind) })),
  );

  const [summaries, setSummaries] = useState<Record<string, Summary>>(() =>
    Object.fromEntries(
      slots.map((s) => {
        const scores = s.exam ? savedScores(initialScores.filter((x) => x.major_exam_id === s.exam!.id)) : {};
        return [
          s.key,
          { setUp: s.exam != null, maxScore: s.exam?.max_score ?? 0, scored: Object.keys(scores).length, scores },
        ];
      }),
    ),
  );

  // Open on the exam the teacher is most likely working on: the first one
  // that's set up but not fully scored, else the first set-up one.
  const [selected, setSelected] = useState(() => {
    const inProgress = slots.find((s) => s.exam && summaries[s.key].scored < students.length);
    return (inProgress ?? slots.find((s) => s.exam) ?? slots[0]).key;
  });

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Major exams</h2>
        <p className="text-xs text-muted">Choose an exam, then enter its scores or scan the bubble sheets.</p>
      </div>

      <div
        role="tablist"
        aria-label="Major exams"
        className={`grid grid-cols-2 gap-3 ${slots.length === 6 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        {slots.map((s) => {
          const sum = summaries[s.key];
          const active = s.key === selected;
          const done = sum.setUp && students.length > 0 && sum.scored >= students.length;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(s.key)}
              className={`flex flex-col gap-1 rounded-[12px] border-2 px-4 py-3.5 text-left transition ${
                active ? "border-navy bg-card shadow-sm" : "border-line bg-card hover:border-slate"
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {PERIOD_TITLE[s.period]}
              </span>
              <span className="text-base font-semibold text-ink">{KIND_TITLE[s.kind]}</span>
              {!sum.setUp ? (
                <span className="text-xs text-muted">Not set up yet</span>
              ) : (
                <>
                  <span className={`text-xs ${done ? "font-medium text-success-text" : "text-muted"}`}>
                    {done ? "✓ All scored" : `${sum.scored} of ${students.length} scored`} · out of {sum.maxScore}
                  </span>
                  <span className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-light">
                    <span
                      className={`block h-full rounded-full ${done ? "bg-success" : "bg-navy"}`}
                      style={{ width: `${students.length ? Math.round((sum.scored / students.length) * 100) : 0}%` }}
                    />
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {slots.map((s) => {
        const otherKind: MajorExamKind = s.kind === "written" ? "laboratory" : "written";
        const other = summaries[`${s.period}:${otherKind}`];
        const copySource: CopySource | null =
          other?.setUp && Object.keys(other.scores).length > 0
            ? {
                label: `${PERIOD_TITLE[s.period]} ${KIND_TITLE[otherKind].toLowerCase()}`,
                maxScore: other.maxScore,
                scores: other.scores,
              }
            : null;
        return (
          <div key={s.key} className={s.key === selected ? "" : "hidden"}>
            <ExamSection
              classId={classId}
              classSlug={classSlug}
              period={s.period}
              kind={s.kind}
              initialExam={s.exam}
              students={students}
              initialScores={s.exam ? initialScores.filter((x) => x.major_exam_id === s.exam!.id) : []}
              initialItemResponses={s.exam ? initialItemResponses.filter((r) => r.major_exam_id === s.exam!.id) : []}
              programType={programType}
              copySource={copySource}
              onSummary={(summary) =>
                setSummaries((prev) => (sameSummary(prev[s.key], summary) ? prev : { ...prev, [s.key]: summary }))
              }
            />
          </div>
        );
      })}

      <p className="text-xs text-muted">
        A term can have a written and a laboratory exam. With both, each counts for half of the Major Exam weight;
        with only one, it counts for all of it.
      </p>
    </div>
  );
}
