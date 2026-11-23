"use client";

import { useEffect, useState } from "react";
import { signatoriesToParams, type ReportFormat, type ReportSignatories } from "@/lib/item-analysis-report";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";

// Signatories and letterhead are the same for every report a teacher makes,
// so they're remembered on this device (a convenience only -- the report
// falls back to the teacher's own name/card settings when empty).
const STORAGE_KEY = "gains:item-analysis-report";

type Saved = { signatories: ReportSignatories; school: string; campus: string; address: string };

const EMPTY: Saved = {
  signatories: {
    prepared: { name: "", title: "" },
    checked: { name: "", title: "" },
    recommending: { name: "", title: "" },
    approved: { name: "", title: "" },
  },
  school: "",
  campus: "",
  address: "",
};

const ROLES: { key: keyof ReportSignatories; label: string; titleHint: string }[] = [
  { key: "prepared", label: "Prepared", titleHint: "Instructor" },
  { key: "checked", label: "Checked and Reviewed", titleHint: "Program Coordinator" },
  { key: "recommending", label: "Recommending Approval", titleHint: "Chairperson" },
  { key: "approved", label: "Approved", titleHint: "Director / Dean" },
];

const FORMATS: { format: ReportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "docx", label: "Word" },
  { format: "pdf", label: "PDF" },
];

export default function ItemAnalysisExportPanel({
  examId,
  savedPapers,
  unsavedPapers,
}: {
  examId: string;
  savedPapers: number;
  unsavedPapers: number;
}) {
  const [form, setForm] = useState<Saved>(EMPTY);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage after mount
      if (raw) setForm({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      // Storage blocked or bad JSON: start blank.
    }
  }, []);

  function update(next: Saved) {
    setForm(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not persisted; the export still uses what's typed.
    }
  }

  function href(format: ReportFormat) {
    const params = signatoriesToParams(form.signatories, new URLSearchParams({ format }));
    if (form.school.trim()) params.set("school", form.school.trim());
    if (form.campus.trim()) params.set("campus", form.campus.trim());
    if (form.address.trim()) params.set("address", form.address.trim());
    return `/api/export/item-analysis/${examId}?${params}`;
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-paper/60 px-4 py-4">
      <div>
        <p className="text-base font-semibold text-ink">Download the school&apos;s item analysis report</p>
        {savedPapers === 0 && <p className="text-xs text-muted">Scan or type some papers first.</p>}
      </div>
      {savedPapers > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {FORMATS.map((f) => (
            <Button key={f.format} variant="primary" href={href(f.format)} external>
              {f.label}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Hide names & letterhead" : "Edit names & letterhead"}
          </Button>
        </div>
      )}
      {savedPapers > 0 && (
        <p className="text-xs text-muted">
          Uses the {savedPapers} saved paper{savedPapers === 1 ? "" : "s"}
          {unsavedPapers > 0
            ? ` — ${unsavedPapers} unsaved change${unsavedPapers === 1 ? " isn't" : "s aren't"} included`
            : ""}
          . The Excel file is the school template (Multiple Choice, plus the Performance Task sheet with your class list
          for rubric ratings).
        </p>
      )}
      {showForm && savedPapers > 0 && (
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          {ROLES.map((r) => (
            <fieldset key={r.key} className="flex flex-col gap-1">
              <legend className="text-xs font-semibold text-ink">{r.label}</legend>
              <Input
                value={form.signatories[r.key].name}
                onChange={(e) =>
                  update({
                    ...form,
                    signatories: { ...form.signatories, [r.key]: { ...form.signatories[r.key], name: e.target.value } },
                  })
                }
                placeholder={r.key === "prepared" ? "Your name (default)" : "Name"}
                className="!py-1.5 text-sm"
              />
              <Input
                value={form.signatories[r.key].title}
                onChange={(e) =>
                  update({
                    ...form,
                    signatories: {
                      ...form.signatories,
                      [r.key]: { ...form.signatories[r.key], title: e.target.value },
                    },
                  })
                }
                placeholder={r.titleHint}
                className="!py-1.5 text-sm"
              />
            </fieldset>
          ))}
          <fieldset className="flex flex-col gap-1 sm:col-span-2">
            <legend className="text-xs font-semibold text-ink">
              Letterhead (blank = your record-card settings / template)
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                value={form.school}
                onChange={(e) => update({ ...form, school: e.target.value })}
                placeholder="PAMPANGA STATE UNIVERSITY"
                className="!py-1.5 text-sm"
              />
              <Input
                value={form.campus}
                onChange={(e) => update({ ...form, campus: e.target.value })}
                placeholder="MEXICO CAMPUS"
                className="!py-1.5 text-sm"
              />
              <Input
                value={form.address}
                onChange={(e) => update({ ...form, address: e.target.value })}
                placeholder="San Juan, Mexico, Pampanga"
                className="!py-1.5 text-sm"
              />
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
