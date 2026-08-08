export type RecordCardSectionKey =
  | "assignment"
  | "recitation"
  | "quiz"
  | "major_exam"
  | "written"
  | "laboratory"
  | "attendance";

export type RecordCardLayout = {
  order?: RecordCardSectionKey[];
  titles?: Partial<Record<RecordCardSectionKey, string>>;
};

export const DEFAULT_SECTION_ORDER: RecordCardSectionKey[] = [
  "assignment",
  "recitation",
  "quiz",
  "major_exam",
  "written",
  "laboratory",
  "attendance",
];

export const DEFAULT_SECTION_TITLES: Record<RecordCardSectionKey, string> = {
  assignment: "Assignment",
  recitation: "Recitation",
  quiz: "Quizzes",
  major_exam: "Major exam",
  written: "Written activities",
  laboratory: "Lab activities",
  attendance: "Attendance",
};

// Merges a stored order with the known section keys so callers never have
// to handle missing/stale data — anything absent from a stored order (e.g.
// a class saved before a new section key existed) is appended at the end,
// and unknown keys (e.g. from a since-removed section) are dropped.
export function resolveSectionOrder(
  layout: RecordCardLayout | null | undefined,
): RecordCardSectionKey[] {
  const stored = layout?.order ?? [];
  const known = new Set<string>(DEFAULT_SECTION_ORDER);
  const validStored = stored.filter((key): key is RecordCardSectionKey => known.has(key));
  const seen = new Set(validStored);
  const missing = DEFAULT_SECTION_ORDER.filter((key) => !seen.has(key));
  return [...validStored, ...missing];
}

export function sectionTitle(
  layout: RecordCardLayout | null | undefined,
  key: RecordCardSectionKey,
): string {
  return layout?.titles?.[key]?.trim() || DEFAULT_SECTION_TITLES[key];
}

export function moveSection(
  order: RecordCardSectionKey[],
  key: RecordCardSectionKey,
  direction: "up" | "down",
): RecordCardSectionKey[] {
  const index = order.indexOf(key);
  if (index === -1) return order;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length) return order;

  const next = [...order];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}
