"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import gsap from "gsap";
import { createClient } from "@/lib/supabase/client";
import SidebarIcon from "@/app/_components/sidebar-icons";

const FEATURES = [
  "Track attendance via QR scan or self check-in",
  "Manage class schedules",
  "Grade quizzes, exams & recitations",
  "Share announcements & materials",
  "Generate printable reports",
];

function LogoBadge({ size = "h-14 w-14" }: { size?: string }) {
  return (
    <span className={`relative flex ${size} shrink-0`}>
      <Image
        src="/logo-icon.png"
        alt="GAINS"
        width={512}
        height={512}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/reset-password` },
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetSent(true);
    } catch {
      setError(
        "Could not reach the server. Check your internet connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setError(null);
    setResetSent(false);
    setMode(next);
  }

  useEffect(() => {
    const mm = gsap.matchMedia(rootRef);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from("[data-animate='left-decor']", {
          scale: 0,
          opacity: 0,
          duration: 0.9,
          stagger: 0.15,
          ease: "power2.out",
        })
        .from(
          "[data-animate='left-item']",
          { opacity: 0, y: 16, duration: 0.5, stagger: 0.08 },
          "-=0.55",
        )
        .from(
          "[data-animate='feature-item']",
          { opacity: 0, x: -12, duration: 0.4, stagger: 0.06 },
          "-=0.2",
        )
        .from(
          "[data-animate='form-card']",
          { opacity: 0, y: 24, duration: 0.6 },
          "-=0.6",
        );
    });

    return () => mm.revert();
  }, []);

  return (
    <main ref={rootRef} className="flex min-h-full flex-1 flex-col md:flex-row">
      <div className="relative flex flex-col justify-center overflow-hidden bg-chalk px-8 py-16 sm:px-14 md:w-1/2 md:py-0">
        <div
          data-animate="left-decor"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brass/10"
          aria-hidden="true"
        />
        <div
          data-animate="left-decor"
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-teal/10"
          aria-hidden="true"
        />

        <div className="relative">
          <div data-animate="left-item">
            <LogoBadge />
          </div>
          <span
            data-animate="left-item"
            className="mt-6 inline-block rounded-full border border-rule/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-rule"
          >
            Teacher Portal
          </span>
          <h1 data-animate="left-item" className="mt-4 font-display text-4xl font-semibold text-paper">
            GAINS
          </h1>
          <p data-animate="left-item" className="mt-1 font-mono text-[11px] uppercase tracking-[0.15em] text-rule/70">
            Grading &amp; Attendance Intelligent Network System
          </p>
          <p data-animate="left-item" className="mt-3 max-w-sm font-display text-lg italic text-rule">
            Attendance and grading, simplified.
          </p>
          <p data-animate="left-item" className="mt-1 max-w-sm text-sm text-rule/80">
            Pampanga State University — College of Computing Studies
          </p>

          <ul className="mt-8 flex max-w-sm flex-col gap-2.5">
            {FEATURES.map((feature) => (
              <li
                key={feature}
                data-animate="feature-item"
                className="flex items-start gap-2 text-sm text-paper/90"
              >
                <SidebarIcon name="attendance" className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="ledger-page flex flex-1 items-center justify-center px-6 py-16">
        <div
          data-animate="form-card"
          className="w-full max-w-sm rounded-2xl border border-rule/60 bg-white p-8 shadow-xl"
        >
          <div className="flex flex-col items-center text-center">
            <LogoBadge size="h-12 w-12" />
            <h2 className="mt-4 font-display text-xl font-semibold text-ink">
              GAINS — Teacher Portal
            </h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-teal">
              {mode === "signin" && "Sign in"}
              {mode === "signup" && "Create account"}
              {mode === "forgot" && "Reset password"}
            </p>
            <p className="mt-2 text-sm text-ink/60">
              {mode === "signin" && "Use your teacher account to access the portal."}
              {mode === "signup" && "Set up a new teacher account."}
              {mode === "forgot" &&
                "Enter your email and we'll send you a link to reset your password."}
            </p>
          </div>

          {mode === "forgot" ? (
            resetSent ? (
              <p className="mt-6 rounded-sm bg-teal/10 px-3 py-2 text-center text-sm text-teal">
                Check your email for a reset link.
              </p>
            ) : (
              <form onSubmit={handleForgotSubmit} className="mt-6 flex flex-col gap-4">
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
                  {loading ? "Sending..." : "Send reset link"}
                </button>
              </form>
            )
          ) : (
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
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="self-end text-sm text-teal underline underline-offset-2"
                >
                  Forgot password?
                </button>
              )}

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
          )}

          <button
            onClick={() =>
              switchMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup")
            }
            className="mt-4 block w-full text-center text-sm text-teal underline underline-offset-2"
          >
            {mode === "signup" && "Already have an account? Sign in"}
            {mode === "forgot" && "Back to sign in"}
            {mode === "signin" && "Need an account? Sign up"}
          </button>

          <p className="mt-6 text-center text-xs text-ink/40">
            GAINS — Teacher Portal. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
