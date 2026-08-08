export const PAPER_SIZES = {
  long: { label: "Long / 8.5 × 13 in", css: "8.5in 13in", widthIn: 8.5, heightIn: 13 },
  short: {
    label: "Short / 8.5 × 11 in (Letter)",
    css: "8.5in 11in",
    widthIn: 8.5,
    heightIn: 11,
  },
  legal: { label: "Legal / 8.5 × 14 in", css: "8.5in 14in", widthIn: 8.5, heightIn: 14 },
  a4: { label: "A4", css: "210mm 297mm", widthIn: 8.2677, heightIn: 11.6929 },
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;
