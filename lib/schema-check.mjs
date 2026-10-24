// Catches migrations that were skipped in the SQL Editor even though a later
// one was run -- something supabase/last-applied-migration.txt can't see,
// since it only records the newest number. Shared by the prebuild guard
// (scripts/check-migrations.mjs, plain Node) and the weekly data audit
// (app/api/cron/data-audit/route.ts), hence plain JS with JSDoc types.
//
// Only tables and columns are checked (what PostgREST can see); constraint
// and policy changes in a migration aren't verified.

/**
 * @typedef {{ tables: Map<string, Set<string>> }} ExpectedSchema
 *   table name -> columns added via `alter table ... add column` that should
 *   still exist. Columns from `create table (...)` bodies aren't tracked --
 *   the table existing is enough for those.
 * @typedef {{ table: string, column: string | null, migration: string }} MissingItem
 */

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const IDENT = String.raw`(?:public\.)?"?(\w+)"?`;

/**
 * Replays the migrations' table/column adds and drops, in file order.
 * @param {{ name: string, sql: string }[]} migrations sorted by file name
 * @returns {{ schema: ExpectedSchema, origin: Map<string, string> }}
 *   origin maps "table" / "table.column" to the migration that added it.
 */
export function expectedSchemaFromMigrations(migrations) {
  /** @type {Map<string, Set<string>>} */
  const tables = new Map();
  /** @type {Map<string, string>} */
  const origin = new Map();

  for (const { name, sql } of migrations) {
    for (const raw of stripComments(sql).split(";")) {
      const stmt = raw.trim().replace(/\s+/g, " ");

      let m = stmt.match(new RegExp(`^create table (?:if not exists )?${IDENT}`, "i"));
      if (m) {
        const t = m[1].toLowerCase();
        if (!tables.has(t)) tables.set(t, new Set());
        if (!origin.has(t)) origin.set(t, name);
        continue;
      }

      m = stmt.match(new RegExp(`^drop table (?:if exists )?${IDENT}`, "i"));
      if (m) {
        tables.delete(m[1].toLowerCase());
        continue;
      }

      m = stmt.match(new RegExp(`^alter table (?:if exists )?(?:only )?${IDENT} (.*)$`, "i"));
      if (!m) continue;
      const t = m[1].toLowerCase();
      const rest = m[2];
      for (const add of rest.matchAll(/add column (?:if not exists )?"?(\w+)"?/gi)) {
        const c = add[1].toLowerCase();
        if (!tables.has(t)) tables.set(t, new Set());
        tables.get(t).add(c);
        origin.set(`${t}.${c}`, name);
      }
      for (const drop of rest.matchAll(/drop column (?:if exists )?"?(\w+)"?/gi)) {
        tables.get(t)?.delete(drop[1].toLowerCase());
      }
    }
  }

  return { schema: { tables }, origin };
}

/**
 * Asks PostgREST (service-role key) whether each expected table/column
 * exists. One request per table; only falls back to per-column requests
 * for a table whose combined select fails.
 * @param {ExpectedSchema} schema
 * @param {Map<string, string>} origin
 * @param {{ url: string, serviceKey: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<MissingItem[]>}
 */
export async function findMissingSchema(schema, origin, { url, serviceKey, fetchImpl = fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  /** @returns {Promise<{ ok: true } | { ok: false, missingTable: boolean, message: string }>} */
  async function probe(table, select) {
    const res = await fetchImpl(
      `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=0`,
      { headers },
    );
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    const message = String(body.message ?? res.status);
    // PGRST205: table not in schema cache; 42P01: undefined_table.
    const missingTable = body.code === "PGRST205" || body.code === "42P01";
    // Anything other than "doesn't exist" (auth, network, 5xx) is an
    // infrastructure problem, not a missing migration -- surface it as such.
    if (!missingTable && body.code !== "42703" && body.code !== "PGRST204") {
      throw new Error(`Schema probe of ${table} failed: ${message}`);
    }
    return { ok: false, missingTable, message };
  }

  /** @type {MissingItem[]} */
  const missing = [];
  for (const [table, columns] of schema.tables) {
    const cols = [...columns];
    const all = await probe(table, cols.length > 0 ? cols.join(",") : "*");
    if (all.ok) continue;
    if (all.missingTable) {
      missing.push({ table, column: null, migration: origin.get(table) ?? "?" });
      continue;
    }
    for (const column of cols) {
      const one = await probe(table, column);
      if (!one.ok) missing.push({ table, column, migration: origin.get(`${table}.${column}`) ?? "?" });
    }
  }
  return missing;
}

/** @param {MissingItem[]} missing */
export function describeMissingSchema(missing) {
  /** @type {Map<string, string[]>} */
  const byMigration = new Map();
  for (const item of missing) {
    const list = byMigration.get(item.migration) ?? [];
    list.push(item.column ? `${item.table}.${item.column}` : `table ${item.table}`);
    byMigration.set(item.migration, list);
  }
  return [...byMigration]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([migration, items]) => `${migration} not applied (missing ${items.join(", ")})`);
}
