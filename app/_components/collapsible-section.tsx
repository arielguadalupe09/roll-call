"use client";

import { useState, type ReactNode } from "react";

const SHELL_CLASSES = {
  default: "border border-line bg-card p-4",
  flat: "p-4",
  primary: "border border-line bg-card p-5 border-t-2 border-t-gold",
} as const;

export default function CollapsibleSection({
  title,
  subtitle,
  open: openProp,
  onToggle,
  defaultOpen = false,
  actions,
  id,
  children,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
  actions?: ReactNode;
  id?: string;
  children: ReactNode;
  variant?: keyof typeof SHELL_CLASSES;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((v) => !v));

  return (
    <div id={id} className={`scroll-mt-6 rounded-[10px] ${SHELL_CLASSES[variant]}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Collapse section" : "Expand section"}
          className="flex flex-1 items-center justify-between gap-4 text-left"
        >
          <div>
            <p className="font-display text-lg font-semibold text-ink">{title}</p>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className={`shrink-0 text-slate transition-transform ${open ? "rotate-180" : ""}`}
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
