"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SidebarIcon from "@/app/_components/sidebar-icons";

function LogoBadge() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brass text-chalk">
      <SidebarIcon name="logo" className="h-6 w-6" />
    </span>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-chalk px-6 py-16">
      <div className="w-full max-w-sm rounded-sm border border-rule bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <LogoBadge />
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">
            Reset your password
          </h1>
        </div>

        {done && (
          <p className="mt-6 rounded-sm bg-teal/10 px-3 py-2 text-center text-sm text-teal">
            Password updated — redirecting to your dashboard…
          </p>
        )}

        {!done && !ready && (
          <p className="mt-6 text-center text-sm text-ink/60">
            Open this page from the reset link in your email to continue.
          </p>
        )}

        {!done && ready && (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">New password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-sm border border-rule bg-white/60 px-3 py-2 pr-10 text-ink outline-none focus:border-brass"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink/50 hover:text-ink"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    {showPassword && (
                      <path
                        d="M2 2l12 12"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink">Confirm new password</span>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
              />
            </label>

            {error && (
              <p className="rounded-sm bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-2 rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
