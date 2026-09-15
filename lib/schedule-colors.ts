// Hex values for the shared category tones (@theme's --sage/--dustyblue/
// --clay/--violet, kept in sync by hand since this file needs raw hex for
// inline styles rather than Tailwind classes). The border/tint pairing is
// the design system's "3px left accent + tinted bg + dark ink text"
// category-color rule.
import { getCategoryColor, type CategoryTone } from "./category-colors";

const HEX: Record<CategoryTone, { border: string; tint: string }> = {
  sage: { border: "#6E8C7B", tint: "#E4ECE6" },
  dustyblue: { border: "#5C7FA8", tint: "#E4EAF2" },
  clay: { border: "#B37B65", tint: "#F1E4DD" },
  violet: { border: "#7C6C9C", tint: "#EAE4F1" },
};

export function colorForSubject(code: string): string {
  return HEX[getCategoryColor(code)].tint;
}

export function borderColorForSubject(code: string): string {
  return HEX[getCategoryColor(code)].border;
}
