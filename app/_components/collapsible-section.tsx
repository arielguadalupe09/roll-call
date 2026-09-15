"use client";

import { useEffect, useState, type ReactNode } from "react";
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

  // Sections default closed, but a few pages link straight into one (e.g.
  // the Dashboard's "Need attention" KPI tile links to #insights) -- honor
  // that by opening on arrival instead of scrolling to a section that then
  // shows nothing until the teacher also finds and clicks the chevron.
  useEffect(() => {
    if (id && !isControlled && window.location.hash === `#${id}`) {
      // Syncing from the URL (an external system) on mount, not a
      // render-triggered state cascade -- the case the lint rule's own
      // guidance calls out as fine.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInternalOpen(true);
    }
  }, [id, isControlled]);

  return (
    <div id={id} className={`scroll-mt-6 rounded-[10px] ${SHELL_CLASSES[variant]}`}>
      <CardHeader title={title} subtitle={subtitle} actions={actions} chevron={{ open, onToggle: toggle }} />
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
