import { describe, expect, it } from "vitest";
import { buildLectureStoragePath, formatRecordingSeconds } from "./video-lecture-path";

describe("buildLectureStoragePath", () => {
  it("preserves the file's extension", () => {
    const path = buildLectureStoragePath("class-1", "lecture.mp4");
    expect(path).toMatch(/\.mp4$/);
  });

  it("falls back to .webm for an extensionless name (recorded blobs)", () => {
    const path = buildLectureStoragePath("class-1", "recording");
    expect(path).toMatch(/\.webm$/);
  });

  it("puts the class id first, matching the bucket's RLS foldername check", () => {
    const path = buildLectureStoragePath("class-1", "lecture.mp4");
    expect(path.split("/")[0]).toBe("class-1");
  });

  it("generates a unique segment so repeated uploads don't collide", () => {
    const a = buildLectureStoragePath("class-1", "lecture.mp4");
    const b = buildLectureStoragePath("class-1", "lecture.mp4");
    expect(a).not.toBe(b);
  });
});

describe("formatRecordingSeconds", () => {
  it("formats zero seconds", () => {
    expect(formatRecordingSeconds(0)).toBe("0:00");
  });

  it("pads single-digit seconds", () => {
    expect(formatRecordingSeconds(65)).toBe("1:05");
  });

  it("formats the 10-minute recording cap", () => {
    expect(formatRecordingSeconds(600)).toBe("10:00");
  });
});
