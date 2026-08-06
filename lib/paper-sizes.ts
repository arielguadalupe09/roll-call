export const PAPER_SIZES = {
  long: { label: "Long / 8.5 × 13 in", css: "8.5in 13in" },
  short: { label: "Short / 8.5 × 11 in (Letter)", css: "8.5in 11in" },
  legal: { label: "Legal / 8.5 × 14 in", css: "8.5in 14in" },
  a4: { label: "A4", css: "210mm 297mm" },
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;
