"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayLocalDate } from "@/lib/date";
import { playBeep } from "@/lib/beep";
import type { AttendanceStatus, ParticipationType } from "@/lib/types";

const READER_ID = "scan-reader";

type ScanMode = "attendance" | ParticipationType;

type Stamp = { name: string; time: string; note?: string } | null;
type PendingLog = { studentId: string; name: string } | null;
type Toast = { kind: "error" | "info"; message: string } | null;

const MODE_LABELS: Record<ScanMode, string> = {
  attendance: "Attendance",
  recitation: "Recitation",
  activity: "Activity",
};

const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "excused", "late"];

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; full: string; active: string; inactive: string }
> = {
  present: {
    label: "P",
    full: "Present",
    active: "bg-teal text-chalk border-teal",
    inactive: "text-teal border-teal/40 hover:bg-teal/10",
  },
  absent: {
    label: "A",
    full: "Absent",
    active: "bg-danger text-chalk border-danger",
    inactive: "text-danger border-danger/40 hover:bg-danger/10",
  },
  excused: {
    label: "E",
    full: "Excused",
    active: "bg-paper text-ink border-paper",
    inactive: "text-paper border-paper/40 hover:bg-white/5",
  },
  late: {
    label: "L",
    full: "Late",
    active: "bg-brass text-chalk border-brass",
    inactive: "text-brass border-brass/40 hover:bg-brass/10",
  },
};

