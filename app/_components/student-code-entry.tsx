"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId } from "@/lib/device-id";
import type { StudentProfile } from "@/lib/student-profile";
import Button from "./button";
import { Input } from "./input";

const CODE_READER_ID = "student-code-entry-reader";

type CodeMode = "type" | "scan";

// The scan-or-type code entry step shared by the /student page and the
// login page's Student tab -- resolves a student by code (device-locked,
// same as check-in) and hands the result back rather than rendering a
// profile itself, so each caller decides what happens next.
export default function StudentCodeEntry({
  prompt = "Scan the QR code on your personal card, or type your code below.",
  submitLabel = "Continue",
  onSuccess,
}: {
  prompt?: string;
  submitLabel?: string;
  onSuccess: (profile: StudentProfile, code: string) => void;
}) {
  const [codeMode, setCodeMode] = useState<CodeMode>("scan");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const codeScannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const codeHandledRef = useRef(false);

  const loadProfile = useCallback(
    async (rawCode: string) => {
      if (!rawCode.trim()) return;
      setLoading(true);
      setError(null);

      const res = await fetch("/api/student/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: rawCode.trim(), deviceId: getDeviceId() }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error ?? "Could not load your profile.");
        codeHandledRef.current = false;
        return;
      }

      onSuccess(data as StudentProfile, rawCode.trim().toUpperCase());
    },
    [onSuccess],
  );

  const handleCodeDecoded = useCallback(
    (decodedText: string) => {
      if (codeHandledRef.current) return;
      codeHandledRef.current = true;
      const decoded = decodedText.trim().toUpperCase();
      setCode(decoded);
      loadProfile(decoded);
    },
    [loadProfile],
  );

  // Scan the student's own personal QR card.
  useEffect(() => {
    if (codeMode !== "scan") return;
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
          // Already stopped/never started -- safe to ignore.
        }
      })();
    };
  }, [codeMode, handleCodeDecoded]);

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    loadProfile(code);
  }

  return (
    <div className="w-full">
      <div className="ledger-page rounded-sm border border-line p-6 text-ink">
        <p className="text-sm text-ink/70">{prompt}</p>

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
              <span className="text-sm font-medium">Your personal code</span>
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 7F3KQ9M"
                className="font-mono uppercase tracking-widest"
              />
            </label>
            <Button type="submit" disabled={loading}>
              {loading ? "Loading..." : submitLabel}
            </Button>
          </form>
        )}

        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => setCodeMode(codeMode === "scan" ? "type" : "scan")}
        >
          {codeMode === "scan" ? "Type your code instead" : "Scan your card instead"}
        </Button>
      </div>

      {error && (
        <p className="mt-4 rounded-sm bg-danger/20 px-3 py-2 text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
