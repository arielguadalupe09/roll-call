import type { Student } from "@/lib/types";
import Button from "@/app/_components/button";
import { Input } from "@/app/_components/input";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/app/_components/table";

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
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Student</TableHeaderCell>
          <TableHeaderCell>Score / {maxScore}</TableHeaderCell>
          <TableHeaderCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {students.map((s) => {
          const row = rows[s.id] ?? { score: "", saving: false };
          return (
            <TableRow key={s.id} striped>
              <TableCell>{s.name}</TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  max={maxScore}
                  value={row.score}
                  onChange={(e) => onScoreChange(s.id, e.target.value)}
                  className="w-20 font-mono"
                />
              </TableCell>
              <TableCell>
                <Button size="sm" onClick={() => onSave(s.id)} disabled={row.saving}>
                  {row.saving ? "Saving..." : "Save"}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
        {students.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="py-4 text-muted">
              No students in this class yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
