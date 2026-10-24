import { describe, expect, it } from "vitest";
import { CLASS_STANDING_SLOTS, COURSE_TYPE_PRESETS, criterionLabel, isCriterionActive } from "./grading-criteria";

describe("criterionLabel", () => {
  it("uses the teacher's name, else the default", () => {
    expect(criterionLabel({ criteria_labels: { written: "Seatwork" } }, "written")).toBe("Seatwork");
    expect(criterionLabel({ criteria_labels: { written: "  " } }, "written")).toBe("Written Activity");
    expect(criterionLabel(null, "quiz")).toBe("Quizzes");
    expect(criterionLabel(null, "other")).toBe("Other");
  });
});

describe("isCriterionActive", () => {
  it("keeps the first four always on and the 5th off until named or weighted", () => {
    expect(isCriterionActive(null, "laboratory")).toBe(true);
    expect(isCriterionActive({ criteria_labels: {}, weight_other: 0 }, "other")).toBe(false);
    expect(isCriterionActive({ criteria_labels: { other: "Projects" }, weight_other: 0 }, "other")).toBe(true);
    expect(isCriterionActive({ criteria_labels: {}, weight_other: 10 }, "other")).toBe(true);
  });
});

describe("course type presets", () => {
  it("add up to 100% like the DHVSU Version sheet", () => {
    for (const preset of Object.values(COURSE_TYPE_PRESETS)) {
      const total = Object.values(preset!).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBe(100);
    }
  });

  it("map to the Info sheet's rows 41-45 in order", () => {
    expect(CLASS_STANDING_SLOTS.map((s) => s.infoRow)).toEqual([41, 42, 43, 44, 45]);
    expect(CLASS_STANDING_SLOTS.map((s) => s.column)).toEqual(["H", "N", "T", "Z", "AF"]);
  });
});
