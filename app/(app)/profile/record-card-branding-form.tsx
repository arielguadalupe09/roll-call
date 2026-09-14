"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { FormField } from "@/app/_components/form-field";

type LogoSlot = "primary" | "secondary";

export default function RecordCardBrandingForm({
  teacherId,
  initialSchoolName,
  initialCampusLine,
  initialLogoUrl,
  initialLogoUrlSecondary,
}: {
  teacherId: string;
  initialSchoolName: string | null;
  initialCampusLine: string | null;
  initialLogoUrl: string | null;
  initialLogoUrlSecondary: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [schoolName, setSchoolName] = useState(initialSchoolName ?? "");
  const [campusLine, setCampusLine] = useState(initialCampusLine ?? "");
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoUrlSecondary, setLogoUrlSecondary] = useState(initialLogoUrlSecondary);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<LogoSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputSecondaryRef = useRef<HTMLInputElement>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
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
    showToast("Your branding has been saved successfully.");
    router.refresh();
  }

  async function handleLogoChange(slot: LogoSlot, file: File | null) {
    if (!file) return;
    setUploading(slot);
    setError(null);

    const supabase = createClient();
    const ext = file.name.split(".").pop() || "png";
    const path = `${teacherId}/${slot === "primary" ? "logo" : "logo2"}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("card-logos")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setUploading(null);
      setError(uploadError.message);
      return;
    }

    const column = slot === "primary" ? "card_logo_path" : "card_logo_path_secondary";
    const { error: updateError } = await supabase
      .from("teachers")
      .update({ [column]: path })
      .eq("id", teacherId);

    if (updateError) {
      setUploading(null);
      setError(updateError.message);
      return;
    }

    const { data: signed } = await supabase.storage
      .from("card-logos")
      .createSignedUrl(path, 3600);

    if (slot === "primary") {
      setLogoUrl(signed?.signedUrl ?? null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setLogoUrlSecondary(signed?.signedUrl ?? null);
      if (fileInputSecondaryRef.current) fileInputSecondaryRef.current.value = "";
    }
    setUploading(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="mt-10 max-w-md">
      <h2 className="font-display text-xl font-semibold text-ink">
        Record Card branding
      </h2>
      <p className="mt-1 text-sm text-ink/60">
        Shown on the letterhead of every printed Student Individual Record Card and exam paper.
      </p>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-white/60">
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
            onChange={(e) => handleLogoChange("primary", e.target.files?.[0] ?? null)}
            disabled={uploading === "primary"}
            className="text-sm text-ink/70 file:mr-3 file:rounded-sm file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-ink/5"
          />
          {uploading === "primary" && <span className="text-xs text-ink/60">Uploading...</span>}
        </label>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-white/60">
          {logoUrlSecondary ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrlSecondary}
              alt="Secondary logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-center text-xs text-ink/40">No logo</span>
          )}
        </div>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-ink">Secondary logo (optional)</span>
          <input
            ref={fileInputSecondaryRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleLogoChange("secondary", e.target.files?.[0] ?? null)}
            disabled={uploading === "secondary"}
            className="text-sm text-ink/70 file:mr-3 file:rounded-sm file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-ink/5"
          />
          {uploading === "secondary" && <span className="text-xs text-ink/60">Uploading...</span>}
        </label>
      </div>

      <FormField label="School name" className="mt-4">
        <Input
          type="text"
          placeholder="e.g. Pampanga State University"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
        />
      </FormField>
      <FormField label="Campus / department line" className="mt-3">
        <Input
          type="text"
          placeholder="e.g. Mexico Campus — College of Computing Studies"
          value={campusLine}
          onChange={(e) => setCampusLine(e.target.value)}
        />
      </FormField>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
