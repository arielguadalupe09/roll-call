import type { DhvsuGrade } from "./dhvsu-grade";
import type { Period } from "./types";

// What the student portal may show of a computed grade: a term's grade
// (and equivalent) only once the teacher has released that term, and the
// final rating only once every term is released (grade_releases).
export function releasedGrade(computed: DhvsuGrade, termPeriods: Period[], released: Set<Period>) {
  const allReleased = termPeriods.every((p) => released.has(p));
  const termEquivalents: Partial<Record<Period, number | "FA">> = {};
  for (const p of termPeriods) {
    const eq = computed.termEquivalents[p];
    if (released.has(p) && eq != null) termEquivalents[p] = eq;
  }
  return {
    prelim: released.has("prelim") ? computed.prelim : null,
    midterm: released.has("midterm") ? computed.midterm : null,
    finals: released.has("finals") ? computed.finals : null,
    final: allReleased ? computed.final : null,
    equivalent: allReleased ? computed.equivalent : null,
    termEquivalents,
    released: termPeriods.filter((p) => released.has(p)),
  };
}
