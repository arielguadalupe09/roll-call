import type { Student } from "@/lib/types";

export type ScoreRow = { score: string; saving: boolean };

export default function ScoreEntryTable({
  students,
  rows,
  maxScore,
  onScoreChange,
  onSave,
}: {
  students: Student[];
  rows: Record<string, ScoreRow>;
  maxScore: number;
  onScoreChange: (studentId: string, value: string) => void;
  onSave: (studentId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-sm border border-rule">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule bg-paper font-mono text-xs uppercase tracking-wide text-ink/60">
            <th className="py-2 px-3">Student</th>
            <th className="py-2 px-3">Score / {maxScore}</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const row = rows[s.id] ?? { score: "", saving: false };
            return (
              <tr key={s.id} className="border-b border-rule/50 bg-white">
                <td className="py-2 px-3 text-ink">{s.name}</td>
                <td className="py-2 px-3">
                  <input
                    type="number"
                    min={0}
                    max={maxScore}
                    value={row.score}
                    onChange={(e) => onScoreChange(s.id, e.target.value)}
                    className="w-20 rounded-sm border border-rule bg-white/60 px-2 py-1 font-mono text-sm text-ink"
                  />
                </td>
                <td className="py-2 px-3">
                  <button
                    onClick={() => onSave(s.id)}
                    disabled={row.saving}
                    className="rounded-sm bg-brass px-3 py-1 text-sm font-medium text-chalk transition hover:brightness-110 disabled:opacity-60"
                  >
                    {row.saving ? "Saving..." : "Save"}
                  </button>
                </td>
              </tr>
            );
          })}
          {students.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 px-3 text-ink/60">
                No students in this class yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
