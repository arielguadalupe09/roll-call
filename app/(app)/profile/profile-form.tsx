"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/_components/toast";

export default function ProfileForm({
  teacherId,
  initialFullName,
  initialDefaultUsePrelims,
}: {
  teacherId: string;
  initialFullName: string | null;
  initialDefaultUsePrelims: boolean;
}) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [defaultUsePrelims, setDefaultUsePrelims] = useState(initialDefaultUsePrelims);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("teachers")
      .update({
        full_name: fullName.trim() || null,
        default_use_prelims: defaultUsePrelims,
      })
      .eq("id", teacherId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    showToast("Your profile has been saved successfully.");
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

        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={defaultUsePrelims}
            onChange={(e) => setDefaultUsePrelims(e.target.checked)}
          />
          <span className="text-sm font-medium text-ink">
            Default new classes to 3 grading periods (Prelims)
          </span>
        </label>
        <p className="mt-1 text-sm text-ink/60">
          Applies to classes you create from now on. Each class still has its
          own switch in Gradebook &rarr; Setup.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </form>

      <ChangePasswordForm />
    </>
  );
}

function ChangePasswordForm() {
  const { showToast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
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
    showToast("Password updated.");
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
        {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
      </div>
    </form>
  );
}
