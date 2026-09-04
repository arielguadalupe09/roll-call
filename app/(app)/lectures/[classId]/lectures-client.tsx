"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import { buildLectureStoragePath, formatFileSize, formatRecordingSeconds } from "@/lib/video-lecture-path";
import type { VideoLecture } from "@/lib/types";

const RECORDING_CAP_SECONDS = 600;
const BUCKET = "lecture-videos";

type Mode = "upload" | "record" | "link";

export default function LecturesClient({
  classId,
  initialLectures,
}: {
  classId: string;
  initialLectures: VideoLecture[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [lectures, setLectures] = useState(initialLectures);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The <video> element only mounts once `recording` is true, so attaching
  // the stream inline in handleStartRecording (before that state update has
  // rendered) hit a null ref and silently did nothing — no self-view ever
  // showed. Runs after the DOM reflects `liveStream`, so the ref is real.
  useEffect(() => {
    if (liveStream && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = liveStream;
      videoPreviewRef.current.muted = true;
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [liveStream]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function handleStartRecording(kind: "webcam" | "screen") {
    setError(null);
    try {
      const stream =
        kind === "webcam"
          ? await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Deliberately no DOM/ref manipulation here — the recorded preview
        // is a plain React <video src={previewUrl}> below, keyed on the
        // url, so React mounts a fresh element and the browser loads it
        // normally. Reusing the same live-preview <video> element via
        // imperative srcObject/src/load() switching was fragile (playback
        // silently never actually started) and not worth chasing further.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stopStream();
        setLiveStream(null);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setLiveStream(stream);
      setRecording(true);
      setRecordingSeconds(0);
      intervalRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          const next = s + 1;
          if (next >= RECORDING_CAP_SECONDS) handleStopRecording();
          return next;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start recording.");
    }
  }

  function handleStopRecording() {
    mediaRecorderRef.current?.stop();
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRecording(false);
  }

  function handleDiscardRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setRecordingSeconds(0);
    setLiveStream(null);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setExternalUrl("");
    handleDiscardRecording();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (mode === "link" && !externalUrl.trim()) return;
    if (mode === "upload" && !file) return;
    if (mode === "record" && !recordedBlob) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();

    let video_url: string | null = null;
    let storage_path: string | null = null;

    if (mode === "link") {
      video_url = externalUrl.trim();
    } else {
      const blobOrFile = mode === "upload" ? file! : recordedBlob!;
      const fileName = mode === "upload" ? file!.name : "recording.webm";
      const path = buildLectureStoragePath(classId, fileName);
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blobOrFile, {
        upsert: true,
        contentType: mode === "record" ? "video/webm" : undefined,
      });
      if (uploadError) {
        setSaving(false);
        setError(uploadError.message);
        return;
      }
      storage_path = path;
    }

    const { data, error: insertError } = await supabase
      .from("video_lectures")
      .insert({
        class_id: classId,
        title: title.trim(),
        description: description.trim() || null,
        video_url,
        storage_path,
      })
      .select()
      .single();

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setLectures((prev) => [data as VideoLecture, ...prev]);
    resetForm();
    router.refresh();
  }

  async function setPublished(id: string, next: boolean) {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("video_lectures")
      .update({ published: next })
      .eq("id", id);
    if (updateError) {
      showToast(updateError.message);
      return;
    }
    setLectures((prev) => prev.map((l) => (l.id === id ? { ...l, published: next } : l)));
    router.refresh();
  }

  async function handlePreview(storagePath: string) {
    const supabase = createClient();
    const { data, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (signError || !data?.signedUrl) {
      showToast(signError?.message ?? "Couldn't load that video.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(lecture: VideoLecture) {
    const confirmed = await confirm(`Delete "${lecture.title}"? This can't be undone.`, {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;

    const supabase = createClient();
    if (lecture.storage_path) {
      await supabase.storage.from(BUCKET).remove([lecture.storage_path]);
    }
    const { error: deleteError } = await supabase.from("video_lectures").delete().eq("id", lecture.id);
    if (deleteError) {
      showToast(deleteError.message);
      return;
    }
    setLectures((prev) => prev.filter((l) => l.id !== lecture.id));
    router.refresh();
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/watch/${classId}`;
    await navigator.clipboard.writeText(url);
    showToast("Link copied.");
  }

  const modeButtonClass = (m: Mode) =>
    `rounded-sm border px-3 py-1.5 text-sm transition ${
      mode === m ? "border-brass bg-brass text-chalk" : "border-rule text-ink/70 hover:border-brass"
    }`;

  return (
    <div className="mt-6">
      <button
        onClick={handleCopyLink}
        className="mb-4 rounded-sm border border-rule px-3 py-1.5 text-sm text-teal underline underline-offset-2 hover:border-teal"
      >
        Copy shareable student link
      </button>

      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-sm border border-rule bg-white p-4"
      >
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={recording}
            onClick={() => setMode("upload")}
            className={modeButtonClass("upload")}
          >
            Upload
          </button>
          <button
            type="button"
            disabled={recording}
            onClick={() => setMode("record")}
            className={modeButtonClass("record")}
          >
            Record
          </button>
          <button
            type="button"
            disabled={recording}
            onClick={() => setMode("link")}
            className={modeButtonClass("link")}
          >
            Link
          </button>
        </div>

        {mode === "upload" && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-sm border-2 border-dashed px-4 py-8 text-center transition ${
              dragActive ? "border-brass bg-brass/10" : "border-rule hover:border-brass"
            }`}
          >
            <UploadIcon className="h-6 w-6 text-ink/40" />
            {file ? (
              <div>
                <p className="text-sm font-medium text-ink">{file.name}</p>
                <p className="text-xs text-ink/50">{formatFileSize(file.size)}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="mt-1 text-xs text-danger underline underline-offset-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <p className="text-sm text-ink/60">
                Drag a video here, or <span className="text-teal underline underline-offset-2">browse</span>
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>
        )}

        {mode === "link" && (
          <input
            type="url"
            placeholder="https://youtube.com/..."
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
        )}

        {mode === "record" && (
          <div className="flex flex-col gap-2">
            {recording && (
              <video ref={videoPreviewRef} playsInline autoPlay muted className="w-full rounded-sm bg-chalk" />
            )}
            {!recording && previewUrl && (
              <video key={previewUrl} src={previewUrl} controls playsInline className="w-full rounded-sm bg-chalk" />
            )}
            {!recording && !recordedBlob && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleStartRecording("webcam")}
                  className="rounded-sm border border-rule px-3 py-1.5 text-sm text-ink/70 hover:border-brass"
                >
                  Record webcam
                </button>
                <button
                  type="button"
                  onClick={() => handleStartRecording("screen")}
                  className="rounded-sm border border-rule px-3 py-1.5 text-sm text-ink/70 hover:border-brass"
                >
                  Record screen
                </button>
              </div>
            )}
            {recording && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-mono text-sm text-danger">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                  {formatRecordingSeconds(recordingSeconds)} / {formatRecordingSeconds(RECORDING_CAP_SECONDS)}
                </span>
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="rounded-sm bg-danger px-3 py-1.5 text-sm font-medium text-paper"
                >
                  Stop recording
                </button>
              </div>
            )}
            {!recording && recordedBlob && (
              <button
                type="button"
                onClick={handleDiscardRecording}
                className="self-start text-sm text-danger underline underline-offset-2"
              >
                Discard and re-record
              </button>
            )}
            <p className="text-xs text-ink/50">
              Requires a modern browser (HTTPS or localhost). Recording auto-stops at{" "}
              {formatRecordingSeconds(RECORDING_CAP_SECONDS)}.
            </p>
          </div>
        )}

        <p className="text-xs text-ink/50">
          Uploads and recordings work best for short clips. For longer lectures, use a link to YouTube
          or another host instead.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || recording}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Posting..." : "Post lecture"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {lectures.map((lecture) => (
          <li key={lecture.id} className="rounded-sm border border-rule bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-lg font-semibold text-ink">{lecture.title}</p>
                {lecture.description && (
                  <p className="mt-1 whitespace-pre-wrap text-ink/80">{lecture.description}</p>
                )}
                <p className="mt-2 font-mono text-xs text-ink/50">
                  {new Date(lecture.created_at).toLocaleString()}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {lecture.storage_path && (
                    <button
                      onClick={() => handlePreview(lecture.storage_path!)}
                      className="text-teal underline underline-offset-2"
                    >
                      Preview
                    </button>
                  )}
                  {lecture.video_url && (
                    <a
                      href={lecture.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal underline underline-offset-2"
                    >
                      Open link
                    </a>
                  )}
                  <button
                    onClick={() => setPublished(lecture.id, !lecture.published)}
                    className={lecture.published ? "text-ink/60 hover:text-ink" : "text-brass"}
                  >
                    {lecture.published ? "Published" : "Draft"}
                  </button>
                </div>
              </div>
              <button
                onClick={() => handleDelete(lecture)}
                className="shrink-0 text-sm text-danger underline underline-offset-2"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {lectures.length === 0 && <p className="text-ink/60">No lectures posted yet.</p>}
      </ul>
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
