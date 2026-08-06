// Soft pastel palette, deterministically assigned by subject code so the
// same subject always gets the same color without storing it explicitly.
const PALETTE = [
  "#cfe0f3", // blue
  "#fde6c9", // orange
  "#cdead0", // green
  "#f7d3cf", // salmon
  "#e3d8f5", // lavender
  "#fdf0b0", // yellow
];

export function colorForSubject(code: string): string {
  let hash = 0;
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
