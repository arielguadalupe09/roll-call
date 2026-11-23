"use client";

import { useRef } from "react";
import { SHEET_OPTIONS, keyTextToLetters } from "@/lib/omr-sheet";

// Typing the answer key by hand: one numbered box per item, ten to a row, so
// a 100-item key can be checked at a glance (a single text field scrolls out
// of view and loses track of which letter is which item).
//
// Type A-E (or 1-5) and the cursor jumps to the next item. Backspace clears
// and steps back, arrow keys move, and pasting a whole key ("ABDCA BCDAB")
// fills from the box it was pasted into. value: one letter per item, "" = unset.
export default function AnswerKeyGrid({
  value,
  onChange,
  optionCount,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  optionCount: number;
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // A-D exams ignore E/5, so a slip of the finger can't add a fifth choice.
  const allowed: readonly string[] = SHEET_OPTIONS.slice(
    0,
    Math.max(optionCount, 4),
  );

  function focus(index: number) {
    const el = boxes.current[Math.max(0, Math.min(value.length - 1, index))];
    el?.focus();
    el?.select();
  }

  function setAt(index: number, letter: string) {
    const next = [...value];
    next[index] = letter;
    onChange(next);
  }

  function toLetter(key: string): string | null {
    const k = key.toUpperCase();
    const letter = /^[1-5]$/.test(k) ? SHEET_OPTIONS[Number(k) - 1] : k;
    return allowed.includes(letter) ? letter : null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // let copy/paste shortcuts through
    const letter = toLetter(e.key);
    if (letter) {
      e.preventDefault();
      setAt(index, letter);
      focus(index + 1);
      return;
    }
    switch (e.key) {
      case "Backspace":
        e.preventDefault();
        if (value[index]) setAt(index, "");
        else if (index > 0) {
          setAt(index - 1, "");
          focus(index - 1);
        }
        return;
      case "Delete":
        e.preventDefault();
        setAt(index, "");
        return;
      case "ArrowRight":
      case " ":
        e.preventDefault();
        focus(index + 1);
        return;
      case "ArrowLeft":
        e.preventDefault();
        focus(index - 1);
        return;
      case "ArrowDown":
        e.preventDefault();
        focus(index + 10);
        return;
      case "ArrowUp":
        e.preventDefault();
        focus(index - 10);
        return;
      case "Tab":
      case "Enter":
        return;
      default:
        if (e.key.length === 1) e.preventDefault(); // ignore other characters
    }
  }

  // Phones' on-screen keyboards often skip keydown, so handle typed input too.
  function onInput(e: React.FormEvent<HTMLInputElement>, index: number) {
    const typed = e.currentTarget.value.slice(-1);
    const letter = typed ? toLetter(typed) : null;
    if (letter) {
      setAt(index, letter);
      focus(index + 1);
    } else {
      e.currentTarget.value = value[index] ?? "";
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, index: number) {
    e.preventDefault();
    const letters = keyTextToLetters(
      e.clipboardData.getData("text"),
      value.length - index,
    );
    // A pasted E on an A-D key is left blank (red) rather than dropped, so later answers keep their items.
    for (let i = 0; i < letters.length; i++)
      if (!allowed.includes(letters[i])) letters[i] = "";
    while (letters.length && !letters[letters.length - 1]) letters.pop();
    if (!letters.length) return;
    const next = [...value];
    letters.forEach((l, i) => (next[index + i] = l));
    onChange(next);
    focus(index + letters.length);
  }

  return (
    <div className="grid grid-cols-5 gap-x-2 gap-y-2.5 sm:grid-cols-10">
      {value.map((letter, i) => {
        const outOfRange = !!letter && !allowed.includes(letter);
        return (
          <label key={i} className="flex flex-col items-center gap-0.5">
            <span
              className={`font-mono text-xs font-semibold ${letter ? "text-muted" : "text-danger"}`}
            >
              {i + 1}
            </span>
            <input
              ref={(el) => {
                boxes.current[i] = el;
              }}
              value={letter}
              onKeyDown={(e) => onKeyDown(e, i)}
              onInput={(e) => onInput(e, i)}
              onChange={() => {}}
              onPaste={(e) => onPaste(e, i)}
              onFocus={(e) => e.currentTarget.select()}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={2}
              aria-label={`Item ${i + 1} answer`}
              className={`h-10 w-full max-w-12 rounded-[7px] border text-center font-mono text-sm font-semibold uppercase text-ink outline-none transition focus:border-slate focus:outline focus:outline-2 focus:outline-slate ${
                letter
                  ? "border-line bg-card"
                  : "border-dashed border-ink/30 bg-paper/60"
              } ${outOfRange ? "!border-danger" : ""}`}
            />
          </label>
        );
      })}
    </div>
  );
}
