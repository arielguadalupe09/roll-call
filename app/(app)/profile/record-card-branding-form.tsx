"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RecordCardBrandingForm({
  teacherId,
  initialSchoolName,
  initialCampusLine,
  initialLogoUrl,
}: {
  teacherId: string;
  initialSchoolName: string | null;
  initialCampusLine: string | null;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const [schoolName, setSchoolName] = useState(initialSchoolName ?? "");
  const [campusLine, setCampusLine] = useState(initialCampusLine ?? "");
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("teachers")
      .update({
        card_school_name: schoolName.trim() || null,
        card_campus_line: campusLine.trim() || null,
      })
      .eq("id", teacherId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function handleLogoChange(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);

    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `${teacherId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("card-logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("teachers")
      .update({ card_logo_path: path })
      .eq("id", teacherId);

    if (updateError) {
      setUploading(false);
      setError(updateError.message);
      return;
    }

    const { data: signed } = await supabase.storage
      .from("card-logos")
      .createSignedUrl(path, 3600);

    setLogoUrl(signed?.signedUrl ?? null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="mt-10 max-w-md">
      <h2 className="font-display text-xl font-semibold text-ink">
        Record Card branding
      </h2>
      <p className="mt-1 text-sm text-ink/60">
        Shown on the letterhead of every printed Student Individual Record Card.
      </p>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule bg-white/60">
          {logoUrl ? (
            // Signed Supabase Storage URL — next/image would need the
            // project's storage domain configured as a remote pattern for
            // no real benefit here, so a plain <img> is simpler.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-ink/40">No logo</span>
          )}
        </div>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-ink">Logo</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
            disabled={uploading}
            className="text-sm text-ink/70 file:mr-3 file:rounded-sm file:border file:border-rule file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-ink/5"
          />
          {uploading && <span className="text-xs text-ink/60">Uploading...</span>}
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">School name</span>
        <input
          type="text"
          placeholder="e.g. Pampanga State University"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
      </label>
      <label className="mt-3 flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">Campus / department line</span>
        <input
          type="text"
          placeholder="e.g. Mexico Campus — College of Computing Studies"
          value={campusLine}
          onChange={(e) => setCampusLine(e.target.value)}
          className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && (
          <p className="text-sm text-teal">Your branding has been saved successfully.</p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