export default function ScanClient({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const [date, setDate] = useState(todayLocalDate());
  const [mode, setMode] = useState<ScanMode>("attendance");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>("present");
  const [activityLabel, setActivityLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [stamp, setStamp] = useState<Stamp>(null);
  const [pendingLog, setPendingLog] = useState<PendingLog>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [hardwareCode, setHardwareCode] = useState("");

  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const startPromiseRef = useRef<Promise<unknown> | null>(null);
  const processingRef = useRef(false);
  const dateRef = useRef(date);
  const modeRef = useRef(mode);
  const attendanceStatusRef = useRef(attendanceStatus);
  const activityLabelRef = useRef(activityLabel);
  const hardwareInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    attendanceStatusRef.current = attendanceStatus;
  }, [attendanceStatus]);

  useEffect(() => {
    activityLabelRef.current = activityLabel;
  }, [activityLabel]);

  useEffect(() => {
    return () => {
      (async () => {
        try {
          // Wait for any in-flight start() to fully settle before stopping —
          // stopping mid-start aborts the camera's play() call and leaves
          // the video element broken instead of cleanly stopped.
          await startPromiseRef.current;
          await scannerRef.current?.stop();
          await scannerRef.current?.clear();
        } catch {
          // Already stopped/never started — safe to ignore.
        }
      })();
    };
  }, []);

  const canStart = mode !== "activity" || activityLabel.trim().length > 0;

  async function startScanning() {
    if (!canStart) return;
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;

    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decodedText) => handleDecoded(decodedText),
        () => {},
      )
      .then(() => setRunning(true))
      .catch(() => {
        setToast({ kind: "error", message: "Could not start the camera." });
      });
    startPromiseRef.current = startPromise;
    await startPromise;
  }

  async function stopScanning() {
    try {
      await startPromiseRef.current;
      await scannerRef.current?.stop();
      await scannerRef.current?.clear();
    } catch {}
    setRunning(false);
  }

  function handleHardwareSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hardwareCode.trim() || !canStart) return;
    const code = hardwareCode;
    setHardwareCode("");
    handleDecoded(code);
  }

  async function handleDecoded(code: string) {
    if (processingRef.current) return;
    processingRef.current = true;

    const supabase = createClient();
    const currentDate = dateRef.current;
    const currentMode = modeRef.current;

    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .eq("code", code.trim())
      .maybeSingle();

    if (!student) {
      setToast({ kind: "error", message: `Unknown code: ${code}` });
      setTimeout(() => {
        processingRef.current = false;
      }, 1200);
      return;
    }

    if (currentMode === "attendance") {
      const currentStatus = attendanceStatusRef.current;
      const { error: upsertError } = await supabase
        .from("attendance")
        .upsert(
          {
            class_id: classId,
            student_id: student.id,
            date: currentDate,
            method: "scan",
            status: currentStatus,
          },
          { onConflict: "class_id,student_id,date" },
        );

      if (upsertError) {
        setToast({ kind: "error", message: upsertError.message });
        setTimeout(() => {
          processingRef.current = false;
        }, 1200);
        return;
      }

      playBeep();
      setToast(null);
      setStamp({
        name: student.name,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        note:
          currentStatus === "present"
            ? undefined
            : `Marked ${STATUS_CONFIG[currentStatus].full}`,
      });

      setTimeout(() => {
        processingRef.current = false;
        setStamp(null);
      }, 1500);
    } else {
      // Recitation/activity: wait for the teacher to tap a 1-5 score
      // before logging anything. processingRef stays locked until then.
      playBeep();
      setToast(null);
      setPendingLog({ studentId: student.id, name: student.name });
    }
  }

  async function submitScore(score: number) {
    if (!pendingLog) return;
    const supabase = createClient();
    const currentDate = dateRef.current;
    const currentMode = modeRef.current as ParticipationType;
    const currentLabel =
      currentMode === "activity" ? activityLabelRef.current.trim() : null;

    const { error: insertError } = await supabase
      .from("participation_logs")
      .insert({
        class_id: classId,
        student_id: pendingLog.studentId,
        type: currentMode,
        label: currentLabel,
        score,
        date: currentDate,
      });

    if (insertError) {
      setToast({ kind: "error", message: insertError.message });
      setPendingLog(null);
      processingRef.current = false;
      return;
    }

    let countQuery = supabase
      .from("participation_logs")
      .select("*", { count: "exact", head: true })
      .eq("class_id", classId)
      .eq("student_id", pendingLog.studentId)
      .eq("type", currentMode)
      .eq("date", currentDate);
    if (currentLabel) countQuery = countQuery.eq("label", currentLabel);
    const { count } = await countQuery;

    const name = pendingLog.name;
    setPendingLog(null);
    setStamp({
      name,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      note: `${MODE_LABELS[currentMode]} #${count ?? 1} today — scored ${score}/5`,
    });
    hardwareInputRef.current?.focus();

    setTimeout(() => {
      processingRef.current = false;
      setStamp(null);
    }, 1500);
  }

  return (
    <div>
      <div className="flex flex-col items-center bg-chalk px-6 py-10 text-paper">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-brass">
          Teacher scan
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold">
          {className}
        </h1>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-1 rounded-sm border border-rule/40 p-1">
          {(["attendance", "recitation", "activity"] as ScanMode[]).map(
            (m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={running}
                className={`rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition disabled:opacity-60 ${
                  mode === m
                    ? "bg-brass text-chalk font-semibold"
                    : "text-rule hover:bg-white/5"
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ),
          )}
        </div>

        {mode === "attendance" && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                onClick={() => setAttendanceStatus(status)}
                title={`Scans will be logged as ${STATUS_CONFIG[status].full}`}
                className={`rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition ${
                  attendanceStatus === status
                    ? STATUS_CONFIG[status].active
                    : STATUS_CONFIG[status].inactive
                }`}
              >
                {STATUS_CONFIG[status].full}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={running}
              className="rounded-sm border border-rule bg-paper px-2 py-1 font-mono text-ink"
            />
          </label>
          {mode === "activity" && (
            <label className="flex items-center gap-2 text-sm">
              Activity name
              <input
                type="text"
                value={activityLabel}
                onChange={(e) => setActivityLabel(e.target.value)}
                disabled={running}
                placeholder="e.g. Group presentation"
                className="rounded-sm border border-rule bg-paper px-2 py-1 text-ink"
              />
            </label>
          )}
        </div>

        <form
          onSubmit={handleHardwareSubmit}
          className="mt-4 flex w-full max-w-xs flex-col items-center gap-1"
        >
          <input
            ref={hardwareInputRef}
            type="text"
            value={hardwareCode}
            onChange={(e) => setHardwareCode(e.target.value)}
            disabled={!canStart}
            placeholder="Click here, then scan with a USB/Bluetooth scanner"
            autoComplete="off"
            className="w-full rounded-sm border border-rule bg-paper px-3 py-2 text-center font-mono text-ink outline-none focus:border-brass disabled:opacity-60"
          />
          <p className="font-mono text-[10px] uppercase tracking-wide text-rule/70">
            Hardware scanner input
          </p>
        </form>

        <div className="relative mt-8 h-72 w-72">
          <div id={READER_ID} className="loupe h-72 w-72" />
          {pendingLog && (
            <div className="stamp-in absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-full bg-paper/95 px-6 text-center">
              <p className="font-display text-lg font-bold text-ink">
                {pendingLog.name}
              </p>
              <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
                Score this {mode}
              </p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => submitScore(n)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-brass font-mono text-lg font-bold text-chalk transition hover:brightness-110"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {stamp && (
            <div className="stamp-in pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-full bg-paper/95">
              <p className="rotate-[-6deg] border-4 border-danger px-4 py-2 text-center font-display text-xl font-bold uppercase text-danger">
                {stamp.name}
                <span className="block font-mono text-xs font-normal">
                  {stamp.note ?? stamp.time}
                </span>
              </p>
            </div>
          )}
        </div>

        {toast && (
          <p
            className={`mt-4 rounded-sm px-3 py-2 text-sm ${
              toast.kind === "error"
                ? "bg-danger/20 text-danger"
                : "bg-teal/20 text-teal"
            }`}
          >
            {toast.message}
          </p>
        )}

        <button
          onClick={running ? stopScanning : startScanning}
          disabled={!running && !canStart}
          className="mt-8 rounded-sm bg-brass px-6 py-3 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
        >
          {running ? "Stop camera" : "Start camera"}
        </button>
      </div>
    </div>
  );
}
