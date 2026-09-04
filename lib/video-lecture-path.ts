// Builds the storage.objects path for an uploaded/recorded lecture video.
// The `lecture-videos` bucket's RLS policy parses this with
// storage.foldername(name)[1]::uuid, so the class id must be the first path
// segment exactly as written here (see supabase/migrations/0018_video_lectures.sql).
export function buildLectureStoragePath(classId: string, fileName: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : undefined;
  return `${classId}/${crypto.randomUUID()}.${ext || "webm"}`;
}

/** mm:ss display for the in-browser recording timer. */
export function formatRecordingSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
