import type { SubmissionStatus } from "./types";

// A new file only ever bumps a fresh "missing" submission to "submitted" --
// an already-submitted or already-graded one keeps its status, so
// re-uploading a file doesn't quietly undo a teacher's grading.
export function nextStatusAfterUpload(current: SubmissionStatus): SubmissionStatus {
  return current === "missing" ? "submitted" : current;
}
