"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Student } from "@/lib/types";
import { PAPER_SIZES, type PaperSize } from "@/lib/paper-sizes";

export default function PrintSheet({
  className,
  subject,
  students,
}: {
  className: string;
  subject: string | null;
  students: Student[];
}) {
  const [paperSize, setPaperSize] = useState<PaperSize>("short");

  return (
    <div>
      <style>{`@page { size: ${PAPER_SIZES[paperSize].css}; margin: 0.4in; }`}</style>

      <div className="no-print mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {className} — QR sheet
          </h1>
          <p className="text-ink/60">
            {subject ? `${subject} · ` : ""}One card per student. Print and cut.
          </p>
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
            Print This Sheet
          </button>
        </div>
      </div>

      <div
        id="print-sheet"
        className="mx-auto grid max-w-4xl grid-cols-2 gap-4 bg-white p-6 sm:grid-cols-3"
      >
        {students.map((s) => (
          <div
            key={s.id}
            className="flex flex-col items-center gap-2 rounded-sm border border-gray-300 p-4 text-center"
          >
            {subject && (
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-gray-500">
                {subject}
              </p>
            )}
            <QRCodeSVG value={s.code} size={128} className="qr-code" />
            <p className="card-name font-display text-lg font-semibold text-black">
              {s.name}
            </p>
            <p className="card-code font-mono text-sm tracking-widest text-gray-700">
              {s.code}
            </p>
          </div>
        ))}
        {students.length === 0 && (
          <p className="col-span-full text-center text-gray-500">
            No students in this class yet.
          </p>
        )}
      </div>
    </div>
  );
}
