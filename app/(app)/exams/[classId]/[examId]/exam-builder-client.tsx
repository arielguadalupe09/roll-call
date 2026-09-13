"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ExamOption, ExamQuestion, QuestionType } from "@/lib/types";
import { MAX_UPLOAD_BYTES, type ParsedExamQuestion } from "@/lib/exam-ai-parse";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import Button from "@/app/_components/button";
import { optionLetter } from "@/lib/option-letters";

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  identification: "Identification",
  essay: "Essay",
  file_upload: "File upload",
};

type DraftOption = { label: string; isCorrect: boolean };

export default function ExamBuilderClient({
  examId,
  initialQuestions,
  initialOptions,
}: {
  examId: string;
  initialQuestions: ExamQuestion[];
  initialOptions: ExamOption[];
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [questions, setQuestions] = useState(initialQuestions);
  const [optionsByQuestion, setOptionsByQuestion] = useState<Record<string, ExamOption[]>>(() => {
    const grouped: Record<string, ExamOption[]> = {};
    for (const o of initialOptions) {
      (grouped[o.question_id] ??= []).push(o);
    }
    return grouped;
  });

  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<QuestionType>("multiple_choice");
  const [points, setPoints] = useState("1");
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>([
    { label: "", isCorrect: true },
    { label: "", isCorrect: false },
  ]);
  const [trueFalseAnswer, setTrueFalseAnswer] = useState<"true" | "false">("true");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
  const [savingPreview, setSavingPreview] = useState(false);

  // Picks up questions parsed during exam creation (online-exam-panel.tsx
  // uploads the file, then hands off the plain-JSON parse result here via
  // sessionStorage since a File object can't survive the navigation) so the
  // teacher lands straight on the review panel instead of an empty exam.
  // Reading synchronously in the initializer (not an effect) avoids an
  // extra render and a setState-in-effect lint violation. The skipped/
  // truncated toast is a genuine side effect, so it re-reads (and this time
  // clears) the same sessionStorage entry from inside an effect instead --
  // cheap enough that parsing it twice isn't worth avoiding via a ref.
  const [previewQuestions, setPreviewQuestions] = useState<ParsedExamQuestion[] | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(`exam-upload-preview-${examId}`);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { questions: ParsedExamQuestion[] }).questions;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const key = `exam-upload-preview-${examId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    try {
      const data = JSON.parse(raw) as { skipped: number; truncated: boolean };
      if (data.skipped > 0) {
        showToast(
          `Skipped ${data.skipped} item${data.skipped === 1 ? "" : "s"} that didn't look like a gradeable question.`,
        );
      }
      if (data.truncated) {
        showToast("That file was long -- only the first part of it was parsed.");
      }
    } catch {
      // Already surfaced via the initializer above (or malformed) -- nothing more to do.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateDraftOption(index: number, patch: Partial<DraftOption>) {
    setDraftOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function addDraftOption() {
    setDraftOptions((prev) => [...prev, { label: "", isCorrect: false }]);
  }

  function removeDraftOption(index: number) {
    setDraftOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setPrompt("");
    setType("multiple_choice");
    setPoints("1");
    setDraftOptions([
      { label: "", isCorrect: true },
      { label: "", isCorrect: false },
    ]);
    setTrueFalseAnswer("true");
    setCorrectAnswer("");
  }

  async function insertQuestion(input: {
    prompt: string;
    type: QuestionType;
    points: number;
    correctAnswer: string | null;
    options: DraftOption[];
    orderIndex: number;
  }): Promise<{ question: ExamQuestion; options: ExamOption[] } | { error: string }> {
    const supabase = createClient();

    const { data: question, error: insertError } = await supabase
      .from("exam_questions")
      .insert({
        exam_id: examId,
        prompt: input.prompt,
        type: input.type,
        points: input.points,
        order_index: input.orderIndex,
        correct_answer:
          input.type === "true_false" || input.type === "identification" ? input.correctAnswer : null,
      })
      .select()
      .single();

    if (insertError || !question) {
      return { error: insertError?.message ?? "Could not add the question." };
    }

    let newOptions: ExamOption[] = [];
    if (input.type === "multiple_choice") {
      const rows = input.options
        .filter((o) => o.label.trim())
        .map((o, i) => ({
          question_id: (question as ExamQuestion).id,
          label: o.label.trim(),
          is_correct: o.isCorrect,
          order_index: i,
        }));
      const { data: insertedOptions, error: optionsError } = await supabase
        .from("exam_options")
        .insert(rows)
        .select();

      if (optionsError) {
        return { error: optionsError.message };
      }
      newOptions = (insertedOptions as ExamOption[] | null) ?? [];
    }

    return { question: question as ExamQuestion, options: newOptions };
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!prompt.trim()) {
      setError("Give the question a prompt.");
      return;
    }
    if (type === "multiple_choice") {
      const filled = draftOptions.filter((o) => o.label.trim());
      if (filled.length < 2) {
        setError("Add at least two options.");
        return;
      }
      if (!filled.some((o) => o.isCorrect)) {
        setError("Mark one option as correct.");
        return;
      }
    }
    if (type === "identification" && !correctAnswer.trim()) {
      setError("Enter the correct answer.");
      return;
    }

    setLoading(true);
    const result = await insertQuestion({
      prompt: prompt.trim(),
      type,
      points: Number(points) || 1,
      correctAnswer:
        type === "true_false" ? trueFalseAnswer : type === "identification" ? correctAnswer.trim() : null,
      options: draftOptions,
      orderIndex: questions.length,
    });
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setQuestions((prev) => [...prev, result.question]);
    setOptionsByQuestion((prev) => ({ ...prev, [result.question.id]: result.options }));
    resetForm();
  }

  async function handleParseFiles() {
    if (!questionsFile) return;

    const totalBytes = questionsFile.size + (answerKeyFile?.size ?? 0);
    if (totalBytes > MAX_UPLOAD_BYTES) {
      setUploadError("That file (or file + answer key combined) is too large -- max 4MB total.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setPreviewQuestions(null);

    const formData = new FormData();
    formData.append("file", questionsFile);
    if (answerKeyFile) formData.append("answerKey", answerKeyFile);

    const res = await fetch("/api/exams/parse-upload", { method: "POST", body: formData });
    const data = await res.json().catch(() => null);
    setUploading(false);

    if (!res.ok || !data) {
      setUploadError(data?.error ?? "Could not parse that file.");
      return;
    }

    setPreviewQuestions(data.questions as ParsedExamQuestion[]);
    setQuestionsFile(null);
    setAnswerKeyFile(null);
    if (data.skipped > 0) {
      showToast(
        `Skipped ${data.skipped} item${data.skipped === 1 ? "" : "s"} that didn't look like a gradeable question.`,
      );
    }
    if (data.truncated) {
      showToast("That file was long -- only the first part of it was parsed.");
    }
  }

  function discardPreviewQuestion(index: number) {
    setPreviewQuestions((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  async function saveAllPreviewQuestions() {
    if (!previewQuestions || previewQuestions.length === 0) return;
    setSavingPreview(true);

    let orderIndex = questions.length;
    const addedQuestions: ExamQuestion[] = [];
    const addedOptions: Record<string, ExamOption[]> = {};

    for (const pq of previewQuestions) {
      const result = await insertQuestion({
        prompt: pq.prompt,
        type: pq.type,
        points: pq.points,
        correctAnswer: pq.correctAnswer,
        options: pq.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })),
        orderIndex,
      });
      if ("error" in result) {
        showToast(result.error);
        continue;
      }
      addedQuestions.push(result.question);
      addedOptions[result.question.id] = result.options;
      orderIndex += 1;
    }

    setSavingPreview(false);
    setQuestions((prev) => [...prev, ...addedQuestions]);
    setOptionsByQuestion((prev) => ({ ...prev, ...addedOptions }));
    setPreviewQuestions(null);
  }

  async function handleDelete(questionId: string) {
    const confirmed = await confirm("Delete this question?", { confirmLabel: "Delete", danger: true });
    if (!confirmed) return;

    const supabase = createClient();
    const { error: deleteError } = await supabase.from("exam_questions").delete().eq("id", questionId);

    if (deleteError) {
      showToast(deleteError.message);
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  }

  return (
    <div className="mt-6">
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
        <div>
          <p className="font-medium text-ink">Upload questions</p>
          <p className="text-sm text-ink/60">
            Upload a .txt, .docx, or PDF with your questions -- add a separate answer key file too if your
            questions and answers live in different documents. We&apos;ll parse both and let you review
            before anything is added.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="shrink-0 cursor-pointer rounded-sm bg-brass px-4 py-2 text-center text-sm font-medium text-chalk transition hover:brightness-110">
            {questionsFile ? questionsFile.name : "Choose questions file"}
            <input
              type="file"
              accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setQuestionsFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <label className="shrink-0 cursor-pointer rounded-sm bg-rule/30 px-4 py-2 text-center text-sm font-medium text-ink transition hover:bg-rule/45">
            {answerKeyFile ? answerKeyFile.name : "Choose answer key (optional)"}
            <input
              type="file"
              accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setAnswerKeyFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <Button onClick={handleParseFiles} disabled={!questionsFile || uploading}>
            {uploading ? "Parsing..." : "Parse"}
          </Button>
        </div>
      </div>
      {uploadError && <p className="mb-4 text-sm text-danger">{uploadError}</p>}

      {previewQuestions && (
        <div className="mb-6 rounded-2xl border border-brass/60 bg-brass/5 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-ink">
              {previewQuestions.length} question{previewQuestions.length === 1 ? "" : "s"} parsed --
              review before adding
            </p>
            <div className="flex items-center gap-3">
              <Button variant="neutral" size="sm" onClick={() => setPreviewQuestions(null)}>
                Discard all
              </Button>
              <Button
                onClick={saveAllPreviewQuestions}
                disabled={savingPreview || previewQuestions.length === 0}
              >
                {savingPreview
                  ? "Adding..."
                  : `Add ${previewQuestions.length} question${previewQuestions.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {previewQuestions.map((q, i) => (
              <li key={i} className="rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wide text-ink/50">
                      {TYPE_LABEL[q.type]} · {q.points} pt{q.points === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-ink">{q.prompt}</p>
                    {q.type === "multiple_choice" ? (
                      <ul className="mt-2 flex flex-col gap-1">
                        {q.options.map((o, oi) => (
                          <li
                            key={oi}
                            className={`text-sm ${o.isCorrect ? "font-medium text-teal" : "text-ink/70"}`}
                          >
                            {o.isCorrect ? "✓ " : "· "}
                            {optionLetter(oi)}. {o.label}
                          </li>
                        ))}
                      </ul>
                    ) : q.type === "essay" || q.type === "file_upload" ? (
                      <p className="mt-2 text-sm text-ink/60">Manually graded -- no fixed answer.</p>
                    ) : (
                      <p className="mt-2 text-sm text-teal">
                        Correct: {q.correctAnswer?.split("|").join(" / ")}
                      </p>
                    )}
                  </div>
                  <Button variant="danger" size="sm" onClick={() => discardPreviewQuestion(i)}>
                    Discard
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-2xl border border-rule/60 bg-white p-4 shadow-sm"
      >
        <textarea
          placeholder="Question prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
            >
              <option value="multiple_choice">Multiple choice</option>
              <option value="true_false">True / False</option>
              <option value="identification">Identification</option>
              <option value="essay">Essay</option>
              <option value="file_upload">File upload</option>
            </select>
          </label>
          <label className="flex w-28 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Points</span>
            <input
              type="number"
              min={1}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono text-ink outline-none focus:border-brass"
            />
          </label>
        </div>

        {type === "multiple_choice" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">Options (mark the correct one)</span>
            {draftOptions.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct-option"
                  checked={option.isCorrect}
                  onChange={() =>
                    setDraftOptions((prev) => prev.map((o, j) => ({ ...o, isCorrect: j === i })))
                  }
                  className="accent-brass"
                />
                <span className="w-5 shrink-0 text-sm font-medium text-ink/60">{optionLetter(i)}.</span>
                <input
                  type="text"
                  placeholder={`Option ${i + 1}`}
                  value={option.label}
                  onChange={(e) => updateDraftOption(i, { label: e.target.value })}
                  className="flex-1 rounded-sm border border-rule bg-white/60 px-3 py-1.5 text-sm text-ink outline-none focus:border-brass"
                />
                {draftOptions.length > 2 && (
                  <Button variant="danger" size="sm" onClick={() => removeDraftOption(i)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button variant="secondary" size="sm" className="self-start" onClick={addDraftOption}>
              Add option
            </Button>
          </div>
        )}

        {type === "true_false" && (
          <label className="flex w-40 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Correct answer</span>
            <select
              value={trueFalseAnswer}
              onChange={(e) => setTrueFalseAnswer(e.target.value as "true" | "false")}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </label>
        )}

        {type === "identification" && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">
              Correct answer (separate accepted alternates with &quot;|&quot;)
            </span>
            <input
              type="text"
              placeholder="e.g. Manila|Manila City"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
            />
          </label>
        )}

        {type === "essay" && (
          <p className="text-sm text-ink/60">
            No correct answer needed -- you&apos;ll grade each student&apos;s response manually after they
            submit.
          </p>
        )}

        {type === "file_upload" && (
          <p className="text-sm text-ink/60">
            No correct answer needed -- the student attaches a file (report, photo, code) and you&apos;ll
            grade it manually after they submit.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading} className="self-start">
            {loading ? "Adding..." : "Add question"}
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-2xl border border-rule/60 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-wide text-ink/50">
                  {i + 1}. {TYPE_LABEL[q.type]} · {q.points} pt{q.points === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-ink">{q.prompt}</p>
                {q.type === "multiple_choice" ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {(optionsByQuestion[q.id] ?? []).map((o, oi) => (
                      <li
                        key={o.id}
                        className={`text-sm ${o.is_correct ? "font-medium text-teal" : "text-ink/70"}`}
                      >
                        {o.is_correct ? "✓ " : "· "}
                        {optionLetter(oi)}. {o.label}
                      </li>
                    ))}
                  </ul>
                ) : q.type === "essay" || q.type === "file_upload" ? (
                  <p className="mt-2 text-sm text-ink/60">Manually graded -- no fixed answer.</p>
                ) : (
                  <p className="mt-2 text-sm text-teal">
                    Correct: {q.correct_answer?.split("|").join(" / ")}
                  </p>
                )}
              </div>
              <Button variant="danger" size="sm" onClick={() => handleDelete(q.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
        {questions.length === 0 && <p className="text-ink/60">No questions yet.</p>}
      </ul>
    </div>
  );
}
