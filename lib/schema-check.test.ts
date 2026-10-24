import { describe, expect, it } from "vitest";
import {
  describeMissingSchema,
  expectedSchemaFromMigrations,
  findMissingSchema,
} from "./schema-check.mjs";

const migrations = [
  {
    name: "0001_init.sql",
    sql: `-- comment mentioning alter table ghosts add column boo
      create table if not exists classes (id uuid primary key, name text);
      create table students (id uuid);`,
  },
  {
    name: "0002_more.sql",
    sql: `alter table classes add column if not exists archived boolean;
      alter table grading_configs
        add column if not exists use_prelims boolean not null default false,
        add column prelim_end_date date;
      alter table classes add column shared boolean;`,
  },
  {
    name: "0003_cleanup.sql",
    sql: `alter table classes drop column if exists shared;
      drop table if exists students;`,
  },
];

describe("expectedSchemaFromMigrations", () => {
  it("replays adds and drops in order and ignores comments", () => {
    const { schema, origin } = expectedSchemaFromMigrations(migrations);
    expect([...schema.tables.keys()].sort()).toEqual(["classes", "grading_configs"]);
    expect([...schema.tables.get("classes")!]).toEqual(["archived"]);
    expect([...schema.tables.get("grading_configs")!]).toEqual(["use_prelims", "prelim_end_date"]);
    expect(origin.get("grading_configs.prelim_end_date")).toBe("0002_more.sql");
    expect(origin.get("classes")).toBe("0001_init.sql");
  });
});

describe("findMissingSchema", () => {
  const { schema, origin } = expectedSchemaFromMigrations(migrations);
  const json = (status: number, body: object) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("reports missing columns per column and missing tables whole", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const u = new URL(String(input));
      const table = u.pathname.split("/").pop();
      const select = u.searchParams.get("select")!;
      if (table === "classes") return json(404, { code: "PGRST205", message: "no table" });
      if (select.includes("prelim_end_date")) return json(400, { code: "42703", message: "no column" });
      return json(200, []);
    }) as typeof fetch;

    const missing = await findMissingSchema(schema, origin, { url: "https://x.supabase.co", serviceKey: "k", fetchImpl });
    expect(missing).toEqual([
      { table: "classes", column: null, migration: "0001_init.sql" },
      { table: "grading_configs", column: "prelim_end_date", migration: "0002_more.sql" },
    ]);
    expect(describeMissingSchema(missing)).toEqual([
      "0001_init.sql not applied (missing table classes)",
      "0002_more.sql not applied (missing grading_configs.prelim_end_date)",
    ]);
  });

  it("throws on auth or server errors instead of reporting a missing migration", async () => {
    const fetchImpl = (async () => json(401, { message: "Invalid API key" })) as typeof fetch;
    await expect(
      findMissingSchema(schema, origin, { url: "https://x.supabase.co", serviceKey: "bad", fetchImpl }),
    ).rejects.toThrow("Invalid API key");
  });
});
