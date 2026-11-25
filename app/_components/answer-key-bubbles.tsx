"use client";

import { SHEET_OPTIONS } from "@/lib/omr-sheet";

// Items are spread evenly over up to four columns (25 items -> 7, 7, 7, 4),
// so a short exam fills the width instead of one long column on the left.
// Numbering still runs down each column, like the printed sheet.
const MAX_COLUMNS = 4;
const MIN_ROWS = 5;
const LG_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4"];
const SM_COLS = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-2", "sm:grid-cols-2"];

// On-screen copy of the bubble answer sheet for entering the answer key:
// tap an oval to choose that item's answer, tap it again to clear it.
// value: one letter per item, "" = not set yet.
export default function AnswerKeyBubbles({
  value,
  onChange,
  optionCount,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  optionCount: number;
  disabled?: boolean;
}) {
  const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(value.length / MIN_ROWS)));
  const rows = Math.ceil(value.length / columns);
  const options = SHEET_OPTIONS.slice(0, optionCount);

  function choose(index: number, letter: string) {
    const next = [...value];
    next[index] = next[index] === letter ? "" : letter;
    onChange(next);
  }

  return (
    <div className={`grid grid-cols-1 gap-x-6 gap-y-1 ${SM_COLS[columns]} ${LG_COLS[columns]}`}>
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className="flex flex-col gap-1">
          {value.slice(c * rows, (c + 1) * rows).map((answer, r) => {
            const index = c * rows + r;
            return (
              <div key={index} className="flex items-center gap-1.5" role="group" aria-label={`Item ${index + 1}`}>
                <span
                  className={`w-7 text-right font-mono text-xs font-semibold ${answer ? "text-ink" : "text-danger"}`}
                >
                  {index + 1}
                </span>
                {options.map((letter) => {
                  const on = answer === letter;
                  return (
                    <button
                      key={letter}
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      aria-label={`Item ${index + 1}, answer ${letter}`}
                      onClick={() => choose(index, letter)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition sm:h-6 sm:w-6 ${
                        on
                          ? "border-navy bg-navy text-card"
                          : "border-ink/40 bg-card text-ink/50 hover:border-navy hover:text-navy"
                      } disabled:opacity-60`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
