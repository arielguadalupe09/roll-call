import { describe, expect, it } from "vitest";
import { releasedGrade } from "./grade-release";
import type { DhvsuGrade } from "./dhvsu-grade";
import type { Period } from "./types";

const computed: DhvsuGrade = {
  prelim: null,
  midterm: 80.2,
  finals: 90,
  final: 85,
  equivalent: 2.25,
  termEquivalents: { midterm: 2.75, finals: 1.75 },
  terms: {},
};
const terms: Period[] = ["midterm", "finals"];

describe("releasedGrade", () => {
  it("hides everything before any release", () => {
    const g = releasedGrade(computed, terms, new Set());
    expect(g).toMatchObject({ midterm: null, finals: null, final: null, equivalent: null, released: [] });
    expect(g.termEquivalents).toEqual({});
  });

  it("shows only the released midterm, not finals or the final rating", () => {
    const g = releasedGrade(computed, terms, new Set<Period>(["midterm"]));
    expect(g).toMatchObject({ midterm: 80.2, finals: null, final: null, equivalent: null, released: ["midterm"] });
    expect(g.termEquivalents).toEqual({ midterm: 2.75 });
  });

  it("shows the final rating once every term is released", () => {
    const g = releasedGrade(computed, terms, new Set<Period>(["midterm", "finals"]));
    expect(g).toMatchObject({ midterm: 80.2, finals: 90, final: 85, equivalent: 2.25 });
  });
});
