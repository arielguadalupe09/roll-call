"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Assignment, Student, Submission, SubmissionStatus } from "@/lib/types";
import { useToast } from "@/app/_components/toast";

const READER_ID = "roster-scan-reader";

type Row = {
  status: SubmissionStatus;
  score: string;
  feedback: string;
  file_path: string | null;
  file_name: string | null;
  saving: boolean;
  uploading: boolean;
};

function toRow(s: Submission | undefined): Row {
  return {
    status: s?.status ?? "missing",
    score: s?.score != null ? String(s.score) : "",
    feedback: s?.feedback ?? "",
    file_path: s?.file_path ?? null,
    file_name: s?.file_name ?? null,
    saving: false,
    uploading: false,
  };
}

export default function SubmissionRoster({
  classId,
  assignment,
  students,
  initialSubmissions,
}: {
  classId: string;
  assignment: Assignment;
  students: Student[];
  initialSubmissions: Submission[];
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const byStudent = new Map(initialSubmissions.map((s) => [s.student_id, s]));
    const initial: Record<string, Row> = {};
    for (const s of students) initial[s.id] = toRow(byStudent.get(s.id));
    return initial;
  });

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const scoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleScanDecoded = useCallback(
    (code: string) => {
      if (processingRef.current) return;
      const student = students.find((s) => s.code === code.trim());

      if (!student) {
        setScanError(`Unknown code: ${code}`);
        return;
      }

      processingRef.current = true;
      setScanError(null);
      setScanning(false);
      setHighlightedId(student.id);
      rowRefs.current[student.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      scoreInputRefs.current[student.id]?.focus();
      setTimeout(() => setHighlightedId(null), 2000);
    },
    [students],
  );

  useEffect(() => {
    if (!scanning) return;
    processingRef.current = false;
    let cancelled = false;
    let startPromise: Promise<unknown> | null = null;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;

      startPromise = scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          (decodedText) => handleScanDecoded(decodedText),
          () => {},
        )
        .catch(() => {
          if (!cancelled) {
            setScanError("Could not start the camera.");
            setScanning(false);
          }
        });

      await startPromise;
    })();

    return () => {
      cancelled = true;
      (async () => {
        try {
          // Wait for the in-flight start() to fully settle before stopping —
          // stopping mid-start aborts the camera's play() call and leaves
          // the video element broken instead of cleanly stopped.
          await startPromise;
          await scannerRef.current?.stop();
          await scannerRef.current?.clear();
        } catch {
          // Already stopped/never started — safe to ignore.
        }
      })();
    };
  }, [scanning, handleScanDecoded]);

  function updateRow(studentId: string, patch: Partial<Row>) {
    setRows((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  async function handleSave(studentId: string) {
    updateRow(studentId, { saving: true });
    const row = rows[studentId];
    const supabase = createClient();

    const { error } = await supabase.from("submissions").upsert(
      {
        assignment_id: assignment.id,
        student_id: studentId,
        status: row.status,
        score: row.score.trim() === "" ? null : Number(row.score),
        feedback: row.feedback.trim() || null,
        file_path: row.file_path,
        file_name: row.file_name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,student_id" },
    );

    updateRow(studentId, { saving: false });
    if (error) showToast(error.message);
  }

  async function handleFileChange(studentId: string, file: File | null) {
    if (!file) return;
    updateRow(studentId, { uploading: true });

    const supabase = createClient();
    const path = `${classId}/${assignment.id}/${studentId}/${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      updateRow(studentId, { uploading: false });
      showToast(uploadError.message);
      return;
    }

    const nextStatus: SubmissionStatus =
      rows[studentId].status === "missing" ? "submitted" : rows[studentId].status;

    const { error: upsertError } = await supabase.from("submissions").upsert(
      {
        assignment_id: assignment.id,
        student_id: studentId,
        status: nextStatus,
        score: rows[studentId].score.trim() === "" ? null : Number(rows[studentId].score),
        feedback: rows[studentId].feedback.trim() || null,
        file_path: path,
        file_name: file.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,student_id" },
    );

    updateRow(studentId, {
      uploading: false,
      file_path: path,
      file_name: file.name,
      status: nextStatus,
    });

    if (upsertError) showToast(upsertError.message);
  }

  async function handleViewFile(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("submissions")
      .createSignedUrl(path, 60);

    if (error || !data) {
      showToast(error?.message ?? "Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setScanning((prev) => !prev)}
          className="rounded-sm border border-rule px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-ink/5"
        >
          {scanning ? "Stop scanning" : "Scan to find student"}
        </button>
        {scanError && <p className="text-sm text-danger">{scanError}</p>}
      </div>

      {scanning && (
        <div className="mt-4 flex justify-center">
          <div className="loupe h-56 w-56">
            <div id={READER_ID} className="h-56 w-56" />
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-sm border border-rule">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule bg-white font-mono text-xs uppercase tracking-wide text-ink/60">
              <th className="py-2 px-3">Student</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Score / {assignment.max_score}</th>
              <th className="py-2 px-3">Feedback</th>
              <th className="py-2 px-3">File</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const row = rows[s.id];
              return (
                <tr
                  key={s.id}
                  ref={(el) => {
                    rowRefs.current[s.id] = el;
                  }}
                  className={`border-b border-rule/50 align-top transition-colors ${
                    highlightedId === s.id ? "bg-brass/20" : "bg-white"
                  }`}
                >
                  <td className="py-2 px-3 text-ink">{s.name}</td>
                  <td className="py-2 px-3">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        updateRow(s.id, { status: e.target.value as SubmissionStatus })
                      }
                      className="rounded-sm border border-rule bg-white/60 px-2 py-1 text-sm text-ink"
                    >
                      <option value="missing">Missing</option>
                      <option value="submitted">Submitted</option>
                      <option value="graded">Graded</option>
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      ref={(el) => {
                        scoreInputRefs.current[s.id] = el;
                      }}
                      type="number"
                      min={0}
                      max={assignment.max_score}
                      value={row.score}
                      onChange={(e) => updateRow(s.id, { score: e.target.value })}
                      className="w-20 rounded-sm border border-rule bg-white/60 px-2 py-1 font-mono text-sm text-ink"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={row.feedback}
                      onChange={(e) => updateRow(s.id, { feedback: e.target.value })}
                      className="w-full min-w-[10rem] rounded-sm border border-rule bg-white/60 px-2 py-1 text-sm text-ink"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-col gap-1">
                      {row.file_name && (
                        <button
                          onClick={() => row.file_path && handleViewFile(row.file_path)}
                          className="text-left text-xs text-teal underline underline-offset-2"
                        >
                          {row.file_name}
                        </button>
                      )}
                      <input
                        type="file"
                        onChange={(e) =>
                          handleFileChange(s.id, e.target.files?.[0] ?? null)
                        }
                        disabled={row.uploading}
                        className="text-xs text-ink/70"
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => handleSave(s.id)}
                      disabled={row.saving}
                      className="rounded-sm bg-brass px-3 py-1 text-sm font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
                    >
                      {row.saving ? "Saving..." : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 px-3 text-ink/60">
                  No students in this class yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
