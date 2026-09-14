"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device-id";
import StudentCodeEntry from "@/app/_components/student-code-entry";
import { STUDENT_CODE_KEY } from "@/lib/student-profile";
import type { ExamKind, QuestionType, ViolationType } from "@/lib/types";
import Button from "@/app/_components/button";
import { useConfirm } from "@/app/_components/confirm-provider";
import { Input, Textarea } from "@/app/_components/input";

type ExamOptionView = { id: string; label: string };
type ExamQuestionView = {
  id: string;
  prompt: string;
  type: QuestionType;
  points: number;
  options: ExamOptionView[];
};
type ExamInfo = {
  id: string;
  title: string;
  description: string | null;
  kind: ExamKind;
  durationMinutes: number | null;
  availableUntil: string | null;
};
type AnswerDraft = {
  selectedOptionId: string | null;
  answerText: string | null;
  filePath: string | null;
  fileName: string | null;
};
type ExistingAnswer = {
  question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
  file_path: string | null;
};

const EMPTY_DRAFT: AnswerDraft = { selectedOptionId: null, answerText: null, filePath: null, fileName: null };

type Step = "resolving" | "code" | "exam" | "submitted" | "error";

const PERIODIC_SNAPSHOT_INTERVAL_MS = 20 * 60 * 1000;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function StudentExamPage() {
  const params = useParams<{ examId: string }>();
  const examId = params.examId;
  const router = useRouter();
  const confirm = useConfirm();

  const [step, setStep] = useState<Step>("resolving");
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionView[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; totalPoints: number; needsGrading: boolean } | null>(
    null,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [flaggedCount, setFlaggedCount] = useState(0);

  const codeRef = useRef("");
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const answersRef = useRef(answers);
  const questionsRef = useRef(questions);
  const attemptIdRef = useRef<string | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);
  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  function applyStartResult(data: {
    exam: ExamInfo;
    questions: ExamQuestionView[];
    attemptId: string;
    startedAt: string;
    existingAnswers: ExistingAnswer[];
  }) {
    setExam(data.exam);
    setQuestions(data.questions);
    setAttemptId(data.attemptId);
    setDeadline(
      data.exam.durationMinutes != null
        ? new Date(data.startedAt).getTime() + data.exam.durationMinutes * 60000
        : null,
    );
    const hydrated: Record<string, AnswerDraft> = {};
    for (const a of data.existingAnswers) {
      hydrated[a.question_id] = {
        selectedOptionId: a.selected_option_id,
        answerText: a.answer_text,
        filePath: a.file_path,
        fileName: null,
      };
    }
    setAnswers(hydrated);
    setStep("exam");
  }

  const startExam = useCallback(
    async (code: string) => {
      setStep("resolving");
      setError(null);

      const res = await fetch("/api/student/exam/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceId: getDeviceId(), examId }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.submitted) {
          setResult({ score: data.score, totalPoints: data.totalPoints, needsGrading: !!data.needsGrading });
          setStep("submitted");
          return;
        }
        setError(data.error ?? "Could not start the exam.");
        setStep("error");
        return;
      }

      codeRef.current = code;
      applyStartResult(data);
    },
    [examId],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const remembered = window.localStorage.getItem(STUDENT_CODE_KEY);
      if (!remembered) {
        setStep("code");
        return;
      }

      const res = await fetch("/api/student/exam/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: remembered, deviceId: getDeviceId(), examId }),
      });
      const data = await res.json();
      if (cancelled) return;

      if (!res.ok) {
        if (data.submitted) {
          setResult({ score: data.score, totalPoints: data.totalPoints, needsGrading: !!data.needsGrading });
          setStep("submitted");
          return;
        }
        setError(data.error ?? "Could not start the exam.");
        setStep("error");
        return;
      }

      codeRef.current = remembered;
      applyStartResult(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [examId]);

  const submitRef = useRef<() => void>(() => {});

  const handleSubmit = useCallback(async () => {
    const currentAttemptId = attemptIdRef.current;
    if (!currentAttemptId) return;
    setSubmitting(true);

    const payload = questionsRef.current.map((q) => ({
      questionId: q.id,
      selectedOptionId: answersRef.current[q.id]?.selectedOptionId ?? null,
      answerText: answersRef.current[q.id]?.answerText ?? null,
      filePath: answersRef.current[q.id]?.filePath ?? null,
    }));

    const res = await fetch("/api/student/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: codeRef.current,
        deviceId: getDeviceId(),
        attemptId: currentAttemptId,
        answers: payload,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (res.ok) {
      setResult({ score: data.score, totalPoints: data.totalPoints, needsGrading: !!data.needsGrading });
      setStep("submitted");
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    submitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Countdown, computed from the server's started_at -- auto-submits at
  // zero. Reads the latest submit logic via a ref so this effect doesn't
  // need to restart every time answers/attemptId change.
  useEffect(() => {
    if (step !== "exam" || deadline == null) return;
    function tick() {
      const left = (deadline as number) - Date.now();
      setRemaining(left);
      if (left <= 0) submitRef.current();
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step, deadline]);

  const captureSnapshot = useCallback(async (): Promise<Blob | null> => {
    const stream = cameraStreamRef.current;
    if (!stream) return null;
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 150));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.7));
    } catch {
      return null;
    }
  }, []);

  const sendSnapshotEvent = useCallback(
    async (type: ViolationType) => {
      const currentAttemptId = attemptIdRef.current;
      if (!currentAttemptId) return;

      const snapshot = await captureSnapshot();
      const formData = new FormData();
      formData.append("code", codeRef.current);
      formData.append("deviceId", getDeviceId());
      formData.append("attemptId", currentAttemptId);
      formData.append("type", type);
      if (snapshot) formData.append("snapshot", snapshot, "snapshot.jpg");

      fetch("/api/student/exam/violation", { method: "POST", body: formData }).catch(() => {});
    },
    [captureSnapshot],
  );

  const reportViolation = useCallback(
    (type: ViolationType) => {
      setFlaggedCount((prev) => prev + 1);
      sendSnapshotEvent(type);
    },
    [sendSnapshotEvent],
  );

  // Camera access is requested once the exam view mounts (permission
  // denial is fine -- violations just won't carry a snapshot). Stream is
  // stopped on unmount/submit, never left running in the background.
  useEffect(() => {
    if (step !== "exam") return;
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
      })
      .catch(() => {
        // Denied or unavailable -- proceed without snapshots.
      });

    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    };
  }, [step]);

  // Periodic spot-check snapshot, independent of the event-based violations
  // below -- catches behavior (e.g. a phone in frame) that focus/blur/paste
  // listeners can't. Not counted in flaggedCount; see sendSnapshotEvent.
  useEffect(() => {
    if (step !== "exam") return;
    const id = setInterval(() => sendSnapshotEvent("periodic"), PERIODIC_SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [step, sendSnapshotEvent]);

  // Focus/paste/fullscreen-exit detection -- this is what's actually
  // achievable from a web page (see plan notes: Alt+Tab itself can't be
  // blocked, only its effect on this tab's focus/visibility can be seen).
  useEffect(() => {
    if (step !== "exam") return;

    function onVisibilityChange() {
      if (document.hidden) reportViolation("tab_switch");
    }
    function onBlur() {
      reportViolation("window_blur");
    }
    function onFullscreenChange() {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) reportViolation("fullscreen_exit");
    }
    function onPaste(e: ClipboardEvent) {
      e.preventDefault();
      reportViolation("copy_paste");
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [step, reportViolation]);

  function enterFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const isUntimedKind = exam?.kind === "written" || exam?.kind === "laboratory";

  // Quiz/major_exam only persist answers at final submit, so leaving early
  // would silently drop whatever's currently typed -- written/laboratory
  // activities autosave, so nothing is actually at risk there, but the
  // confirmation still shows (with accurate wording) for a predictable exit
  // flow either way. Not letting the browser's own back button bypass this
  // is out of scope; this just covers the in-page exit link.
  async function handleLeave(e: React.MouseEvent) {
    e.preventDefault();
    const confirmed = await confirm(
      isUntimedKind
        ? "Leave this activity? Your progress is saved, so you can come back anytime before it closes."
        : "Leave without submitting? Your answers on this attempt haven't been saved and will be lost.",
      { confirmLabel: "Leave", danger: !isUntimedKind },
    );
    if (confirmed) router.push("/student");
  }

  function updateAnswer(questionId: string, patch: Partial<AnswerDraft>) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...EMPTY_DRAFT, ...prev[questionId], ...patch },
    }));
  }

  // Written/laboratory activities have no timed sitting -- a student may
  // work across multiple visits, so typed answers autosave on a debounce
  // instead of only persisting at final submit (unlike quiz/major_exam,
  // which keep the original local-state-only behavior).
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function scheduleAutosave(questionId: string) {
    if (!isUntimedKind) return;
    const currentAttemptId = attemptIdRef.current;
    if (!currentAttemptId) return;
    if (saveTimersRef.current[questionId]) clearTimeout(saveTimersRef.current[questionId]);
    saveTimersRef.current[questionId] = setTimeout(() => {
      const draft = answersRef.current[questionId];
      fetch("/api/student/exam/save-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeRef.current,
          deviceId: getDeviceId(),
          attemptId: currentAttemptId,
          questionId,
          selectedOptionId: draft?.selectedOptionId ?? null,
          answerText: draft?.answerText ?? null,
        }),
      }).catch(() => {});
    }, 1500);
  }

  function setSelectedOption(questionId: string, optionId: string) {
    updateAnswer(questionId, { selectedOptionId: optionId, answerText: null });
    scheduleAutosave(questionId);
  }

  function setAnswerText(questionId: string, text: string) {
    updateAnswer(questionId, { answerText: text, selectedOptionId: null });
    scheduleAutosave(questionId);
  }

  async function uploadFileAnswer(questionId: string, file: File) {
    const currentAttemptId = attemptIdRef.current;
    if (!currentAttemptId) return;
    updateAnswer(questionId, { fileName: "Uploading..." });

    const formData = new FormData();
    formData.append("code", codeRef.current);
    formData.append("deviceId", getDeviceId());
    formData.append("attemptId", currentAttemptId);
    formData.append("questionId", questionId);
    formData.append("file", file);

    const res = await fetch("/api/student/exam/upload-answer", { method: "POST", body: formData });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      updateAnswer(questionId, { filePath: data.filePath, fileName: data.fileName });
    } else {
      updateAnswer(questionId, { fileName: null });
    }
  }

  if (step === "code") {
    return (
      <main className="flex flex-1 flex-col items-center bg-navy px-6 py-16 text-card">
        <p className="text-sm text-gold">GAINS</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Sign in to take this exam</h1>
        <div className="mt-8 w-full max-w-xs">
          <StudentCodeEntry
            submitLabel="Continue"
            onSuccess={(_profile, code) => {
              window.localStorage.setItem(STUDENT_CODE_KEY, code);
              startExam(code);
            }}
          />
        </div>
      </main>
    );
  }

  if (step === "resolving") {
    return (
      <main className="flex flex-1 items-center justify-center bg-navy px-6 py-16 text-card">
        <p className="text-card/70">Loading exam...</p>
      </main>
    );
  }

  if (step === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-navy px-6 py-16 text-card">
        <p className="rounded-sm bg-danger/20 px-4 py-3 text-center text-danger">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => {
            window.localStorage.removeItem(STUDENT_CODE_KEY);
            setStep("code");
          }}
        >
          Switch code
        </Button>
      </main>
    );
  }

  if (step === "submitted") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-navy px-6 py-16 text-card">
        <p className="text-sm text-gold">Exam submitted</p>
        {result &&
          (result.needsGrading ? (
            <p className="mt-4 max-w-xs text-center text-lg text-card">
              Your score will be available once your teacher reviews your written answers.
            </p>
          ) : (
            <p className="mt-4 font-mono text-5xl font-semibold text-gold">
              {result.score} / {result.totalPoints}
            </p>
          ))}
        <Button href="/student" variant="secondary" size="sm" className="mt-6">
          Back to my profile
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-navy px-6 py-10 text-card">
      <div className="sticky top-0 z-10 flex w-full max-w-xl flex-col items-center gap-2 bg-navy pb-4 pt-2">
        <Button href="/student" variant="secondary" size="sm" onClick={handleLeave} className="self-start">
          ← My profile
        </Button>
        <p className="text-sm text-gold">{exam?.title}</p>
        {deadline != null ? (
          <p className="font-mono text-4xl font-semibold">{formatClock(remaining)}</p>
        ) : (
          exam?.availableUntil && (
            <p className="text-sm text-card">
              Due {new Date(exam.availableUntil).toLocaleString()}
            </p>
          )
        )}
        {!isFullscreen && (
          <Button variant="secondary" size="sm" onClick={enterFullscreen}>
            Enter fullscreen (recommended)
          </Button>
        )}
        {flaggedCount > 0 && (
          <p className="text-xs text-danger">
            {flaggedCount} action{flaggedCount === 1 ? "" : "s"} flagged this attempt
          </p>
        )}
      </div>

      <div className="mt-4 flex w-full max-w-xl flex-col gap-4">
        {questions.map((q, i) => (
          <div key={q.id} className="ledger-page rounded-sm border border-line p-4 text-ink">
            <p className="text-xs text-muted">
              {i + 1}. {q.points} pt{q.points === 1 ? "" : "s"}
            </p>
            <p className="mt-1 font-medium">{q.prompt}</p>

            {q.type === "multiple_choice" ? (
              <div className="mt-3 flex flex-col gap-2">
                {q.options.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id]?.selectedOptionId === o.id}
                      onChange={() => setSelectedOption(q.id, o.id)}
                      className="accent-gold"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            ) : q.type === "essay" ? (
              <Textarea
                value={answers[q.id]?.answerText ?? ""}
                onChange={(e) => setAnswerText(q.id, e.target.value)}
                placeholder="Your answer"
                rows={6}
                className="mt-3 w-full"
              />
            ) : q.type === "file_upload" ? (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFileAnswer(q.id, file);
                  }}
                  className="text-sm text-ink"
                />
                {(answers[q.id]?.fileName || answers[q.id]?.filePath) && (
                  <p className="text-xs text-success-text">
                    Uploaded: {answers[q.id]?.fileName ?? "a file (from an earlier visit)"}
                  </p>
                )}
              </div>
            ) : (
              <Input
                type="text"
                value={answers[q.id]?.answerText ?? ""}
                onChange={(e) => setAnswerText(q.id, e.target.value)}
                placeholder={q.type === "true_false" ? "true or false" : "Your answer"}
                className="mt-3 w-full"
              />
            )}
          </div>
        ))}
      </div>

      <Button onClick={() => handleSubmit()} disabled={submitting} className="mt-6 px-6 py-3">
        {submitting ? "Submitting..." : isUntimedKind ? "Turn in" : "Submit exam"}
      </Button>
    </main>
  );
}
