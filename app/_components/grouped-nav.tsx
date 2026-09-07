"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type NavTool = {
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
};

// A "side drop down" nested one level inside a group's dropdown -- for
// grouping a handful of related items (e.g. Written/Laboratory Activity
// under "Activities") without flattening everything into one long list.
export type NavSubmenu = {
  kind: "submenu";
  label: string;
  tools: NavTool[];
};

export type NavGroupEntry = NavTool | NavSubmenu;

function isSubmenu(entry: NavGroupEntry): entry is NavSubmenu {
  return "kind" in entry && entry.kind === "submenu";
}

export type NavItem =
  | ({ kind: "tool" } & NavTool)
  | { kind: "group"; label: string; tools: NavGroupEntry[] };

const FLAT_CLASS =
  "rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition";
const DROPDOWN_ITEM_CLASS =
  "block w-full px-4 py-2 text-left font-mono text-xs uppercase tracking-wide transition";

function ToolControl({ tool, variant }: { tool: NavTool; variant: "flat" | "dropdown" }) {
  const className =
    variant === "flat"
      ? `${FLAT_CLASS} ${
          tool.active ? "bg-brass text-chalk font-semibold" : "text-ink/70 hover:bg-ink/5"
        }`
      : `${DROPDOWN_ITEM_CLASS} ${
          tool.active ? "bg-brass/15 font-semibold text-brass" : "text-ink/70 hover:bg-ink/5"
        }`;

  if (tool.href) {
    return (
      <Link href={tool.href} className={className}>
        {tool.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={tool.onClick} className={className}>
      {tool.label}
    </button>
  );
}

function SubmenuControl({ submenu }: { submenu: NavSubmenu }) {
  const [open, setOpen] = useState(false);
  const active = submenu.tools.some((t) => t.active);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          // Stop this from bubbling to the parent dropdown panel's
          // click-to-close handler -- toggling the submenu shouldn't
          // close the dropdown it lives in.
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`flex w-full items-center justify-between gap-2 ${DROPDOWN_ITEM_CLASS} ${
          active ? "bg-brass/15 font-semibold text-brass" : "text-ink/70 hover:bg-ink/5"
        }`}
      >
        {submenu.label}
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-full top-0 z-30 ml-1 min-w-[11rem] overflow-hidden rounded-xl border border-rule/60 bg-white py-1 shadow-lg"
        >
          {submenu.tools.map((tool) => (
            <ToolControl key={tool.label} tool={tool} variant="dropdown" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GroupedNav({ items }: { items: NavItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-start gap-2 border-b border-rule/60 pb-3"
    >
      {items.map((item) => {
        if (item.kind === "tool") {
          return <ToolControl key={item.label} tool={item} variant="flat" />;
        }

        const groupActive = item.tools.some((entry) =>
          isSubmenu(entry) ? entry.tools.some((t) => t.active) : entry.active,
        );
        const isOpen = openGroup === item.label;

        return (
          <div key={item.label} className="relative">
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : item.label)}
              aria-expanded={isOpen}
              className={`flex items-center gap-2 ${FLAT_CLASS} ${
                groupActive ? "bg-chalk text-paper font-semibold" : "text-ink/70 hover:bg-ink/5"
              }`}
            >
              {item.label}
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
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

            {isOpen && (
              <div
                onClick={() => setOpenGroup(null)}
                // No overflow-hidden here (unlike the flat-item dropdowns) --
                // it would clip a submenu's flyout, which is deliberately
                // positioned outside this box via left-full. Rounded corners
                // come from rounding the first/last child directly instead.
                className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] rounded-xl border border-rule/60 bg-white py-1 shadow-lg [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl [&>*>*:first-child]:rounded-t-xl [&>*>*:last-child]:rounded-b-xl"
              >
                {item.tools.map((entry) =>
                  isSubmenu(entry) ? (
                    <SubmenuControl key={entry.label} submenu={entry} />
                  ) : (
                    <ToolControl key={entry.label} tool={entry} variant="dropdown" />
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
