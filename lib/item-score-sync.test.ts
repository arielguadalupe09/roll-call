import { describe, expect, it } from "vitest";
import { correctCount, papersOutOfSync, scoresFromPapers, syncItemScoresToGradebook } from "./item-score-sync";

// Minimal stand-in for the Supabase client: records every write.
function fakeClient(fail: string | null = null) {
  const calls: { table: string; op: string; payload: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        update(payload: unknown) {
          calls.push({ table, op: "update", payload });
          return { eq: async () => ({ error: null }) };
        },
        async upsert(payload: unknown) {
          calls.push({ table, op: "upsert", payload });
          return { error: fail ? { message: fail } : null };
        },
      };
    },
  };
  return { client: client as never, calls };
}

describe("item analysis -> exam scores", () => {
  it("scores a paper as its number of correct items", () => {
    expect(correctCount(50, [])).toBe(50);
    expect(correctCount(50, [3, 7, 7, 12])).toBe(47);
    expect(correctCount(10, [0, 11, 2])).toBe(9); // out-of-range items ignored
    expect(scoresFromPapers(20, [{ student_id: "a", wrong_items: [1, 2] }])).toEqual({ a: 18 });
  });

  it("finds papers whose recorded score is missing or different", () => {
    const papers = [
      { student_id: "a", wrong_items: [1] },
      { student_id: "b", wrong_items: [] },
      { student_id: "c", wrong_items: [1, 2] },
    ];
    expect(papersOutOfSync(10, papers, { a: 9, b: 8 }).map((p) => p.student_id)).toEqual(["b", "c"]);
  });

  it("writes correct counts and aligns the exam's max score to the item count", async () => {
    const { client, calls } = fakeClient();
    const r = await syncItemScoresToGradebook(
      client,
      { id: "exam-1", max_score: 100 },
      50,
      [{ student_id: "a", wrong_items: [4, 5] }],
      ["b"],
    );
    expect(r).toEqual({ error: null, maxScore: 50, scores: { a: 48 } });
    expect(calls[0]).toEqual({ table: "major_exams", op: "update", payload: { max_score: 50 } });
    const rows = calls[1].payload as { student_id: string; score: number | null }[];
    expect(rows.map((x) => [x.student_id, x.score])).toEqual([
      ["a", 48],
      ["b", null],
    ]);
  });

  it("leaves the max score alone when it already matches", async () => {
    const { client, calls } = fakeClient();
    await syncItemScoresToGradebook(client, { id: "e", max_score: 50 }, 50, [{ student_id: "a", wrong_items: [] }]);
    expect(calls.map((c) => c.op)).toEqual(["upsert"]);
  });

  it("reports a failed write", async () => {
    const { client } = fakeClient("denied");
    const r = await syncItemScoresToGradebook(client, { id: "e", max_score: 50 }, 50, [
      { student_id: "a", wrong_items: [] },
    ]);
    expect(r.error).toBe("denied");
    expect(r.scores).toEqual({});
  });
});
