"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProfileForm({
  teacherId,
  initialFullName,
}: {
  teacherId: string;
  initialFullName: string | null;
}) {
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("teachers")
      .update({ full_name: fullName.trim() || null })
      .eq("id", teacherId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <form onSubmit={handleSave} className="mt-6 max-w-md">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Display name</span>
          <input
            type="text"
            placeholder="e.g. Ariel Guadalupe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
        </label>
        <p className="mt-1 text-sm text-ink/60">
          Shown as the Instructor name on printable documents like the Student
          Individual Record Card.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <p className="text-sm text-teal">Your profile has been saved successfully.</p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ChangePasswordForm />
    </>
  );
}

function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordChanged(false);
    setPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }

    setChangingPassword(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setChangingPassword(false);

    if (updateError) {
      setPasswordError(updateError.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordChanged(true);
    setTimeout(() => setPasswordChanged(false), 2000);
  }

  return (
    <form onSubmit={handleChangePassword} className="mt-10 max-w-md">
      <h2 className="font-display text-xl font-semibold text-ink">
        Change password
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">New password</span>
          <input
            type="password"
            placeholder="Min 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">
            Confirm new password
          </span>
          <input
            type="password"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
          />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={changingPassword}
          className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
        >
          {changingPassword ? "Updating..." : "Update password"}
        </button>
        {passwordChanged && <p className="text-sm text-teal">Password updated.</p>}
        {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
      </div>
    </form>
  );
}
