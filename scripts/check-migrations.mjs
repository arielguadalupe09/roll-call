// Runs automatically before `next build` (npm "prebuild"), so a Vercel deploy
// fails if code ships alongside a migration nobody has confirmed running.
//
// Migrations are applied by hand in the Supabase SQL Editor. After running
// one, bump supabase/last-applied-migration.txt to its number and commit.
import { readdirSync, readFileSync } from "node:fs";

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

if (problems.length > 0) {
  console.error("Migration check failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Migration check OK (last applied: ${lastApplied}).`);
