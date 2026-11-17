import nodemailer, { type Transporter } from "nodemailer";
import type { Period } from "./types";
export { normalizeEmail } from "./email";

// Student emails, adapted from the Queen of Smiles booking notices
// (queensmile/notify.py): plain-text messages over SMTP, configured only by
// SMTP_* environment variables. Without SMTP_HOST nothing is sent -- the
// message is printed to the server log instead (status "logged"), so the
// feature works end to end before email is set up.
//
// The email deliberately carries no grade: a mistyped address would
// otherwise hand a student's grade to a stranger. It only says the grade is
// out and points to /student, where the student code gates the actual number.

const PERIOD_LABEL: Record<Period, string> = {
  prelim: "Prelim",
  midterm: "Midterm",
  finals: "Finals",
};

// "Dela Cruz, Juan M." -> "Juan"; names without a comma are used as they are.
export function firstNameOf(studentName: string): string {
  const [last, rest] = studentName.split(",", 2);
  const given = (rest ?? last).trim().split(/\s+/);
  // Drop a trailing middle initial ("M.").
  if (given.length > 1 && /^[A-Za-z]\.$/.test(given[given.length - 1])) given.pop();
  return given.join(" ") || studentName.trim();
}

export function renderGradeReleaseEmail({
  studentName,
  className,
  period,
  portalUrl,
}: {
  studentName: string;
  className: string;
  period: Period;
  portalUrl: string;
}) {
  const term = PERIOD_LABEL[period];
  const subject = `Your ${term} grade is posted: ${className}`;
  const body = [
    `Hello ${firstNameOf(studentName)},`,
    "",
    `Your teacher has posted your ${term} grade for ${className}.`,
    "",
    `To see it, open ${portalUrl.replace(/\/$/, "")}/student and enter your student code.`,
    "",
    "This is an automated message from GAINS. Please don't reply to this email.",
  ].join("\n");
  return { subject, body };
}

export function smtpConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 is implicit TLS; 587 upgrades with STARTTLS (Gmail's default).
      secure: port === 465,
      requireTLS: process.env.SMTP_STARTTLS !== "0" && port !== 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
        : undefined,
      pool: true,
      maxConnections: 3,
    });
  }
  return transporter;
}

export type DeliveryResult = { status: "sent" | "logged" | "failed"; error?: string };

export async function deliver(recipient: string, subject: string, body: string): Promise<DeliveryResult> {
  if (!smtpConfigured()) {
    console.log(`\n[email] To: ${recipient}\n[email] Subject: ${subject}\n${body}\n`);
    return { status: "logged" };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipient,
      subject,
      text: body,
    });
    return { status: "sent" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] FAILED to ${recipient}: ${error}`);
    return { status: "failed", error };
  }
}
