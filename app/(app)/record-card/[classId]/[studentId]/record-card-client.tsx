"use client";

import { useRef, useState } from "react";
import type { ClassRow, GradingConfig, Teacher } from "@/lib/types";
import type { RecordCardStudentData } from "@/lib/record-card-data";
import { PAPER_SIZES, type PaperSize } from "@/lib/paper-sizes";
import RecordCardSheet from "../../record-card-sheet";
import { useToast } from "@/app/_components/toast";
import { useConfirm } from "@/app/_components/confirm-provider";
import Button from "@/app/_components/button";
import { Select } from "@/app/_components/input";

type RosterEntry = { id: string; name: string };

export default function RecordCardClient({
  classId,
  classRow,
  teacher,
  data,
  config,
  logoUrl,
  previousStudent,
  nextStudent,
}: {
  classId: string;
  classRow: ClassRow;
  teacher: Teacher | null;
  data: RecordCardStudentData;
  config: GradingConfig;
  logoUrl: string | null;
  previousStudent: RosterEntry | null;
  nextStudent: RosterEntry | null;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [paperSize, setPaperSize] = useState<PaperSize>("long");
  const [exportingPdf, setExportingPdf] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  async function handleSavePdf() {
    if (!cardRef.current) return;

    const confirmed = await confirm(`Save ${data.student.name}'s record card as a PDF?`, {
      confirmLabel: "Save PDF",
    });
    if (!confirmed) return;

    setExportingPdf(true);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas-pro"),
      ]);

      const { widthIn, heightIn } = PAPER_SIZES[paperSize];
      const orientation = widthIn > heightIn ? "landscape" : "portrait";
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgAspect = canvas.width / canvas.height;
      const pageAspect = widthIn / heightIn;
      const renderWidth = imgAspect > pageAspect ? widthIn : heightIn * imgAspect;
      const renderHeight = imgAspect > pageAspect ? widthIn / imgAspect : heightIn;
      const offsetX = (widthIn - renderWidth) / 2;
      const offsetY = (heightIn - renderHeight) / 2;

      const pdf = new jsPDF({ orientation, unit: "in", format: [widthIn, heightIn] });
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        offsetX,
        offsetY,
        renderWidth,
        renderHeight,
      );
      pdf.save(`${data.student.name.replace(/\s+/g, "-").toLowerCase()}-record-card.pdf`);
    } catch (err) {
      console.error("Save PDF failed:", err);
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
            {data.student.name} — Record card
          </h1>
          <p className="text-ink/60">Grades and attendance, one page.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Paper size
            <Select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="w-auto py-1.5"
            >
              {Object.entries(PAPER_SIZES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="secondary" onClick={handleSavePdf} disabled={exportingPdf}>
            {exportingPdf ? "Saving PDF..." : "Save PDF"}
          </Button>
          <Button variant="highlight" onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div className="no-print mx-auto flex max-w-4xl items-center justify-between pb-4">
        {previousStudent ? (
          <Button href={`/record-card/${classId}/${previousStudent.id}`} variant="secondary" size="sm">
            ← {previousStudent.name}
          </Button>
        ) : (
          <span />
        )}
        <Button href={`/record-card/${classId}`} variant="secondary" size="sm">
          All students
        </Button>
        {nextStudent ? (
          <Button href={`/record-card/${classId}/${nextStudent.id}`} variant="secondary" size="sm">
            {nextStudent.name} →
          </Button>
        ) : (
          <span />
        )}
      </div>

      <div
        id="record-card-print"
        ref={cardRef}
        className="mx-auto max-w-4xl bg-white p-6 text-black"
      >
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
