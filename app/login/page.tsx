"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const { error: authError } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(
        "Could not reach the server. Check your internet connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-chalk px-6 py-16">
      <div className="ledger-page w-full max-w-sm rounded-sm border border-rule p-8 shadow-xl">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-teal">
          Roll Call
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          {mode === "signin" ? "Teacher sign in" : "Create teacher account"}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-sm border border-rule bg-white/60 px-3 py-2 text-ink outline-none focus:border-brass"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            disabled={loading}
            className="mt-2 rounded-sm bg-brass px-4 py-2 font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Sign up"}
          </button>
        </form>

        <button
          onClick={() => {
            setError(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
          className="mt-4 text-sm text-teal underline underline-offset-2"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
