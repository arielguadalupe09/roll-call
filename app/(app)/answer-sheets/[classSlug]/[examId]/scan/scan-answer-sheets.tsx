"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { createClient } from "@/lib/supabase/client";
import { syncItemScoresToGradebook, type CheckedPaper } from "@/lib/item-score-sync";
import type { MajorExam, MajorExamItemResponse, Student } from "@/lib/types";
import {
  BUBBLE_RADIUS,
  MAX_SHEET_ITEMS,
  QR_BOX,
  SHEET_OPTIONS,
  majorExamLabel,
  parseSheetQr,
  sheetOptionCount,
  type Point,
} from "@/lib/omr-sheet";
import {
  downscale,
  findSheetCorners,
  mergeReads,
  project,
  readBubbleCenter,
  readSheet,
  rgbaToGray,
  type ItemMark,
  type SheetRead,
} from "@/lib/omr-scan";
import { BLANK, formatItemList, tallyAnswers, wrongItemsFromAnswers } from "@/lib/item-analysis";
import { playBeep } from "@/lib/beep";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Select } from "@/app/_components/input";
import AnswerKeyBubbles from "@/app/_components/answer-key-bubbles";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";

// Live detection runs on a small copy of each video frame. Once a sheet has
// been held steady for STABLE_FRAMES checks (~1 s, long enough for autofocus
// and the hand to settle) it is captured: a real still photo where
// the browser can take one (ImageCapture, Android Chrome), otherwise
// BURST_FRAMES full-resolution video frames whose readings are averaged --
// a single video frame is softer than a photo and misses light shading.
const DETECT_SIZE = 640;
const DETECT_EVERY_MS = 150;
const STABLE_FRAMES = 6;
// A handheld phone drifts a little between checks; up to this share of the
// frame still counts as steady (the capture itself re-finds the corners).
const STEADY_MOVE = 0.03;
// Checks in a row that may miss the corners (glare, a blink of focus hunting)
// before the steady count starts over.
const MAX_MISSES = 2;
const BURST_FRAMES = 3;
const BURST_GAP_MS = 120;

type ImageCaptureLike = { takePhoto(): Promise<Blob> };
declare global {
  interface Window {
    ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike;
  }
}

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

type Saved = Pick<MajorExamItemResponse, "student_id" | "wrong_items" | "answers">;

type Capture = {
  answers: string;
  marks: ItemMark[];
  // The teacher's shaded answer-key sheet rather than a student's paper.
  isKey: boolean;
  studentId: string;
  // Why the student wasn't (or was oddly) identified from the QR code.
  qrNote: string | null;
  image: string;
};

const CYCLE = [...SHEET_OPTIONS, BLANK];
// <Select> value meaning "this sheet is the answer key".
const KEY_CHOICE = "__answer_key__";

