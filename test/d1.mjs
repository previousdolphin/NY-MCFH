// A minimal stand-in for Cloudflare D1 on top of node:sqlite, enough for content.js.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function makeDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  const stmt = (text, args = []) => ({
    bind: (...a) => stmt(text, a),
    _run() {
      const s = sql.prepare(text);
      if (/^\s*(SELECT|WITH)/i.test(text)) return { results: s.all(...args), meta: { changes: 0 } };
      const r = s.run(...args);
      return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async first() { return this._run().results[0] ?? null; },
    async all() { return this._run(); },
    async run() { return this._run(); },
  });
  return {
    prepare: (text) => stmt(text),
    async batch(stmts) {
      sql.exec("BEGIN");
      try { const out = stmts.map((s) => s._run()); sql.exec("COMMIT"); return out; }
      catch (e) { sql.exec("ROLLBACK"); throw e; }
    },
  };
}
