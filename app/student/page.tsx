"use client";

import { useEffect, useRef, useState } from "react";
import { getDeviceId } from "@/lib/device-id";
import CollapsibleSection from "@/app/_components/collapsible-section";
import StudentCodeEntry from "@/app/_components/student-code-entry";
import {
  STUDENT_CODE_KEY,
  type AssessmentEntry,
  type StudentProfile as Profile,
} from "@/lib/student-profile";
import type { AttendanceStatus, SubmissionStatus } from "@/lib/types";

type Step = "code" | "profile";

function formatPercent(value: number | null): string {
  return value == null ? "Not yet graded" : `${value.toFixed(1)}%`;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
  late: "Late",
};

const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  missing: "Not submitted",
  submitted: "Submitted",
  graded: "Graded",
};

function AssessmentSection({ title, entries }: { title: string; entries: AssessmentEntry[] }) {
  return (
    <div className="mt-3 w-full text-left">
      <CollapsibleSection title={title} subtitle={`${entries.length} recorded`}>
        {entries.length === 0 ? (
          <p className="text-sm text-ink/60">Nothing recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm text-ink">
                <span className="min-w-0 flex-1">
                  {e.title}
                  {e.date && <span className="ml-2 text-xs text-ink/50">{e.date}</span>}
                </span>
                <span className="whitespace-nowrap text-ink/70">
                  {e.score == null ? "Not yet graded" : `${e.score}/${e.maxScore}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}

export default function StudentProfilePage() {
  const [step, setStep] = useState<Step>("code");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>({});
  const [resubmitting, setResubmitting] = useState<Record<string, boolean>>({});

  const activeCodeRef = useRef("");

  async function refreshProfile(rawCode: string) {
    const res = await fetch("/api/student/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: rawCode, deviceId: getDeviceId() }),
    });
    const data = await res.json();
    if (res.ok) setProfile(data as Profile);
  }

  useEffect(() => {
    const remembered = window.localStorage.getItem(STUDENT_CODE_KEY);
    if (!remembered) return;
    let cancelled = false;

    (async () => {
      const res = await fetch("/api/student/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: remembered, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (cancelled) return;

      if (!res.ok) {
        // A remembered code stopped working (e.g. device reset by a
        // teacher) -- fall back to asking for it again instead of looping.
        window.localStorage.removeItem(STUDENT_CODE_KEY);
        return;
      }
      activeCodeRef.current = remembered;
      setProfile(data as Profile);
      setStep("profile");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function turnInAssignment(assignmentId: string) {
    const file = pendingFiles[assignmentId];
    if (!file || !activeCodeRef.current) return;
    setUploading((prev) => ({ ...prev, [assignmentId]: true }));
    setSubmitErrors((prev) => ({ ...prev, [assignmentId]: "" }));

    const formData = new FormData();
    formData.append("code", activeCodeRef.current);
    formData.append("deviceId", getDeviceId());
    formData.append("assignmentId", assignmentId);
    formData.append("file", file);

    const res = await fetch("/api/student/submit-assignment", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      setUploading((prev) => ({ ...prev, [assignmentId]: false }));
      setSubmitErrors((prev) => ({ ...prev, [assignmentId]: data.error ?? "Could not submit file." }));
      return;
    }

    await refreshProfile(activeCodeRef.current);
    setUploading((prev) => ({ ...prev, [assignmentId]: false }));
    setPendingFiles((prev) => ({ ...prev, [assignmentId]: null }));
    setResubmitting((prev) => ({ ...prev, [assignmentId]: false }));
  }

  function switchCode() {
    window.localStorage.removeItem(STUDENT_CODE_KEY);
    setProfile(null);
    setStep("code");
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-chalk px-6 py-16 text-paper">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-brass">
        GAINS
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">
        My attendance &amp; grades
      </h1>

      {step === "code" && (
        <div className="mt-8 w-full max-w-xs">
          <StudentCodeEntry
            prompt="Scan the QR code on your personal card, or type your code below, to view your attendance and grades."
            submitLabel="View my profile"
            onSuccess={(resolvedProfile, resolvedCode) => {
              window.localStorage.setItem(STUDENT_CODE_KEY, resolvedCode);
              activeCodeRef.current = resolvedCode;
              setProfile(resolvedProfile);
              setStep("profile");
            }}
          />
        </div>
      )}

      {step === "profile" && profile && (
        <div className="mt-8 w-full max-w-sm">
          <p className="text-center font-display text-2xl font-semibold">
            {profile.studentName}
          </p>
          <p className="text-center text-rule">{profile.className}</p>

          <div className="mt-6 flex flex-col items-center">
            <p className="font-mono text-5xl font-semibold text-brass">
              {profile.attendancePercent == null ? "--" : `${profile.attendancePercent.toFixed(0)}%`}
            </p>
            <p className="text-rule">attendance</p>
          </div>

          <div className="mt-6 ledger-page rounded-sm border border-rule p-4 text-ink">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink/60">
              Grades
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {profile.usePrelims && (
                <div>
                  <dt className="text-ink/60">Prelim</dt>
                  <dd className="font-medium">{formatPercent(profile.finalGrade.prelim)}</dd>
                </div>
              )}
              <div>
                <dt className="text-ink/60">Midterm</dt>
                <dd className="font-medium">{formatPercent(profile.finalGrade.midterm)}</dd>
              </div>
              <div>
                <dt className="text-ink/60">Finals</dt>
                <dd className="font-medium">{formatPercent(profile.finalGrade.finals)}</dd>
              </div>
              <div>
                <dt className="text-ink/60">Final grade</dt>
                <dd className="font-medium">{formatPercent(profile.finalGrade.final)}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-3 w-full text-left">
            <CollapsibleSection
              title="Attendance history"
              subtitle={`${profile.attendanceEntries.length} session${profile.attendanceEntries.length === 1 ? "" : "s"}`}
            >
              {profile.attendanceEntries.length === 0 ? (
                <p className="text-sm text-ink/60">No sessions recorded yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {[...profile.attendanceEntries].reverse().map((entry) => (
                    <li
                      key={entry.date}
                      className="flex items-center justify-between text-sm text-ink"
                    >
                      <span>{entry.date}</span>
                      <span className="text-ink/70">{STATUS_LABEL[entry.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleSection>
          </div>

          <div className="mt-3 w-full text-left">
            <CollapsibleSection
              title="Video lectures"
              subtitle={`${profile.videoLectures.length} posted`}
            >
              {profile.videoLectures.length === 0 ? (
                <p className="text-sm text-ink/60">No lectures posted yet.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {profile.videoLectures.map((lecture) => (
                    <li key={lecture.id} className="text-ink">
                      <p className="font-medium">{lecture.title}</p>
                      {lecture.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">
                          {lecture.description}
                        </p>
                      )}
                      {lecture.signedUrl ? (
                        <video controls className="mt-2 w-full rounded-sm" src={lecture.signedUrl} />
                      ) : lecture.videoUrl ? (
                        <a
                          href={lecture.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-sm text-teal underline underline-offset-2"
                        >
                          Watch on external site →
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleSection>
          </div>

          <div className="mt-3 w-full text-left">
            <CollapsibleSection
              title="Assignments"
              subtitle={`${profile.assignments.length} assigned`}
            >
              {profile.assignments.length === 0 ? (
                <p className="text-sm text-ink/60">No assignments yet.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {profile.assignments.map((a) => {
                    const turnedIn = a.status !== "missing" && !!a.fileName;
                    const showPicker = !turnedIn || resubmitting[a.assignmentId];
                    const pendingFile = pendingFiles[a.assignmentId];

                    return (
                      <li key={a.assignmentId} className="text-ink">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-medium">{a.title}</p>
                          <span className="whitespace-nowrap text-xs text-ink/60">
                            {SUBMISSION_STATUS_LABEL[a.status]}
                          </span>
                        </div>
                        {a.description && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">
                            {a.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-ink/60">
                          {a.dueDate ? `Due ${a.dueDate}` : "No due date"} · Max {a.maxScore}
                        </p>
                        {a.status === "graded" && (
                          <p className="mt-1 text-sm">
                            Score: <span className="font-medium">{a.score ?? "--"}</span>
                            {a.feedback && (
                              <span className="block text-ink/70">{a.feedback}</span>
                            )}
                          </p>
                        )}

                        {turnedIn && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-sm bg-teal/10 px-3 py-2 text-sm text-teal">
                            <span>✓ Turned in</span>
                            {a.fileSignedUrl && (
                              <a
                                href={a.fileSignedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-2"
                              >
                                {a.fileName}
                              </a>
                            )}
                          </div>
                        )}

                        {showPicker ? (
                          <div className="mt-2">
                            <input
                              type="file"
                              disabled={!!uploading[a.assignmentId]}
                              onChange={(e) =>
                                setPendingFiles((prev) => ({
                                  ...prev,
                                  [a.assignmentId]: e.target.files?.[0] ?? null,
                                }))
                              }
                              className="text-xs text-ink/70 file:mr-3 file:rounded-sm file:border file:border-rule file:bg-white/60 file:px-2 file:py-1 file:text-xs file:font-medium"
                            />
                            {pendingFile && (
                              <p className="mt-1 text-xs text-ink/60">
                                Ready to turn in: {pendingFile.name}
                              </p>
                            )}
                            <button
                              onClick={() => turnInAssignment(a.assignmentId)}
                              disabled={!pendingFile || !!uploading[a.assignmentId]}
                              className="mt-2 block rounded-sm bg-brass px-3 py-1.5 text-sm font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
                            >
                              {uploading[a.assignmentId] ? "Turning in..." : "Turn in assignment"}
                            </button>
                            {submitErrors[a.assignmentId] && (
                              <p className="mt-1 text-xs text-danger">{submitErrors[a.assignmentId]}</p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setResubmitting((prev) => ({ ...prev, [a.assignmentId]: true }))
                            }
                            className="mt-2 text-sm text-teal underline underline-offset-2"
                          >
                            Resubmit assignment
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CollapsibleSection>
          </div>

          <AssessmentSection title="Quiz" entries={profile.quizzes} />
          <AssessmentSection title="Written Activity" entries={profile.written} />
          <AssessmentSection title="Laboratory Activity" entries={profile.laboratory} />

          <button
            onClick={switchCode}
            className="mt-6 text-sm text-teal underline underline-offset-2"
          >
            Not you? Switch code
          </button>
        </div>
      )}
    </main>
  );
}
