"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

export type MenuSelectOption<T extends string> = { value: T; label: string };

// A compact dropdown that looks like the top nav's group buttons
// (GroupedNav) instead of a native <select>: same rounded trigger with a
// turning chevron, same white panel with the gold "current" highlight. The
// panel eases in with GSAP (skipped under prefers-reduced-motion).
export default function MenuSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  // Shown before the current value inside the trigger, e.g. "Show".
  label: string;
  value: T;
  options: MenuSelectOption<T>[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: -6, scale: 0.97, transformOrigin: "top left" },
        { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: "power2.out" },
      );
      gsap.fromTo(
        panelRef.current!.querySelectorAll("[role='option']"),
        { opacity: 0, x: -4 },
        { opacity: 1, x: 0, duration: 0.16, stagger: 0.025, ease: "power1.out", delay: 0.04 },
      );
    });
    return () => mm.revert();
  }, [open]);

  function openMenu() {
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(next: T) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[highlight].value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
          open ? "border-navy bg-navy text-card" : "border-line bg-card text-ink hover:bg-slate-light"
        }`}
      >
        <span className={open ? "text-card/70" : "text-muted"}>{label}</span>
        <span>{current.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full z-20 mt-1 min-w-full overflow-hidden rounded-xl border border-line/60 bg-white py-1 shadow-lg"
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center justify-between gap-4 whitespace-nowrap px-4 py-2 text-left text-sm transition ${
                  selected
                    ? "bg-gold-soft font-semibold text-ink"
                    : i === highlight
                      ? "bg-slate-light text-ink"
                      : "text-muted hover:bg-slate-light hover:text-ink"
                }`}
              >
                {o.label}
                {selected && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
