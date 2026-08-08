"use client";

import { useEffect, useRef, useState } from "react";
import type { ClassRow, GradingConfig, Teacher } from "@/lib/types";
import type { RecordCardStudentData } from "@/lib/record-card-data";
import { PAPER_SIZES, type PaperSize } from "@/lib/paper-sizes";
import RecordCardSheet from "../record-card-sheet";
import { useToast } from "@/app/_components/toast";

export default function RecordCardAllClient({
  classRow,
  teacher,
  allData,
  config,
  logoUrl,
}: {
  classRow: ClassRow;
  teacher: Teacher | null;
  allData: RecordCardStudentData[];
  config: GradingConfig;
  logoUrl: string | null;
}) {
  const { showToast } = useToast();
  const [paperSize, setPaperSize] = useState<PaperSize>("long");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printSelectedOnly, setPrintSelectedOnly] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Flip printSelectedOnly to hide non-selected cards behind a print-only
  // class, wait for that to commit to the DOM, then open the print dialog —
  // and clear the flag once it closes so a later plain print isn't scoped.
  useEffect(() => {
    if (!printSelectedOnly) return;
    window.print();
    function handleAfterPrint() {
      setPrintSelectedOnly(false);
    }
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printSelectedOnly]);

  function handlePrint() {
    if (selected.size > 0) {
      setPrintSelectedOnly(true);
    } else {
      window.print();
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === allData.length ? new Set() : new Set(allData.map((d) => d.student.id)),
    );
  }

  function jumpTo(studentId: string) {
    cardRefs.current[studentId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSavePdf() {
    if (allData.length === 0) return;
    setExportingPdf(true);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const targets =
        selected.size > 0 ? allData.filter((d) => selected.has(d.student.id)) : allData;
      const { widthIn, heightIn } = PAPER_SIZES[paperSize];
      const orientation = widthIn > heightIn ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "in", format: [widthIn, heightIn] });

      for (let i = 0; i < targets.length; i++) {
        const node = cardRefs.current[targets[i].student.id];
        if (!node) continue;

        const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
        const imgAspect = canvas.width / canvas.height;
        const pageAspect = widthIn / heightIn;
        const renderWidth = imgAspect > pageAspect ? widthIn : heightIn * imgAspect;
        const renderHeight = imgAspect > pageAspect ? widthIn / imgAspect : heightIn;
        const offsetX = (widthIn - renderWidth) / 2;
        const offsetY = (heightIn - renderHeight) / 2;

        if (i > 0) pdf.addPage([widthIn, heightIn], orientation);
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          offsetX,
          offsetY,
          renderWidth,
          renderHeight,
        );
      }

      const suffix = selected.size > 0 ? `-${targets.length}-selected` : "";
      pdf.save(
        `${classRow.name.replace(/\s+/g, "-").toLowerCase()}-record-cards${suffix}.pdf`,
      );
    } catch {
      showToast("Could not generate the PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="px-8 py-10">
      <style>{`@page { size: ${PAPER_SIZES[paperSize].css}; margin: 0.4in; }`}</style>

      <div className="no-print mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 pb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {classRow.name} — Record Cards
          </h1>
          <p className="text-ink/60">
            {allData.length} student{allData.length === 1 ? "" : "s"}, 1 page each.
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
            onClick={handleSavePdf}
            disabled={exportingPdf || allData.length === 0}
            className="rounded-sm border border-teal px-4 py-2 font-medium text-teal transition hover:bg-teal/10 disabled:opacity-60"
          >
            {exportingPdf
              ? "Saving PDF..."
              : selected.size > 0
                ? `Save PDF (${selected.size} selected)`
                : "Save PDF (all students)"}
          </button>
          <button
            onClick={handlePrint}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110"
          >
            {selected.size > 0 ? `Print (${selected.size} selected)` : "Print all"}
          </button>
        </div>
      </div>

      {allData.length > 0 && (
        <div className="no-print mx-auto mb-6 max-w-4xl rounded-sm border border-rule bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-wide text-ink/60">
              Jump to a student
            </p>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                checked={selected.size === allData.length}
                onChange={toggleSelectAll}
              />
              Select all
            </label>
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Check students to limit &quot;Save PDF&quot; and &quot;Print&quot;
            to just them — leave none checked to include everyone.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {allData.map((d) => (
              <li key={d.student.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(d.student.id)}
                  onChange={() => toggleSelected(d.student.id)}
                  aria-label={`Select ${d.student.name}`}
                />
                <button
                  onClick={() => jumpTo(d.student.id)}
                  className="truncate text-left text-sm text-teal underline underline-offset-2"
                >
                  {d.student.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div id="record-card-print" className="mx-auto max-w-4xl bg-white p-6 text-black">
        {allData.length === 0 ? (
          <p className="text-center text-ink/60">No students in this class yet.</p>
        ) : (
          allData.map((data, i) => (
            <div
              key={data.student.id}
              ref={(el) => {
                cardRefs.current[data.student.id] = el;
              }}
              className={
                printSelectedOnly && !selected.has(data.student.id) ? "print:hidden" : ""
              }
            >
              <RecordCardSheet
                classRow={classRow}
                teacher={teacher}
                data={data}
                config={config}
                logoUrl={logoUrl}
                breakBeforePage={i > 0}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
