"use client";

import { useState, type ReactNode } from "react";

export default function CollapsibleSection({
  title,
  subtitle,
  open: openProp,
  onToggle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  open?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((v) => !v));

  return (
    <div className="rounded-sm border border-rule bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Collapse section" : "Expand section"}
          className="flex flex-1 items-center justify-between gap-4 text-left"
        >
          <div>
            <p className="font-display text-lg font-semibold text-ink">{title}</p>
            {subtitle && <p className="mt-0.5 text-sm text-ink/60">{subtitle}</p>}
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className={`shrink-0 text-teal transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {actions}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