export default function ScanAnswerSheets({
  classSlug,
  className,
  exam,
  students,
  initialResponses,
}: {
  classSlug: string;
  className: string;
  exam: MajorExam;
  students: Student[];
  initialResponses: MajorExamItemResponse[];
}) {
  const { showToast } = useToast();
  const itemCount = exam.item_count ?? 0;
  // The exam's max score, kept in step with the item count once scores sync.
  const maxScoreRef = useRef(exam.max_score);

  // Saved papers become the students' exam scores (lib/item-score-sync.ts).
  // Returns an error message, or null.
  async function syncScores(papers: CheckedPaper[]): Promise<string | null> {
    if (!papers.length || itemCount < 1) return null;
    const result = await syncItemScoresToGradebook(
      createClient(),
      { id: exam.id, max_score: maxScoreRef.current },
      itemCount,
      papers,
    );
    if (!result.error) maxScoreRef.current = result.maxScore;
    return result.error;
  }
  // The basis for checking: the teacher's scanned (or typed) answer key.
  const [key, setKey] = useState<string | null>(
    exam.answer_key && exam.answer_key.length === itemCount ? exam.answer_key : null,
  );
  const examLabel = majorExamLabel(exam.period, exam.kind);
  const backHref = `/gradebook/${classSlug}?tab=major-exam`;

  // On-screen answer key entry (tap the ovals instead of scanning a key sheet).
  const [keyEditorOpen, setKeyEditorOpen] = useState(false);
  const [keyLetters, setKeyLetters] = useState<string[]>(() =>
    Array.from({ length: itemCount }, (_, i) => exam.answer_key?.[i] ?? ""),
  );
  const [keyOptions, setKeyOptions] = useState<4 | 5>(sheetOptionCount(exam.answer_key));
  const [saved, setSaved] = useState(() => new Map<string, Saved>(initialResponses.map((r) => [r.student_id, r])));
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [status, setStatus] = useState("Point the camera at a sheet");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const lastCornersRef = useRef<Point[] | null>(null);
  const stableRef = useRef(0);
  const missesRef = useRef(0);
  // The teacher is scanning with the live camera (not just photos). The
  // stream is released while a capture is reviewed and reopened for the next
  // sheet: a stream kept alive behind the hidden preview (iOS pauses it) or
  // after a still photo (Android can leave the preview frozen or out of
  // focus) barely detected the next sheet, while a fresh one always works.
  const liveRef = useRef(false);
  // One reused canvas for detection: iOS Safari runs out of canvas memory
  // (and detection stalls) when a new one is made for every check.
  const workRef = useRef<HTMLCanvasElement | null>(null);
  // Width / height of the camera picture, so the preview box keeps its shape
  // and fits on a phone screen.
  const [videoAspect, setVideoAspect] = useState(3 / 4);
  const fileRef = useRef<HTMLInputElement>(null);

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const studentByCode = useMemo(() => new Map(students.map((s) => [s.code.toUpperCase(), s])), [students]);

  // Stop the camera when leaving the page.
  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  // Asks for the sharpest stream first, then settles for less: some phones
  // refuse (or hang on) a 4K request but open fine at 1080p or default size.
  async function openStream(): Promise<MediaStream> {
    const attempts: MediaTrackConstraints[] = [
      { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      { facingMode: { ideal: "environment" } },
    ];
    let lastError: unknown = null;
    for (const video of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video, audio: false });
      } catch (e) {
        lastError = e;
        // A refused permission won't change with smaller sizes.
        if (e instanceof Error && (e.name === "NotAllowedError" || e.name === "SecurityError")) throw e;
      }
    }
    throw lastError;
  }

  // Attaches the stream and waits until real frames arrive (true) or 4 s pass (false).
  async function attachStream(v: HTMLVideoElement, stream: MediaStream): Promise<boolean> {
    v.srcObject = stream;
    const ready = new Promise<boolean>((resolve) => {
      const done = () => resolve(v.videoWidth > 0);
      if (v.readyState >= 2 && v.videoWidth) return resolve(true);
      v.addEventListener("loadeddata", done, { once: true });
      window.setTimeout(() => resolve(v.readyState >= 2 && v.videoWidth > 0), 4000);
    });
    await v.play().catch(() => {});
    const ok = await ready;
    const fit = () => v.videoWidth && v.videoHeight && setVideoAspect(v.videoWidth / v.videoHeight);
    fit();
    // Turning the phone swaps the picture's width and height.
    v.onresize = fit;
    return ok;
  }

  async function startCamera() {
    if (cameraStarting || streamRef.current) return;
    setCameraError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("The live camera needs a secure (https) connection. Use “Take a photo” instead.");
      return;
    }
    setCameraStarting(true);
    try {
      // Two tries: the first open after a permission prompt sometimes gives a
      // stream that never delivers frames (black preview) until reopened.
      for (let attempt = 0; attempt < 2; attempt++) {
        const stream = await openStream();
        streamRef.current = stream;
        setCameraOn(true);
        // Let the preview box un-hide first: iOS won't start a hidden video.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const v = videoRef.current;
        if (v && (await attachStream(v, stream))) {
          // Keep refocusing as the phone moves between papers (ignored where unsupported).
          stream
            .getVideoTracks()[0]
            ?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
            .catch(() => {});
          liveRef.current = true;
          pausedRef.current = false;
          lastCornersRef.current = null;
          stableRef.current = 0;
          missesRef.current = 0;
          setStatus("Point the camera at a sheet");
          scheduleDetect();
          return;
        }
        stopCamera();
        await wait(300);
      }
      liveRef.current = false;
      setCameraOn(false);
      setCameraError("The camera didn't start. Tap “Start camera” again, or use “Take a photo”.");
    } catch (e) {
      liveRef.current = false;
      stopCamera();
      setCameraOn(false);
      setCameraError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in your browser settings, or use “Take a photo”."
          : "Couldn't open the camera. Use “Take a photo” instead.",
      );
    } finally {
      setCameraStarting(false);
    }
  }

  function scheduleDetect() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(detectFrame, DETECT_EVERY_MS);
  }

  function detectFrame() {
    const v = videoRef.current;
    const overlay = overlayRef.current;
    if (!v || !overlay || pausedRef.current || !streamRef.current) return;
    // iOS can pause the preview (e.g. after the tab was in the background).
    if (v.paused) v.play().catch(() => {});
    if (v.readyState < 2 || !v.videoWidth) return scheduleDetect();

    const s = DETECT_SIZE / Math.max(v.videoWidth, v.videoHeight);
    const w = Math.round(v.videoWidth * s);
    const h = Math.round(v.videoHeight * s);
    const work = (workRef.current ??= document.createElement("canvas"));
    if (work.width !== w || work.height !== h) {
      work.width = w;
      work.height = h;
    }
    const ctx = work.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, w, h);
    const corners = findSheetCorners(rgbaToGray(ctx.getImageData(0, 0, w, h).data, w, h));

    overlay.width = w;
    overlay.height = h;
    const o = overlay.getContext("2d")!;
    o.clearRect(0, 0, w, h);
    if (!corners) {
      // One or two missed checks keep the progress; more start over.
      if (lastCornersRef.current && ++missesRef.current <= MAX_MISSES) return scheduleDetect();
      stableRef.current = 0;
      missesRef.current = 0;
      lastCornersRef.current = null;
      setStatus("Fit all 4 black corner squares inside the frame");
      return scheduleDetect();
    }
    missesRef.current = 0;
    o.strokeStyle = "#22c55e";
    o.lineWidth = 3;
    o.beginPath();
    corners.forEach((c, i) => (i ? o.lineTo(c.x, c.y) : o.moveTo(c.x, c.y)));
    o.closePath();
    o.stroke();

    const prev = lastCornersRef.current;
    const moved = prev ? Math.max(...corners.map((c, i) => Math.hypot(c.x - prev[i].x, c.y - prev[i].y))) : Infinity;
    stableRef.current = moved < Math.max(w, h) * STEADY_MOVE ? stableRef.current + 1 : 0;
    lastCornersRef.current = corners;
    // Progress bar along the top while the sheet is held steady.
    const progress = Math.min(1, stableRef.current / STABLE_FRAMES);
    o.fillStyle = "rgba(0,0,0,0.45)";
    o.fillRect(0, 0, w, 8);
    o.fillStyle = "#22c55e";
    o.fillRect(0, 0, w * progress, 8);
    if (stableRef.current < STABLE_FRAMES) {
      setStatus(stableRef.current ? "Sheet found — hold still…" : "Sheet found — hold steady…");
      return scheduleDetect();
    }

    pausedRef.current = true;
    stableRef.current = 0;
    setStatus("Reading — keep still…");
    // Reuse this frame's confirmed corners if the full-size pass misses them.
    const hint = corners.map((c) => ({ x: c.x / s, y: c.y / s }));
    void captureSteady(v, hint).then((ok) => {
      if (ok || !streamRef.current) return;
      lastCornersRef.current = null;
      pausedRef.current = false;
      scheduleDetect();
    });
  }

  function grabFrame(v: HTMLVideoElement): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    return c;
  }

  // A still photo from the camera (full sensor resolution, like “Take a
  // photo”), where the browser supports it; null otherwise or if it's slow.
  async function takeStill(): Promise<HTMLCanvasElement | null> {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !window.ImageCapture) return null;
    try {
      const blob = await Promise.race([
        new window.ImageCapture(track).takePhoto(),
        wait(2500).then(() => null),
      ]);
      if (!blob) return null;
      const bitmap = await createImageBitmap(blob);
      const k = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bitmap.width * k);
      c.height = Math.round(bitmap.height * k);
      c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
      return c;
    } catch {
      return null;
    }
  }

  async function captureSteady(v: HTMLVideoElement, hint: Point[]): Promise<boolean> {
    const still = await takeStill();
    if (still && processCanvas(still)) return true;
    // Several video frames, read separately and averaged.
    const frames = [grabFrame(v)];
    for (let i = 1; i < BURST_FRAMES; i++) {
      await wait(BURST_GAP_MS);
      if (!streamRef.current) return false;
      frames.push(grabFrame(v));
    }
    const extra = frames
      .slice(1)
      .map((f) => readCanvas(f, hint))
      .filter((r): r is SheetRead => r !== null);
    // iOS Safari holds canvas memory until the size is zeroed.
    frames.slice(1).forEach((f) => (f.width = f.height = 0));
    return processCanvas(frames[0], hint, extra);
  }

  // Corners + reading of one image, or null.
  function readCanvas(canvas: HTMLCanvasElement, hint?: Point[]): SheetRead | null {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const gray = rgbaToGray(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    const { gray: small, scale } = downscale(gray, 800);
    const found = findSheetCorners(small);
    const corners = found ? found.map((c) => ({ x: c.x / scale, y: c.y / scale })) : hint;
    return corners ? readSheet(gray, corners, itemCount) : null;
  }

  // Reads one sheet image; returns false (with a status message) when it can't.
  // extraReads: the same sheet read from other video frames, averaged in.
  function processCanvas(canvas: HTMLCanvasElement, hint?: Point[], extraReads: SheetRead[] = []): boolean {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, W, H);
    const gray = rgbaToGray(img.data, W, H);
    const { gray: small, scale } = downscale(gray, 800);
    const detected = findSheetCorners(small);
    const found = detected ?? hint?.map((c) => ({ x: c.x * scale, y: c.y * scale })) ?? null;
    if (!found) {
      setStatus("Couldn't find the 4 corner squares — try again with the whole sheet in view.");
      return false;
    }
    const single = readSheet(
      gray,
      found.map((c) => ({ x: c.x / scale, y: c.y / scale })),
      itemCount,
    );
    const read = single && mergeReads([single, ...extraReads]);
    if (!read) {
      setStatus("Couldn't tell which way up the sheet is — keep the top bar and all corners in view.");
      return false;
    }

    // QR: try the printed QR area first (faster, sharper), then the whole frame.
    const qrCorners = [
      { x: QR_BOX.x, y: QR_BOX.y },
      { x: QR_BOX.x + QR_BOX.size, y: QR_BOX.y },
      { x: QR_BOX.x + QR_BOX.size, y: QR_BOX.y + QR_BOX.size },
      { x: QR_BOX.x, y: QR_BOX.y + QR_BOX.size },
    ].map((p) => project(read.homography, p));
    const pad = Math.hypot(qrCorners[1].x - qrCorners[0].x, qrCorners[1].y - qrCorners[0].y) * 0.25;
    const x0 = Math.max(0, Math.floor(Math.min(...qrCorners.map((p) => p.x)) - pad));
    const y0 = Math.max(0, Math.floor(Math.min(...qrCorners.map((p) => p.y)) - pad));
    const x1 = Math.min(W, Math.ceil(Math.max(...qrCorners.map((p) => p.x)) + pad));
    const y1 = Math.min(H, Math.ceil(Math.max(...qrCorners.map((p) => p.y)) + pad));
    let qr =
      x1 > x0 && y1 > y0
        ? jsQR(ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data, x1 - x0, y1 - y0, { inversionAttempts: "dontInvert" })
        : null;
    if (!qr) qr = jsQR(img.data, W, H, { inversionAttempts: "dontInvert" });

    let studentId = "";
    let isKey = false;
    let qrNote: string | null = "No QR code read — choose the student.";
    const parsed = qr ? parseSheetQr(qr.data) : null;
    if (qr && !parsed) qrNote = "That QR code isn't from a GAINS answer sheet — choose the student.";
    if (parsed?.kind === "key") {
      isKey = true;
      qrNote =
        parsed.majorExamId !== exam.id
          ? "This answer key was printed for a different exam! Check before saving."
          : null;
    } else if (parsed) {
      const student = studentByCode.get(parsed.studentCode.toUpperCase());
      if (parsed.majorExamId !== exam.id) qrNote = "This sheet was printed for a different exam! Check before saving.";
      else if (!student) qrNote = `Code ${parsed.studentCode} isn't in this class — choose the student.`;
      else qrNote = null;
      if (student) studentId = student.id;
    }
    if (!isKey && !key) {
      qrNote =
        "There's no answer key yet — scan your shaded answer-key sheet first. If this IS the key, choose “Answer key” below.";
    }

    // Draw the reading onto the photo so the teacher can check it at a glance.
    const radiusPx = (p: Point) => {
      const a = project(read.homography, p);
      const b = project(read.homography, { x: p.x + BUBBLE_RADIUS, y: p.y });
      return { a, r: Math.hypot(b.x - a.x, b.y - a.y) };
    };
    ctx.lineWidth = Math.max(2, W / 400);
    for (const m of read.marks) {
      // No key to compare with (or this is the key): just show what was read.
      if (isKey || !key) {
        const chosen = SHEET_OPTIONS.indexOf(m.answer as (typeof SHEET_OPTIONS)[number]);
        if (chosen >= 0) {
          const { a, r } = radiusPx(readBubbleCenter(read, m.item, chosen));
          ctx.strokeStyle = "#2563eb";
          ctx.beginPath();
          ctx.arc(a.x, a.y, r * 1.35, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (m.status !== "ok") {
          const first = radiusPx(readBubbleCenter(read, m.item, 0));
          const last = radiusPx(readBubbleCenter(read, m.item, SHEET_OPTIONS.length - 1));
          ctx.strokeStyle = "#f59e0b";
          ctx.strokeRect(
            first.a.x - first.r * 1.6,
            first.a.y - first.r * 1.6,
            last.a.x - first.a.x + first.r * 3.2,
            first.r * 3.2,
          );
        }
        continue;
      }
      const keyIdx = SHEET_OPTIONS.indexOf(key[m.item - 1] as (typeof SHEET_OPTIONS)[number]);
      const chosenIdx = SHEET_OPTIONS.indexOf(m.answer as (typeof SHEET_OPTIONS)[number]);
      const ring = (idx: number, color: string) => {
        const { a, r } = radiusPx(readBubbleCenter(read, m.item, idx));
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      };
      if (chosenIdx === keyIdx) ring(keyIdx, "#16a34a");
      else {
        if (chosenIdx >= 0) ring(chosenIdx, "#dc2626");
        ring(keyIdx, m.status === "ok" ? "#16a34a" : "#f59e0b");
      }
    }
    const s = Math.min(1, 1100 / Math.max(W, H));
    const out = document.createElement("canvas");
    out.width = Math.round(W * s);
    out.height = Math.round(H * s);
    out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);

    playBeep();
    // Release the camera while this paper is reviewed; resume() reopens it.
    stopCamera();
    setCapture({
      answers: read.answers,
      marks: read.marks,
      isKey,
      studentId,
      qrNote,
      image: out.toDataURL("image/jpeg", 0.75),
    });
    setStatus(isKey ? "Answer key read — check it, then save." : "Check the reading, then save.");
    return true;
  }

  async function onPhoto(file: File) {
    setProcessing(true);
    try {
      const bitmap = await createImageBitmap(file);
      const s = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * s);
      canvas.height = Math.round(bitmap.height * s);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      pausedRef.current = true;
      if (!processCanvas(canvas)) {
        pausedRef.current = false;
        showToast("Couldn't read that photo — get all 4 corner squares in, flat and well lit.");
        if (streamRef.current) scheduleDetect();
      }
    } catch {
      showToast("Couldn't open that photo.");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function resume() {
    setCapture(null);
    lastCornersRef.current = null;
    stableRef.current = 0;
    missesRef.current = 0;
    pausedRef.current = false;
    if (streamRef.current) {
      setStatus("Point the camera at a sheet");
      scheduleDetect();
    } else if (liveRef.current) {
      setStatus("Starting camera…");
      void startCamera();
    } else setStatus("Point the camera at a sheet");
  }

  function cycleAnswer(item: number) {
    setCapture((c) => {
      if (!c) return c;
      const current = c.answers[item - 1];
      const next = CYCLE[(CYCLE.indexOf(current as (typeof CYCLE)[number]) + 1) % CYCLE.length];
      return {
        ...c,
        answers: c.answers.slice(0, item - 1) + next + c.answers.slice(item),
      };
    });
  }

  async function save() {
    if (!capture || !key || !capture.studentId) return;
    setSaving(true);
    const wrong = wrongItemsFromAnswers(capture.answers, key);
    const { error } = await createClient().from("major_exam_item_responses").upsert(
      {
        major_exam_id: exam.id,
        student_id: capture.studentId,
        wrong_items: wrong,
        answers: capture.answers,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "major_exam_id,student_id" },
    );
    const syncError = error ? null : await syncScores([{ student_id: capture.studentId, wrong_items: wrong }]);
    setSaving(false);
    if (error) {
      showToast(error.message);
      return;
    }
    if (syncError) showToast(`Paper saved, but the gradebook score wasn't: ${syncError}`);
    setSaved((prev) =>
      new Map(prev).set(capture.studentId, {
        student_id: capture.studentId,
        wrong_items: wrong,
        answers: capture.answers,
      }),
    );
    const name = studentById.get(capture.studentId)?.name ?? "Student";
    if (!syncError) showToast(`Saved ${name} — ${itemCount - wrong.length} / ${itemCount}, recorded in Scores`);
    resume();
  }

  // Saves the scanned answer key and re-scores any papers already scanned, so
  // every stored result is checked against the same key.
  async function saveKey(newKey: string) {
    if (newKey.length !== itemCount || newKey.includes(BLANK) || !/^[A-E]+$/.test(newKey)) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("major_exams").update({ answer_key: newKey }).eq("id", exam.id);
    if (error) {
      setSaving(false);
      showToast(error.message);
      return;
    }
    const rescored = [...saved.values()]
      .filter((r) => r.answers && r.answers.length === itemCount)
      .map((r) => ({ ...r, wrong_items: wrongItemsFromAnswers(r.answers!, newKey) }));
    let rescoreFailed = false;
    if (rescored.length) {
      const { error: rescoreError } = await supabase.from("major_exam_item_responses").upsert(
        rescored.map((r) => ({
          major_exam_id: exam.id,
          student_id: r.student_id,
          wrong_items: r.wrong_items,
          answers: r.answers,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "major_exam_id,student_id" },
      );
      rescoreFailed = !!rescoreError || !!(await syncScores(rescored));
    }
    setSaving(false);
    setKey(newKey);
    setKeyLetters(Array.from(newKey));
    setKeyEditorOpen(false);
    if (!rescoreFailed && rescored.length) {
      setSaved((prev) => {
        const next = new Map(prev);
        for (const r of rescored) next.set(r.student_id, r);
        return next;
      });
    }
    showToast(
      rescoreFailed
        ? "Answer key saved, but re-scoring the scanned papers failed — save the key again."
        : `Answer key saved${rescored.length ? ` — ${rescored.length} scanned paper${rescored.length === 1 ? "" : "s"} re-scored` : ""}. Now scan the students' sheets.`,
    );
    resume();
  }

  // ---- Tallies for the papers saved so far ----
  const rows = students
    .filter((s) => saved.has(s.id))
    .map((s) => {
      const r = saved.get(s.id)!;
      const t =
        r.answers && key && r.answers.length === key.length
          ? tallyAnswers(r.answers, key)
          : {
              correct: itemCount - r.wrong_items.length,
              incorrect: r.wrong_items.length,
              blank: null as number | null,
            };
      return { student: s, ...t };
    });
  const scores = rows.map((r) => r.correct);
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const totalCorrect = scores.reduce((a, b) => a + b, 0);
  const totalAnswered = rows.length * itemCount;

  if (!itemCount || itemCount > MAX_SHEET_ITEMS) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Scan answer sheets</h1>
        <p className="mt-2 text-sm text-ink/70">
          {!itemCount
            ? "Set the number of items first, in Gradebook → Major Exam → Item analysis."
            : `Bubble sheets fit up to ${MAX_SHEET_ITEMS} items; this exam has ${itemCount}.`}
        </p>
        <Link href={backHref} className="mt-4 inline-block text-sm font-medium text-navy underline">
          Back to Major Exam
        </Link>
      </div>
    );
  }

  const tally = capture && key && !capture.isKey ? tallyAnswers(capture.answers, key) : null;
  const flagged = capture?.marks.filter((m) => m.status !== "ok").map((m) => m.item) ?? [];
  const keyBlanks = capture?.isKey ? Array.from(capture.answers).flatMap((a, i) => (a === BLANK ? [i + 1] : [])) : [];
  const alreadySaved = capture?.studentId ? saved.has(capture.studentId) : false;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div>
        <Link href={backHref} className="text-sm text-muted hover:text-ink">
          ← Major Exam
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Scan — {examLabel}</h1>
        <p className="text-sm text-ink/60">
          {className} · {itemCount} items · {rows.length} / {students.length} papers scanned
        </p>
      </div>

      {!key && !capture && (
        <div className="rounded-[10px] border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-ink">
          <p className="font-semibold">Step 1 — set your answer key</p>
          <p className="mt-1 text-ink/80">
            Either tap the correct ovals on screen, or shade the printed <strong>Answer key (teacher)</strong> sheet
            (Print sheets → Sheets for → Answer key) and scan it first. Every student&apos;s sheet is then checked
            against it.
          </p>
        </div>
      )}
      {key && !capture && !keyEditorOpen && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted">
            Checking against the saved answer key. Scan a new answer-key sheet or edit it on screen any time (scanned
            papers are re-scored).
          </p>
          <Button variant="primary" size="sm" onClick={() => setKeyEditorOpen(true)}>
            Edit key on screen
          </Button>
        </div>
      )}
      {!key && !capture && !keyEditorOpen && (
        <div>
          <Button variant="primary" onClick={() => setKeyEditorOpen(true)}>
            Or shade the answer key on screen
          </Button>
        </div>
      )}
      {keyEditorOpen && !capture && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="font-display text-lg font-semibold text-ink">Answer key</h2>
            <span className="text-xs text-muted">
              {keyLetters.filter(Boolean).length} / {itemCount} items answered
            </span>
            <label className="flex items-center gap-1.5 text-xs text-ink">
              <input
                type="checkbox"
                checked={keyOptions === 5 || keyLetters.includes("E")}
                disabled={keyLetters.includes("E")}
                onChange={(e) => setKeyOptions(e.target.checked ? 5 : 4)}
              />
              Choices A–E
            </label>
          </div>
          <p className="text-xs text-muted">
            Tap the correct oval for each item (tap again to clear). Every student&apos;s sheet is checked against this.
          </p>
          <AnswerKeyBubbles
            value={keyLetters}
            onChange={setKeyLetters}
            optionCount={keyOptions === 5 || keyLetters.includes("E") ? 5 : 4}
            disabled={saving}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => saveKey(keyLetters.join(""))} disabled={saving || keyLetters.some((l) => !l)}>
              {saving ? "Saving..." : key ? "Replace answer key" : "Save answer key"}
            </Button>
            <Button variant="secondary" onClick={() => setKeyEditorOpen(false)}>
              Cancel
            </Button>
            {keyLetters.some((l) => !l) && (
              <span className="text-xs text-danger">
                {keyLetters.filter((l) => !l).length} item{keyLetters.filter((l) => !l).length === 1 ? "" : "s"} still
                need an answer (numbers in red).
              </span>
            )}
            {key && rows.length > 0 && (
              <span className="text-xs text-muted">Saving re-scores the {rows.length} scanned papers.</span>
            )}
          </div>
        </div>
      )}

      {/* Stays mounted while reviewing so the camera stream survives. */}
      <div className={capture ? "hidden" : "flex flex-col gap-3"}>
        {/* Always mounted, so the stream has a <video> to attach to the moment it opens. */}
        {/* Keeps the camera's own shape but never taller than ~60% of the
            screen, so on a phone the whole preview, its status line and the
            buttons below all fit without scrolling. */}
        <div
          className={cameraOn ? "relative mx-auto w-full overflow-hidden rounded-[10px] bg-black" : "hidden"}
          style={{ aspectRatio: videoAspect, maxWidth: `calc(60dvh * ${videoAspect})` }}
        >
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          <p className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-center text-sm text-white">
            {processing ? "Reading…" : status}
          </p>
        </div>
        {!cameraOn && (
          <div className="rounded-[10px] border border-dashed border-line bg-card px-4 py-8 text-center">
            <p className="text-sm text-ink/70">
              Lay the sheet flat in good light and hold your phone straight above it. The sheet is captured
              automatically once all 4 corner squares are in view.
            </p>
            <Button className="mt-3" onClick={startCamera} disabled={cameraStarting}>
              {cameraStarting ? "Starting camera…" : "Start camera"}
            </Button>
          </div>
        )}
        {cameraError && <p className="text-sm text-danger">{cameraError}</p>}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={processing}>
            {processing ? "Reading…" : "Take a photo"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])}
          />
          {cameraOn && (
            <Button
              variant="secondary"
              onClick={() => {
                liveRef.current = false;
                stopCamera();
                setCameraOn(false);
              }}
            >
              Stop camera
            </Button>
          )}
          <Button variant="primary" href={`/answer-sheets/${classSlug}/${exam.id}`}>
            Print sheets
          </Button>
        </div>
      </div>

      {capture && (
        <div className="flex flex-col gap-4 rounded-[10px] border border-line bg-card p-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            Sheet
            <Select
              value={capture.isKey ? KEY_CHOICE : capture.studentId}
              onChange={(e) =>
                setCapture({
                  ...capture,
                  isKey: e.target.value === KEY_CHOICE,
                  studentId: e.target.value === KEY_CHOICE ? "" : e.target.value,
                })
              }
              className="!py-1.5"
            >
              <option value="">Choose student…</option>
              <option value={KEY_CHOICE}>★ Answer key (teacher&apos;s sheet)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code}){saved.has(s.id) ? " — scanned" : ""}
                </option>
              ))}
            </Select>
          </label>
          {capture.qrNote && <p className="text-sm text-danger">{capture.qrNote}</p>}
          {capture.isKey && key && (
            <p className="text-sm text-ink/70">
              Saving replaces the current answer key and re-scores the {rows.length} scanned paper
              {rows.length === 1 ? "" : "s"}.
            </p>
          )}
          {alreadySaved && !capture.isKey && (
            <p className="text-sm text-ink/70">This student already has a scanned paper — saving replaces it.</p>
          )}

          {tally && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <Tile label="Correct" value={tally.correct} tone="text-success" />
              <Tile label="Incorrect" value={tally.incorrect} tone="text-danger" />
              <Tile label="Blank" value={tally.blank} tone="text-ink" />
              <Tile label="Score" value={`${tally.correct}/${itemCount}`} tone="text-ink" />
            </div>
          )}
          {capture.isKey && keyBlanks.length > 0 && (
            <p className="text-sm text-danger">
              Items {formatItemList(keyBlanks)} have no single shaded answer — tap each one to set it before saving the
              key.
            </p>
          )}
          {!capture.isKey && flagged.length > 0 && (
            <p className="text-sm text-warning">
              Check items {formatItemList(flagged)} — blank or more than one circle shaded (counted wrong).
            </p>
          )}

          <div>
            <p className="text-xs text-muted">
              Tap an item to change its answer (A → B → … → E → blank).
              {tally ? " Green = correct, red = wrong." : ""}
            </p>
            <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {Array.from({ length: itemCount }, (_, i) => {
                const a = capture.answers[i];
                const graded = !!tally && !!key;
                const right = graded && a === key![i];
                const flaggedItem = capture.isKey ? a === BLANK : capture.marks[i]?.status !== "ok";
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => cycleAnswer(i + 1)}
                    title={`Item ${i + 1}: ${a === BLANK ? "blank" : a}${graded ? `, key ${key![i]}` : ""}`}
                    className={`rounded-sm border px-1 py-1 font-mono text-xs ${
                      !graded
                        ? "border-line bg-paper text-ink"
                        : right
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-danger/40 bg-danger/10 text-danger"
                    } ${flaggedItem ? "ring-2 ring-warning" : ""}`}
                  >
                    <span className="text-muted">{i + 1}</span> {a === BLANK ? "–" : a}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {capture.isKey ? (
              <Button onClick={() => saveKey(capture.answers)} disabled={saving || keyBlanks.length > 0}>
                {saving ? "Saving..." : key ? "Replace answer key" : "Save as answer key"}
              </Button>
            ) : (
              <Button onClick={save} disabled={saving || !capture.studentId || !key}>
                {saving ? "Saving..." : "Save & scan next"}
              </Button>
            )}
            <Button variant="secondary" onClick={resume}>
              Retake
            </Button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL of the captured photo */}
          <img
            src={capture.image}
            alt="Scanned sheet with the reading marked"
            className="w-full rounded-sm border border-line"
          />
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Tally</h2>
          <Button variant="primary" size="sm" href={backHref}>
            Open item analysis
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No papers scanned yet.</p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Papers" value={`${rows.length}/${students.length}`} tone="text-ink" />
              <Tile label="Mean score" value={`${Math.round(mean * 10) / 10}/${itemCount}`} tone="text-ink" />
              <Tile label="Total correct" value={totalCorrect} tone="text-success" />
              <Tile label="Total incorrect" value={totalAnswered - totalCorrect} tone="text-danger" />
            </div>
            <Table className="mt-3">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Student</TableHeaderCell>
                  <TableHeaderCell align="right">Correct</TableHeaderCell>
                  <TableHeaderCell align="right">Incorrect</TableHeaderCell>
                  <TableHeaderCell align="right">Blank</TableHeaderCell>
                  <TableHeaderCell align="right">%</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.student.id} striped>
                    <TableCell>{r.student.name}</TableCell>
                    <TableCell align="right" tabular className="text-success">
                      {r.correct}
                    </TableCell>
                    <TableCell align="right" tabular className="text-danger">
                      {r.incorrect}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {r.blank ?? "--"}
                    </TableCell>
                    <TableCell align="right" tabular>
                      {Math.round((r.correct / itemCount) * 100)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-card px-2 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-mono text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
