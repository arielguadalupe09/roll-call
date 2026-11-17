// Client-safe email helpers (lib/notify.ts pulls in nodemailer, so it's
// server-only).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "" (or whitespace) -> null, meaning "no email"; a malformed address -> undefined.
export function normalizeEmail(raw: unknown): string | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "string") return undefined;
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !EMAIL_RE.test(email)) return undefined;
  return email;
}
