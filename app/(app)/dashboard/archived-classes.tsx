"use client";

import { useState } from "react";
import type { ClassRow } from "@/lib/types";
import ArchiveButton from "./archive-button";
import Button from "@/app/_components/button";

export default function ArchivedClasses({ classes }: { classes: ClassRow[] }) {
  const [open, setOpen] = useState(false);

  if (classes.length === 0) return null;

  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-ink/60 underline underline-offset-2 hover:text-ink"
      >
        {open ? "Hide" : "Show"} archived classes ({classes.length})
      </button>

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {classes.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-[10px] border border-line bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <span className="font-display text-lg font-semibold text-ink/70">
                  {c.name}
                </span>
                <p className="mt-0.5 text-sm text-ink/50">
                  {c.subject || "No subject set"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button href={`/dashboard/classes/${c.slug}`} variant="secondary" size="sm">
                  Open →
                </Button>
                <ArchiveButton classId={c.id} name={c.name} archived />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
