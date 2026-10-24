// Runs automatically before `next build` (npm "prebuild"), so a Vercel deploy
// fails if code ships alongside a migration nobody has confirmed running.
//
// Migrations are applied by hand in the Supabase SQL Editor. After running
// one, bump supabase/last-applied-migration.txt to its number and commit.
//
// When Supabase credentials are available (Vercel's build env, or
// .env.local locally) it also checks the live database for tables/columns
// from *older* migrations that were skipped -- the marker file can't see
// those (0013/0015/0023/0033 went unapplied for weeks that way).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  describeMissingSchema,
  expectedSchemaFromMigrations,
  findMissingSchema,
} from "../lib/schema-check.mjs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const marker = new URL("../supabase/last-applied-migration.txt", import.meta.url);

// Prefixes that were already duplicated before this check existed.
const KNOWN_DUPLICATE_PREFIXES = new Set(["0010"]);

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const prefixOf = (f) => f.split("_")[0];
const problems = [];

const seen = new Map();
for (const f of files) {
  const p = prefixOf(f);
  if (seen.has(p) && !KNOWN_DUPLICATE_PREFIXES.has(p)) {
    problems.push(`Duplicate migration prefix ${p}: ${seen.get(p)} and ${f}`);
  }
  seen.set(p, f);
}

const lastApplied = readFileSync(marker, "utf8").trim();
const pending = files.filter((f) => prefixOf(f) > lastApplied);
if (pending.length > 0) {
  problems.push(
    `Migration(s) newer than supabase/last-applied-migration.txt (${lastApplied}):\n` +
      pending.map((f) => `    ${f}`).join("\n") +
      `\n  Run them in the Supabase SQL Editor, then set the file to ${prefixOf(pending[pending.length - 1])}.`,
  );
}

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.warn("Migration check: no Supabase credentials, skipping the live-database check.");
} else {
  const migrations = files.map((name) => ({ name, sql: readFileSync(new URL(name, dir), "utf8") }));
  const { schema, origin } = expectedSchemaFromMigrations(migrations);
  try {
    const missing = await findMissingSchema(schema, origin, { url, serviceKey });
    if (missing.length > 0) {
      problems.push(
        "Live database is missing schema from these migrations:\n" +
          describeMissingSchema(missing).map((line) => `    ${line}`).join("\n") +
          "\n  Run them in the Supabase SQL Editor (they're safe to re-run).",
      );
    }
  } catch (err) {
    // A network/auth hiccup shouldn't block a deploy; only a confirmed
    // missing table/column does.
    console.warn(`Migration check: live-database check skipped (${err.message}).`);
  }
}

if (problems.length > 0) {
  console.error("Migration check failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Migration check OK (last applied: ${lastApplied}).`);
