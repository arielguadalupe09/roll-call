"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SESSION_READER_ID = "student-checkin-reader";
const CODE_READER_ID = "student-code-reader";

type SessionInfo = { classId: string; className: string; date: string };
type Step = "scan" | "code" | "done";
type CodeMode = "type" | "scan";
type AnnouncementInfo = { id: string; title: string; body: string; created_at: string };

export default function PublicCheckinPage() {
  const [step, setStep] = useState<Step>("scan");
  const [codeMode, setCodeMode] = useState<CodeMode>("type");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [announcements, setAnnouncements] = useState<AnnouncementInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sessionScannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const codeScannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const sessionHandledRef = useRef(false);
  const codeHandledRef = useRef(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const confirmCode = useCallback(async (rawCode: string) => {
    const currentToken = tokenRef.current;
    if (!currentToken || !rawCode.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/checkin/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: currentToken, code: rawCode.trim() }),
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

  const handleSessionDecoded = useCallback(async (decodedText: string) => {
    if (sessionHandledRef.current) return;
    const match = /^SESSION\|(.+)$/.exec(decodedText.trim());
    if (!match) return;
    sessionHandledRef.current = true;

    const scanToken = match[1];
    setError(null);
    setLoading(true);

    const res = await fetch("/api/checkin/validate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: scanToken }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "This session code is not valid.");
      sessionHandledRef.current = false;
      return;
    }

    setToken(scanToken);
    setSessionInfo(data);
    setStep("code");
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

  // Scan the projected session QR.
  useEffect(() => {
    if (step !== "scan") return;
    sessionHandledRef.current = false;

    let cancelled = false;
    let startPromise: Promise<unknown> | null = null;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const scanner = new Html5Qrcode(SESSION_READER_ID);
      sessionScannerRef.current = scanner;

      startPromise = scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 240 },
          (decodedText) => handleSessionDecoded(decodedText),
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
          await sessionScannerRef.current?.stop();
          await sessionScannerRef.current?.clear();
        } catch {
          // Already stopped/never started — safe to ignore.
        }
      })();
    };
  }, [step, handleSessionDecoded]);

  // Scan the student's own personal QR card, as an alternative to typing the code.
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
    setStep("scan");
    setCodeMode("type");
    setSessionInfo(null);
    setToken(null);
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

      {step === "scan" && (
        <>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-brass">
            Step 1 of 2 — Scan your teacher&apos;s session QR
          </p>
          <p className="mt-2 max-w-xs text-center text-rule">
            Point your camera at the QR code your teacher is projecting on
            the screen or board. It changes every session, so make sure
            you&apos;re looking at today&apos;s code.
          </p>
          <div className="loupe mt-8 h-72 w-72">
            <div id={SESSION_READER_ID} className="h-72 w-72" />
          </div>
        </>
      )}

      {step === "code" && sessionInfo && (
        <div className="mt-8 w-full max-w-xs">
          <p className="text-center font-mono text-xs uppercase tracking-[0.2em] text-brass">
            Step 2 of 2 — Identify yourself
          </p>
          <div className="ledger-page mt-3 rounded-sm border border-rule p-6 text-ink">
            <p className="font-display text-xl font-semibold">
              {sessionInfo.className}
            </p>
            <p className="font-mono text-sm text-ink/70">
              {sessionInfo.date}
            </p>
            <p className="mt-3 text-sm text-ink/70">
              Now enter the personal code printed on your QR card, or scan
              that card instead — this is how we mark the right student
              present.
            </p>

            {codeMode === "type" ? (
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
            ) : (
              <div className="mt-4 flex flex-col items-center gap-3">
                <div className="loupe h-56 w-56">
                  <div id={CODE_READER_ID} className="h-56 w-56" />
                </div>
                <p className="text-center text-sm text-ink/70">
                  Scan your personal QR card.
                </p>
              </div>
            )}

            <button
              onClick={() => setCodeMode(codeMode === "type" ? "scan" : "type")}
              className="mt-4 text-sm text-teal underline underline-offset-2"
            >
              {codeMode === "type"
                ? "Scan your card instead"
                : "Type your code instead"}
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
