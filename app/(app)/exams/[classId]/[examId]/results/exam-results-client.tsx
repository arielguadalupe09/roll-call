"use client";

import { Fragment, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Exam, ExamAnswer, ExamAttempt, ExamQuestion, ExamViolation, Student } from "@/lib/types";
import { syncExamAttemptToGradebook } from "@/lib/exam-gradebook-sync";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";
import { tierFor, TIER_TEXT } from "@/lib/chart-tiers";

const SNAPSHOTS_BUCKET = "exam-snapshots";
const SUBMISSIONS_BUCKET = "exam-submissions";

const VIOLATION_LABEL: Record<ExamViolation["type"], string> = {
  tab_switch: "Switched tabs",
  window_blur: "Left the window",
  fullscreen_exit: "Exited fullscreen",
  copy_paste: "Tried to paste",
  periodic: "Periodic check",
};

function statusFor(attempt: ExamAttempt | undefined): string {
  if (!attempt) return "Not started";
  if (attempt.submitted_at) return "Submitted";
  return "In progress";
}

type ExpandedPanel = { studentId: string; panel: "violations" | "grading" };

export default function ExamResultsClient({
  exam,
  students,
  attempts,
  violations,
  questions,
  answers,
}: {
  exam: Exam;
  students: Student[];
  attempts: ExamAttempt[];
  violations: ExamViolation[];
  questions: ExamQuestion[];
  answers: ExamAnswer[];
}) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<ExpandedPanel | null>(null);
  const [snapshotMenuStudentId, setSnapshotMenuStudentId] = useState<string | null>(null);
  const [attemptsState, setAttemptsState] = useState(attempts);
  const [answersState, setAnswersState] = useState(answers);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const essayQuestions = questions.filter((q) => q.type === "essay" || q.type === "file_upload");
  const columnCount = essayQuestions.length > 0 ? 5 : 4;

  const attemptByStudent = new Map(attemptsState.map((a) => [a.student_id, a]));
  const violationsByAttempt = new Map<string, ExamViolation[]>();
  for (const v of violations) {
    (violationsByAttempt.get(v.attempt_id) ?? violationsByAttempt.set(v.attempt_id, []).get(v.attempt_id)!).push(v);
  }
  const answersByAttempt = new Map<string, ExamAnswer[]>();
  for (const a of answersState) {
    (answersByAttempt.get(a.attempt_id) ?? answersByAttempt.set(a.attempt_id, []).get(a.attempt_id)!).push(a);
  }

  async function viewSnapshot(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(SNAPSHOTS_BUCKET).createSignedUrl(path, 60);
    if (error || !data) {
      showToast(error?.message ?? "Could not open snapshot.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function viewSubmission(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(SUBMISSIONS_BUCKET).createSignedUrl(path, 60);
    if (error || !data) {
      showToast(error?.message ?? "Could not open the submitted file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function saveEssayGrade(attempt: ExamAttempt, answer: ExamAnswer, maxPoints: number) {
    const raw = drafts[answer.id];
    const value = raw === undefined ? (answer.points_awarded ?? 0) : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > maxPoints) {
      showToast(`Enter a score between 0 and ${maxPoints}.`);
      return;
    }

    setSavingId(answer.id);
    const supabase = createClient();
    const { error: answerError } = await supabase
      .from("exam_answers")
      .update({ points_awarded: value })
      .eq("id", answer.id);

    if (answerError) {
      setSavingId(null);
      showToast(answerError.message);
      return;
    }

    const attemptAnswers = (answersByAttempt.get(attempt.id) ?? []).map((a) =>
      a.id === answer.id ? { ...a, points_awarded: value } : a,
    );
    const newScore = attemptAnswers.reduce((sum, a) => sum + (a.points_awarded ?? 0), 0);
    const stillPending = attemptAnswers.some((a) => a.points_awarded === null);

    const { error: attemptError } = await supabase
      .from("exam_attempts")
      .update({ score: newScore, needs_grading: stillPending })
      .eq("id", attempt.id);

    setSavingId(null);
    if (attemptError) {
      showToast(attemptError.message);
      return;
    }

    if (!stillPending) {
      await syncExamAttemptToGradebook(supabase, exam, {
        student_id: attempt.student_id,
        score: newScore,
        total_points: attempt.total_points,
        needs_grading: false,
      });
    }

    setAnswersState((prev) => prev.map((a) => (a.id === answer.id ? { ...a, points_awarded: value } : a)));
    setAttemptsState((prev) =>
      prev.map((a) => (a.id === attempt.id ? { ...a, score: newScore, needs_grading: stillPending } : a)),
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[answer.id];
      return next;
    });
  }

  return (
    <div className="mt-6">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Student</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell align="right">Score</TableHeaderCell>
            <TableHeaderCell>Violations</TableHeaderCell>
            {essayQuestions.length > 0 && <TableHeaderCell>Grading</TableHeaderCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {students.map((student) => {
            const attempt = attemptByStudent.get(student.id);
            const studentViolations = attempt ? (violationsByAttempt.get(attempt.id) ?? []) : [];
            const flaggedViolations = studentViolations.filter((v) => v.type !== "periodic");
            const snapshotCount = studentViolations.filter((v) => v.snapshot_path).length;
            const isSnapshotMenuOpen = snapshotMenuStudentId === student.id;
            const essayEntries = attempt
              ? essayQuestions
                  .map((q) => ({
                    question: q,
                    answer: (answersByAttempt.get(attempt.id) ?? []).find((a) => a.question_id === q.id),
                  }))
                  .filter(
                    (e): e is { question: ExamQuestion; answer: ExamAnswer } =>
                      !!e.answer && (!!e.answer.answer_text?.trim() || !!e.answer.file_path),
                  )
              : [];
            const isViolationsExpanded = expanded?.studentId === student.id && expanded.panel === "violations";
            const isGradingExpanded = expanded?.studentId === student.id && expanded.panel === "grading";

            const scoreRate =
              attempt?.submitted_at && attempt.score != null && attempt.total_points
                ? attempt.score / attempt.total_points
                : null;

            return (
              <Fragment key={student.id}>
                <TableRow striped>
                  <TableCell>{student.name}</TableCell>
                  <TableCell className="text-ink/80">{statusFor(attempt)}</TableCell>
                  <TableCell
                    align="right"
                    tabular
                    className={scoreRate != null ? TIER_TEXT[tierFor(scoreRate)] : undefined}
                  >
                    {attempt?.submitted_at ? `${attempt.score} / ${attempt.total_points}` : "--"}
                  </TableCell>
                  <TableCell>
                    {studentViolations.length === 0 ? (
                      <span className="text-ink/50">--</span>
                    ) : (
                      <button
                        onClick={() => {
                          setExpanded(
                            isViolationsExpanded ? null : { studentId: student.id, panel: "violations" },
                          );
                          setSnapshotMenuStudentId(null);
                        }}
                        className={`rounded-sm px-2 py-0.5 font-mono text-xs font-semibold ${
                          flaggedViolations.length > 0
                            ? "bg-danger/15 text-danger"
                            : "bg-ink/10 text-ink/70"
                        }`}
                      >
                        {flaggedViolations.length > 0
                          ? `${flaggedViolations.length} flagged`
                          : `${studentViolations.length} check${studentViolations.length === 1 ? "" : "s"}`}{" "}
                        {isViolationsExpanded ? "▲" : "▼"}
                      </button>
                    )}
                  </TableCell>
                  {essayQuestions.length > 0 && (
                    <TableCell>
                      {essayEntries.length === 0 ? (
                        <span className="text-ink/50">--</span>
                      ) : (
                        <button
                          onClick={() =>
                            setExpanded(isGradingExpanded ? null : { studentId: student.id, panel: "grading" })
                          }
                          className={`rounded-sm px-2 py-0.5 font-mono text-xs font-semibold ${
                            attempt?.needs_grading ? "bg-gold/20 text-gold" : "bg-success/15 text-success-text"
                          }`}
                        >
                          {attempt?.needs_grading ? "Needs grading" : "Graded"} {isGradingExpanded ? "▲" : "▼"}
                        </button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
                {isViolationsExpanded && (
                  <TableRow className="bg-danger/5">
                    <TableCell colSpan={columnCount} className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <ul className="flex flex-col gap-1.5">
                          {studentViolations.map((v) => (
                            <li key={v.id} className="flex items-center gap-3 text-sm text-ink">
                              <span className="font-mono text-xs text-ink/50">
                                {new Date(v.occurred_at).toLocaleTimeString()}
                              </span>
                              <span>{VIOLATION_LABEL[v.type]}</span>
                            </li>
                          ))}
                        </ul>
                        {snapshotCount > 0 && (
                          <div className="relative shrink-0">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setSnapshotMenuStudentId(isSnapshotMenuOpen ? null : student.id)
                              }
                            >
                              View snapshots ({snapshotCount}) {isSnapshotMenuOpen ? "▲" : "▼"}
                            </Button>
                            {isSnapshotMenuOpen && (
                              <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col overflow-hidden rounded-sm border border-line bg-white shadow-md">
                                {studentViolations
                                  .filter((v) => v.snapshot_path)
                                  .map((v) => (
                                    <button
                                      key={v.id}
                                      onClick={() => {
                                        viewSnapshot(v.snapshot_path!);
                                        setSnapshotMenuStudentId(null);
                                      }}
                                      className="flex flex-col items-start gap-0.5 border-b border-line/50 px-3 py-2 text-left text-sm text-ink last:border-b-0 hover:bg-navy"
                                    >
                                      <span>{VIOLATION_LABEL[v.type]}</span>
                                      <span className="font-mono text-xs text-ink/50">
                                        {new Date(v.occurred_at).toLocaleTimeString()}
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {isGradingExpanded && attempt && (
                  <TableRow className="bg-gold/5">
                    <TableCell colSpan={columnCount} className="py-3">
                      <ul className="flex flex-col gap-3">
                        {essayEntries.map(({ question, answer }) => (
                          <li key={answer.id} className="rounded-sm border border-line/60 bg-white p-3">
                            <p className="text-xs text-muted">
                              {question.prompt} · max {question.points} pt{question.points === 1 ? "" : "s"}
                            </p>
                            {question.type === "file_upload" ? (
                              answer.file_path ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="mt-1"
                                  onClick={() => viewSubmission(answer.file_path!)}
                                >
                                  View submitted file
                                </Button>
                              ) : (
                                <p className="mt-1 text-sm text-ink/50">No file submitted.</p>
                              )
                            ) : (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{answer.answer_text}</p>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={question.points}
                                value={drafts[answer.id] ?? answer.points_awarded ?? ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({ ...prev, [answer.id]: e.target.value }))
                                }
                                placeholder="Score"
                                className="!w-24 !py-1 font-mono text-sm"
                              />
                              <span className="text-xs text-ink/50">/ {question.points}</span>
                              <Button
                                size="sm"
                                onClick={() => saveEssayGrade(attempt, answer, question.points)}
                                disabled={savingId === answer.id}
                              >
                                {savingId === answer.id ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {students.length === 0 && (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-4">
                No students in this class yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
