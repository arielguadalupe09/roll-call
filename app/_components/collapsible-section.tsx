"use client";

import { useState, type ReactNode } from "react";
import { CardHeader } from "./card";

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
      <CardHeader title={title} subtitle={subtitle} actions={actions} chevron={{ open, onToggle: toggle }} />
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
