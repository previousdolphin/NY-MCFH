// Creates the first draft and release from seed/content.mjs and uploads seed/images to R2.
//   node scripts/seed.mjs --local            local dev database and bucket
//   node scripts/seed.mjs --remote --yes     production (replaces the draft; run once)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as content from "../seed/content.mjs";
import { buildDoc, validate, newToken } from "../src/content.js";
import { sniff } from "../src/media.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const where = args.includes("--remote") ? "--remote" : "--local";
if (where === "--remote" && !args.includes("--yes")) {
  console.error("This replaces the draft in production. Re-run with --remote --yes if that is what you want.");
  process.exit(1);
}
const skipUpload = args.includes("--skip-upload");
const DB = "ny-mcfh-db", BUCKET = "ny-mcfh-r2-media", BY = "seed", NOW = Date.now();
const wr = (a) => execFileSync("wrangler", a, { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString();

// ---- images ----
const media = new Map(); // file name -> row
function image(file, alt = "") {
  if (!file) return "";
  if (!media.has(file)) {
    const path = join(root, "seed/images", file);
    const buf = readFileSync(path);
    const kind = sniff(new Uint8Array(buf.subarray(0, 16)));
    if (!kind) throw new Error(`Not an image: ${file}`);
    const key = createHash("sha256").update(buf).digest("hex") + "." + kind.ext;
    let width = null, height = null;
    try {
      const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path]).toString();
      width = +(/pixelWidth: (\d+)/.exec(out) || [])[1] || null;
      height = +(/pixelHeight: (\d+)/.exec(out) || [])[1] || null;
    } catch {}
    media.set(file, { key, mime: kind.mime, bytes: buf.length, width, height, alt, filename: file, path });
  }
  const row = media.get(file);
  if (alt && !row.alt) row.alt = alt;
  return row.key;
}

// ---- items ----
const rows = [];
const add = (id, kind, position, data) =>
  rows.push({ id, kind, position, visible: 1, data: JSON.stringify(validate(kind, data)), rev: 1, updated_at: NOW, updated_by: BY });

const blocks = { ...content.blocks };
blocks.logo_small = image(blocks.logo_small, "NY Metro Coalition for Higher Ed logo");
blocks.logo_large = image(blocks.logo_large, "NY Metro Coalition for Higher Ed logo");
blocks.mission_photo = image(blocks.mission_photo, "Coalition members at a rally");
add("blocks", "block", 0, blocks);
content.events.forEach(({ poster_alt, poster_back_alt, ...e }, i) =>
  add(`seed-event-${i + 1}`, "event", (i + 1) * 10, { ...e, poster: image(e.poster, poster_alt), poster_back: image(e.poster_back, poster_back_alt) }));
content.members.forEach((m, i) => add(`seed-member-${i + 1}`, "member", (i + 1) * 10, { ...m, logo: image(m.logo) }));
content.partners.forEach((p, i) => add(`seed-partner-${i + 1}`, "partner", (i + 1) * 10, { ...p, logo: image(p.logo) }));

const mediaRows = [...media.values()];
rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position || a.id.localeCompare(b.id));
const doc = buildDoc(rows, mediaRows);

// ---- upload ----
if (!skipUpload) {
  let n = 0;
  for (const m of mediaRows) {
    wr(["r2", "object", "put", `${BUCKET}/${m.key}`, "--file", m.path, "--content-type", m.mime,
      "--cache-control", "public, max-age=31536000, immutable", where]);
    process.stdout.write(`\ruploaded ${++n}/${mediaRows.length}`);
  }
  process.stdout.write("\n");
}

// ---- sql ----
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql = [
  "DELETE FROM items;",
  ...rows.map((r) => `INSERT INTO items (id, kind, position, visible, data, rev, updated_at, updated_by) VALUES (${[r.id, r.kind, r.position, r.visible, r.data, r.rev, r.updated_at, r.updated_by].map(q).join(", ")});`),
  ...mediaRows.map((m) => `INSERT OR REPLACE INTO media (key, mime, bytes, width, height, alt, filename, created_at, created_by) VALUES (${[m.key, m.mime, m.bytes, m.width, m.height, m.alt, m.filename, NOW, BY].map(q).join(", ")});`),
  `INSERT OR IGNORE INTO settings (id, draft_rev, preview_token) VALUES (1, 0, ${q(newToken())});`,
  `INSERT OR REPLACE INTO releases (id, snapshot, status, note, created_at, created_by, published_at) VALUES ('seed-1', ${q(JSON.stringify(doc))}, 'published', 'Imported from the original site', ${NOW}, ${q(BY)}, ${NOW});`,
  "UPDATE settings SET current_release_id = 'seed-1', draft_rev = draft_rev + 1 WHERE id = 1;",
];
mkdirSync(join(root, "seed/out"), { recursive: true });
const file = join(root, "seed/out/seed.sql");
writeFileSync(file, sql.join("\n") + "\n");
wr(["d1", "migrations", "apply", DB, where]);
wr(["d1", "execute", DB, where, "--file", file]);
console.log(`Seeded ${rows.length} items, ${mediaRows.length} images, release seed-1 (${where.slice(2)}).`);
