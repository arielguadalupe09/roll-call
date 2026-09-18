"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EXAM_KIND_LABEL, type Exam, type ExamKind, type Period } from "@/lib/types";
import { MAX_UPLOAD_BYTES } from "@/lib/exam-ai-parse";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import Button from "@/app/_components/button";
import { Input, Select, Textarea } from "@/app/_components/input";
import { FormField } from "@/app/_components/form-field";

function isUntimedKind(kind: ExamKind): boolean {
  return kind === "written" || kind === "laboratory";
}

function publishedBadge(published: boolean) {
  const color = published ? "bg-success/20 text-success-text" : "bg-ink/10 text-ink/60";
  return (
    <span className={`rounded-sm px-2 py-0.5 font-mono text-xs font-semibold ${color}`}>
      {published ? "Published" : "Draft"}
    </span>
  );
}

// Embedded on each Gradebook category tab (Quiz/Written/Laboratory/Major
// Exam) scoped to that one kind -- previously this was a standalone page
// covering all kinds at once with a Type selector, which left online exams
// disconnected from the manual-entry Gradebook tabs teachers already use for
// the same categories.
export default function OnlineExamPanel({
  classId,
  classSlug,
  kind,
  initialExams,
  usePrelims = false,
}: {
  classId: string;
  // Only used to build links into /exams/[classSlug]/... -- classId (the
  // real uuid) is what the exam row itself is created/queried against.
  classSlug: string;
  kind: ExamKind;
  initialExams: Exam[];
  usePrelims?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [exams, setExams] = useState(initialExams);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [period, setPeriod] = useState<Period>("midterm");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || (!isUntimedKind(kind) && !Number(durationMinutes))) {
      setError("Give the exam a title and a duration in minutes.");
      return;
    }
    const totalBytes = (questionsFile?.size ?? 0) + (answerKeyFile?.size ?? 0);
    if (totalBytes > MAX_UPLOAD_BYTES) {
      setError("That file (or file + answer key combined) is too large -- max 4MB total.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("exams")
      .insert({
        class_id: classId,
        title: title.trim(),
        description: description.trim() || null,
        kind,
        period,
        duration_minutes: isUntimedKind(kind) ? null : Number(durationMinutes),
        available_from: availableFrom ? new Date(availableFrom).toISOString() : null,
        available_until: availableUntil ? new Date(availableUntil).toISOString() : null,
      })
      .select()
      .single();

    if (insertError) {
      setLoading(false);
      setError(insertError.message);
      return;
    }

    const newExam = data as Exam;

    if (questionsFile) {
      setParsing(true);
      const formData = new FormData();
      formData.append("file", questionsFile);
      if (answerKeyFile) formData.append("answerKey", answerKeyFile);

      const res = await fetch("/api/exams/parse-upload", { method: "POST", body: formData });
      const parseData = await res.json().catch(() => null);
      setParsing(false);
      setLoading(false);

      if (!res.ok || !parseData) {
        // The exam itself was created fine -- just take the teacher there to
        // add questions manually, flagging why the upload didn't come along.
        showToast(parseData?.error ?? "Could not parse the uploaded file.");
        router.push(`/exams/${classSlug}/${newExam.id}`);
        return;
      }

      sessionStorage.setItem(
        `exam-upload-preview-${newExam.id}`,
        JSON.stringify({ questions: parseData.questions, skipped: parseData.skipped, truncated: parseData.truncated }),
      );
      router.push(`/exams/${classSlug}/${newExam.id}`);
      return;
    }

    setLoading(false);
    setExams((prev) => [newExam, ...prev]);
    setTitle("");
    setDescription("");
    setPeriod("midterm");
    setDurationMinutes("30");
    setAvailableFrom("");
    setAvailableUntil("");
    setQuestionsFile(null);
    setAnswerKeyFile(null);
  }

  async function togglePublished(exam: Exam) {
    const nextPublished = !exam.published;
    setExams((prev) => prev.map((e) => (e.id === exam.id ? { ...e, published: nextPublished } : e)));

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("exams")
      .update({ published: nextPublished })
      .eq("id", exam.id);

    if (updateError) {
      showToast(updateError.message);
      setExams((prev) => prev.map((e) => (e.id === exam.id ? { ...e, published: !nextPublished } : e)));
    }
  }

  async function handleDelete(id: string) {
    const confirmed = await confirm(
      "Delete this exam? All questions and student attempts for it will be deleted too.",
      { confirmLabel: "Delete", danger: true },
    );
    if (!confirmed) return;

    const supabase = createClient();
    const { error: deleteError } = await supabase.from("exams").delete().eq("id", id);

    if (deleteError) {
      showToast(deleteError.message);
      return;
    }
    setExams((prev) => prev.filter((e) => e.id !== id));
    router.refresh();
  }

  return (
    <div>
      <p className="text-xs text-muted">
        Online {EXAM_KIND_LABEL[kind]} · {exams.length} exam{exams.length === 1 ? "" : "s"}
      </p>
      <form
        onSubmit={handleAdd}
        className="mt-3 flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4"
      >
        <Input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          placeholder="Description / instructions (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <div className="flex flex-wrap gap-3">
          <FormField label="Period" className="w-36">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {usePrelims && <option value="prelim">Prelim</option>}
              <option value="midterm">Midterm</option>
              <option value="finals">Finals</option>
            </Select>
          </FormField>
          {!isUntimedKind(kind) && (
            <FormField label="Duration (min)" className="w-32">
              <Input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="font-mono"
              />
            </FormField>
          )}
          <FormField label="Opens (optional)" className="flex-1">
            <Input
              type="datetime-local"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="font-mono text-sm"
            />
          </FormField>
          <FormField label="Closes (optional)" className="flex-1">
            <Input
              type="datetime-local"
              value={availableUntil}
              onChange={(e) => setAvailableUntil(e.target.value)}
              className="font-mono text-sm"
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-xs font-semibold text-ink">Upload questions (optional)</span>
          <p className="text-xs text-muted">
            Upload a .txt, .docx, or PDF with your questions now and we&apos;ll parse them as soon as the
            exam is created -- add a separate answer key file too if they live in different documents.
            You&apos;ll review everything before it&apos;s saved.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="shrink-0 cursor-pointer rounded-sm bg-gold px-4 py-2 text-center text-sm font-medium text-navy transition hover:brightness-110">
              {questionsFile ? questionsFile.name : "Choose questions file"}
              <input
                type="file"
                accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setQuestionsFile(e.target.files?.[0] ?? null)}
                disabled={loading}
                className="hidden"
              />
            </label>
            <label className="shrink-0 cursor-pointer rounded-sm bg-line/30 px-4 py-2 text-center text-sm font-medium text-ink transition hover:bg-line/45">
              {answerKeyFile ? answerKeyFile.name : "Choose answer key (optional)"}
              <input
                type="file"
                accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setAnswerKeyFile(e.target.files?.[0] ?? null)}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading}>
            {parsing ? "Parsing questions..." : loading ? "Adding..." : "Add exam"}
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <p className="mt-3 text-sm text-ink/60">
        A new exam starts as a draft with no questions. Add questions, then publish it so students can
        see and take it.
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {exams.map((exam) => (
          <li
            key={exam.id}
            className="rounded-[10px] border border-line bg-card p-4 transition hover:border-gold/60"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/exams/${classSlug}/${exam.id}`}
                    className="font-display text-lg font-semibold text-ink underline decoration-ink/20 underline-offset-2 hover:text-slate hover:decoration-slate"
                  >
                    {exam.title}
                  </Link>
                  {publishedBadge(exam.published)}
                </div>
                {exam.description && <p className="mt-1 text-ink/80">{exam.description}</p>}
                <p className="mt-2 font-mono text-xs text-ink/50">
                  {exam.duration_minutes != null ? `${exam.duration_minutes} min · ` : ""}
                  {exam.period}
                  {exam.available_from && ` · Opens ${new Date(exam.available_from).toLocaleString()}`}
                  {exam.available_until && ` · Closes ${new Date(exam.available_until).toLocaleString()}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button href={`/exams/${classSlug}/${exam.id}`} variant="secondary" size="sm">
                    Edit questions →
                  </Button>
                  <Button href={`/exams/${classSlug}/${exam.id}/preview`} variant="secondary" size="sm">
                    Preview →
                  </Button>
                  <Button href={`/exams/${classSlug}/${exam.id}/results`} variant="secondary" size="sm">
                    View results →
                  </Button>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Button variant="primary" size="sm" onClick={() => togglePublished(exam)}>
                  {exam.published ? "Unpublish" : "Publish"}
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(exam.id)}>
                  Delete
                </Button>
              </div>
            </div>
          </li>
        ))}
        {exams.length === 0 && <p className="text-ink/60">No online {EXAM_KIND_LABEL[kind].toLowerCase()} yet.</p>}
      </ul>
    </div>
  );
}
