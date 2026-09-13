import Button from "@/app/_components/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-chalk px-6 py-24 text-paper">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-brass">
        GAINS
      </p>
      <h1 className="mt-4 max-w-lg text-center font-display text-5xl font-semibold text-paper">
        Attendance, kept like a ledger.
      </h1>
      <p className="mt-4 max-w-md text-center text-rule">
        Scan a roster, or hand students a code to check themselves in.
      </p>
      <div className="mt-10 flex gap-4">
        <Button href="/login" className="px-6 py-3">
          Teacher sign in
        </Button>
        <Button href="/checkin" variant="neutral" className="px-6 py-3">
          Student check-in
        </Button>
      </div>
    </main>
  );
}
