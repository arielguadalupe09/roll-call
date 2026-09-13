// Shared A/B/C/D... labeling for multiple-choice options -- used anywhere
// options are listed (exam builder, preview, the printed quiz paper) so the
// same option always shows the same letter everywhere a teacher or student
// sees it.
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}
