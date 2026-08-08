import { describe, expect, it } from "vitest";
import { summarizeParticipation } from "./participation";
import type { ParticipationLog } from "./types";

function log(overrides: Partial<ParticipationLog>): ParticipationLog {
  return {
    id: "log-1",
    class_id: "class-1",
    student_id: "student-1",
    type: "recitation",
    label: null,
    score: 5,
    date: "2026-08-01",
    recorded_at: "2026-08-01T08:00:00Z",
    ...overrides,
  };
}

describe("summarizeParticipation", () => {
  it("returns an empty map for no logs", () => {
    expect(summarizeParticipation([]).size).toBe(0);
  });

  it("counts and averages scored logs per student", () => {
    const logs = [
      log({ id: "1", student_id: "a", score: 5 }),
      log({ id: "2", student_id: "a", score: 3 }),
      log({ id: "3", student_id: "b", score: 4 }),
    ];
    const result = summarizeParticipation(logs);

    expect(result.get("a")).toEqual({ count: 2, sum: 8, avg: 4 });
    expect(result.get("b")).toEqual({ count: 1, sum: 4, avg: 4 });
  });

  it("counts a null-score tap but excludes it from the sum", () => {
    const logs = [
      log({ id: "1", student_id: "a", score: null }),
      log({ id: "2", student_id: "a", score: 5 }),
    ];
    const result = summarizeParticipation(logs);

    expect(result.get("a")).toEqual({ count: 2, sum: 5, avg: 2.5 });
  });
});
