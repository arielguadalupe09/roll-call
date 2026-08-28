"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CODE_READER_ID = "student-code-reader";

type Step = "code" | "done";
type CodeMode = "type" | "scan";
type AnnouncementInfo = { id: string; title: string; body: string; created_at: string };

export default function PublicCheckinPage() {
  const [step, setStep] = useState<Step>("code");
  const [codeMode, setCodeMode] = useState<CodeMode>("scan");
  const [code, setCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [announcements, setAnnouncements] = useState<AnnouncementInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const codeScannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const codeHandledRef = useRef(false);

  const confirmCode = useCallback(async (rawCode: string) => {
    if (!rawCode.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/checkin/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: rawCode.trim() }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not check you in.");
      codeHandledRef.current = false;
      return;
    }

    setStudentName(data.name);
    setAnnouncements(data.announcements ?? []);
    setStep("done");
  }, []);

  const handleCodeDecoded = useCallback(
    (decodedText: string) => {
      if (codeHandledRef.current) return;
      codeHandledRef.current = true;
      const decoded = decodedText.trim().toUpperCase();
      setCode(decoded);
      confirmCode(decoded);
    },
    [confirmCode],
  );

  // Scan the student's own personal QR card.
  useEffect(() => {
    if (step !== "code" || codeMode !== "scan") return;
    codeHandledRef.current = false;

    let cancelled = false;
    let startPromise: Promise<unknown> | null = null;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const scanner = new Html5Qrcode(CODE_READER_ID);
      codeScannerRef.current = scanner;

      startPromise = scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          (decodedText) => handleCodeDecoded(decodedText),
          () => {},
        )
        .catch(() => {
          if (!cancelled) setError("Could not start the camera.");
        });

      await startPromise;
    })();

    return () => {
      cancelled = true;
      (async () => {
        try {
          // Wait for the in-flight start() to fully settle before stopping —
          // stopping mid-start (e.g. React Strict Mode's dev-only double
          // mount/cleanup) aborts the camera's play() call and leaves the
          // video element broken instead of cleanly stopped.
          await startPromise;
          await codeScannerRef.current?.stop();
          await codeScannerRef.current?.clear();
        } catch {
          // Already stopped/never started — safe to ignore.
        }
      })();
    };
  }, [step, codeMode, handleCodeDecoded]);

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    confirmCode(code);
  }

  function startOver() {
    setStep("code");
    setCodeMode("scan");
    setCode("");
    setAnnouncements([]);
    setError(null);
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-chalk px-6 py-16 text-paper">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-brass">
        Roll Call
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">
        Student check-in
      </h1>

      {step === "code" && (
        <div className="mt-8 w-full max-w-xs">
          <div className="ledger-page rounded-sm border border-rule p-6 text-ink">
            <p className="text-sm text-ink/70">
              Scan the QR code on your personal card, or type your code below
              — this only works while your teacher has an active check-in
              session open for your class.
            </p>

            {codeMode === "scan" ? (
              <div className="mt-4 flex flex-col items-center gap-3">
                <div className="loupe h-56 w-56">
                  <div id={CODE_READER_ID} className="h-56 w-56" />
                </div>
                <p className="text-center text-sm text-ink/70">
                  Scan your personal QR card.
                </p>
              </div>
            ) : (
              <form onSubmit={submitCode} className="mt-4 flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    Your personal code
                  </span>
                  <input
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 7F3KQ9M"
                    className="rounded-sm border border-rule bg-white/60 px-3 py-2 font-mono uppercase tracking-widest text-ink outline-none focus:border-brass"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
                >
                  {loading ? "Checking in..." : "Check in"}
                </button>
              </form>
            )}

            <button
              onClick={() => setCodeMode(codeMode === "scan" ? "type" : "scan")}
              className="mt-4 text-sm text-teal underline underline-offset-2"
            >
              {codeMode === "scan"
                ? "Type your code instead"
                : "Scan your card instead"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="stamp-in mt-12 flex w-full max-w-xs flex-col items-center">
          <p className="rotate-[-6deg] border-4 border-brass px-6 py-4 text-center font-display text-2xl font-bold uppercase text-brass">
            Welcome, {studentName}
          </p>
          <p className="mt-4 text-rule">You&apos;re marked present.</p>

          {announcements.length > 0 && (
            <div className="mt-8 w-full">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-rule">
                Announcements
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {announcements.map((a) => (
                  <li
                    key={a.id}
                    className="ledger-page rounded-sm border border-rule p-4 text-left text-ink"
                  >
                    <p className="font-display text-lg font-semibold">{a.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-ink/80">{a.body}</p>
                    <p className="mt-2 font-mono text-xs text-ink/50">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="rounded-sm bg-danger/20 px-3 py-2 text-sm text-danger">
            {error}
          </p>
          <button
            onClick={startOver}
            className="text-sm text-teal underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
