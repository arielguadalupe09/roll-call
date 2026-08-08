"use client";

import { useState } from "react";
import type { ClassRow, GradingConfig, Teacher } from "@/lib/types";
import type { RecordCardStudentData } from "@/lib/record-card-data";
import { PAPER_SIZES, type PaperSize } from "@/lib/paper-sizes";
import RecordCardSheet from "../../record-card-sheet";

export default function RecordCardClient({
  classRow,
  teacher,
  data,
  config,
  logoUrl,
}: {
  classRow: ClassRow;
  teacher: Teacher | null;
  data: RecordCardStudentData;
  config: GradingConfig;
  logoUrl: string | null;
}) {
  const [paperSize, setPaperSize] = useState<PaperSize>("long");

  return (
    <div className="px-8 py-10">
      <style>{`@page { size: ${PAPER_SIZES[paperSize].css}; margin: 0.4in; }`}</style>

      <div className="no-print mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {data.student.name} — Record Card
          </h1>
          <p className="text-ink/60">Grades and attendance, one page.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink/70">
            Paper size
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="rounded-sm border border-rule bg-white px-2 py-1.5 text-ink outline-none focus:border-brass"
            >
              {Object.entries(PAPER_SIZES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => window.print()}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110"
          >
            Print
          </button>
        </div>
      </div>

      <div id="record-card-print" className="mx-auto max-w-4xl bg-white p-6 text-black">
        <RecordCardSheet
          classRow={classRow}
          teacher={teacher}
          data={data}
          config={config}
          logoUrl={logoUrl}
        />
      </div>
    </div>
  );
}
