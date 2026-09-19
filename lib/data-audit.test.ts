import { describe, expect, it } from "vitest";
import { auditData } from "./data-audit";

const now = new Date("2026-09-20T00:00:00Z");
const classes = [
  { id: "c1", name: "IT 3B", archived: false },
  { id: "c2", name: "Old class", archived: true },
  { id: "c3", name: "Empty", archived: false },
];

describe("auditData", () => {
  it("returns nothing for clean data", () => {
    const findings = auditData(
      {
        classes: [classes[0]],
        students: [
          { id: "s1", class_id: "c1", name: "Cruz, Juan", code: "AAA" },
          { id: "s2", class_id: "c1", name: "Reyes, Ana", code: "BBB" },
        ],
        sessions: [
          { id: "x", class_id: "c1", date: "2026-09-19", opened_at: "2026-09-19T23:00:00Z", closed_at: null },
        ],
        attempts: [],
      },
      now,
    );
    expect(findings).toEqual([]);
  });

  it("flags duplicates within a class but not across classes", () => {
    const findings = auditData(
      {
        classes: classes.slice(0, 2),
        students: [
          { id: "s1", class_id: "c1", name: "Fernando, James", code: "A" },
          { id: "s2", class_id: "c1", name: "fernando james", code: "B" },
          { id: "s3", class_id: "c2", name: "Fernando, James", code: "C" },
        ],
        sessions: [],
        attempts: [],
      },
      now,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe("duplicate_student");
    expect(findings[0].ids).toEqual(["s1", "s2"]);
  });

  it("flags stale open sessions and unsubmitted attempts older than a day", () => {
    const findings = auditData(
      {
        classes: [classes[0]],
        students: [{ id: "s1", class_id: "c1", name: "A, B", code: "A" }],
        sessions: [
          { id: "old", class_id: "c1", date: "2026-09-10", opened_at: "2026-09-10T00:00:00Z", closed_at: null },
          { id: "closed", class_id: "c1", date: "2026-09-10", opened_at: "2026-09-10T00:00:00Z", closed_at: "2026-09-10T02:00:00Z" },
        ],
        attempts: [
          { id: "a1", exam_id: "e", student_id: "s1", started_at: "2026-09-15T00:00:00Z", submitted_at: null },
          { id: "a2", exam_id: "e", student_id: "s1", started_at: "2026-09-19T23:00:00Z", submitted_at: null },
        ],
      },
      now,
    );
    expect(findings.map((f) => [f.check, f.ids[0]])).toEqual([
      ["stale_open_session", "old"],
      ["stale_exam_attempt", "a1"],
    ]);
  });

  it("flags empty classes but skips archived ones", () => {
    const findings = auditData(
      { classes, students: [], sessions: [], attempts: [] },
      now,
    );
    expect(findings.map((f) => f.ids[0])).toEqual(["c1", "c3"]);
  });
});
