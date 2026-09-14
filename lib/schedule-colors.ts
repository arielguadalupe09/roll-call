// Category color-coding, deterministically assigned by subject code so the
// same subject always gets the same color without storing it explicitly.
// Each entry is a { border, tint } pair: a solid accent for the 3px left
// border and a light tint for the cell background, per the design system's
// "3px left accent + tinted bg + dark ink text" category-color rule.
const PALETTE = [
  { border: "#6E8C7B", tint: "#E4ECE6" }, // sage
  { border: "#5C7FA8", tint: "#E4EAF2" }, // dustyblue
  { border: "#B37B65", tint: "#F1E4DD" }, // clay
  { border: "#7C6C9C", tint: "#EAE4F1" }, // violet
];

function indexForSubject(code: string): number {
  let hash = 0;
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % PALETTE.length;
}

export function colorForSubject(code: string): string {
  return PALETTE[indexForSubject(code)].tint;
}

export function borderColorForSubject(code: string): string {
  return PALETTE[indexForSubject(code)].border;
}
