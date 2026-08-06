import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-chalk px-6 py-24 text-paper">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-brass">
        Roll Call
      </p>
      <h1 className="mt-4 max-w-lg text-center font-display text-5xl font-semibold text-paper">
        Attendance, kept like a ledger.
      </h1>
      <p className="mt-4 max-w-md text-center text-rule">
        Scan a roster, or hand students a code to check themselves in.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/login"
          className="rounded-sm bg-brass px-6 py-3 font-medium text-chalk transition hover:brightness-110"
        >
          Teacher sign in
        </Link>
        <Link
          href="/checkin"
          className="rounded-sm border border-rule px-6 py-3 font-medium text-paper transition hover:bg-white/5"
        >
          Student check-in
        </Link>
      </div>
    </main>
  );
}
