// Draft, releases, scheduling and rollback. Everything here takes a D1 database handle,
// so the same code runs in the Worker and in tests against SQLite.

import { safeUrl } from "./text.js";
import { isLocal, nyToUtc } from "./time.js";

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const BLOCK_FIELDS = {
  site_title: ["Site title", 120],
  site_description: ["Site description", 300],
  share_image: ["Share image", 120],
  logo_small: ["Small logo", 120],
  logo_large: ["Large logo", 120],
  ticker: ["Ticker", 600],
  hero_line1: ["Headline, first line", 60],
  hero_line2: ["Headline, second line", 60],
  hero_tagline: ["Tagline", 600],
  who_intro: ["Who We Are intro", 1000],
  mission_body: ["Mission statement", 6000],
  mission_callout: ["Mission callout", 1500],
  mission_photo: ["Mission photo", 120],
  footer_heading: ["Footer heading", 60],
  footer_text: ["Footer text", 600],
  contact_email: ["Contact email", 200],
  contact_button: ["Contact button", 40],
  partners_intro: ["Partners page intro", 1000],
};

const PANELS = ["blue", "red", "green", "white", "black", "cream"];
const MEDIA_KEY = /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/;

function str(v, max, label, required = false) {
  const s = String(v ?? "").replace(/\r\n/g, "\n").trim();
  if (required && !s) throw new HttpError(400, `${label} is required.`);
  if (s.length > max) throw new HttpError(400, `${label} is too long (${max} characters at most).`);
  return s;
}
function url(v, label) {
  const s = str(v, 600, label);
  if (!s) return "";
  const u = safeUrl(s);
  if (!u || u.startsWith("/")) throw new HttpError(400, `${label} must start with https:// (or mailto:).`);
  return u;
}
function media(v, label) {
  const s = String(v ?? "").trim();
  if (s && !MEDIA_KEY.test(s)) throw new HttpError(400, `${label}: choose an image from the library.`);
  return s;
}

// Returns a cleaned copy with only known fields. Anything else is dropped.
export function validate(kind, d) {
  d = d && typeof d === "object" ? d : {};
  if (kind === "event") {
    const start = str(d.start, 16, "Start", true);
    if (!isLocal(start)) throw new HttpError(400, "Start needs a date and a time.");
    nyToUtc(start);
    const end = str(d.end, 16, "End");
    if (end) {
      if (!isLocal(end)) throw new HttpError(400, "End needs a date and a time.");
      if (nyToUtc(end) < nyToUtc(start)) throw new HttpError(400, "End is before the start.");
    }
    const stops = (Array.isArray(d.stops) ? d.stops : []).slice(0, 12).map((s) => ({
      time: str(s?.time, 40, "Stop time"), place: str(s?.place, 120, "Stop place"),
      address: str(s?.address, 200, "Stop address"), note: str(s?.note, 300, "Stop note"),
    })).filter((s) => s.time || s.place);
    const press = (Array.isArray(d.press) ? d.press : []).slice(0, 12).map((p) => ({
      outlet: str(p?.outlet, 40, "Press outlet"), url: url(p?.url, "Press link"),
    })).filter((p) => p.outlet && p.url);
    const cta_url = url(d.cta_url, "Button link");
    return {
      title: str(d.title, 140, "Title", true), accent: str(d.accent, 140, "Second title line"),
      badge: str(d.badge, 40, "Badge"), subtitle: str(d.subtitle, 200, "Subtitle"),
      start, end, time_note: str(d.time_note, 200, "Time note"),
      venue: str(d.venue, 160, "Venue"), address: str(d.address, 240, "Address"),
      description: str(d.description, 4000, "Description"), blurb: str(d.blurb, 400, "Short summary"),
      stops, cta_label: str(d.cta_label, 40, "Button label"), cta_url,
      cta_note: str(d.cta_note, 200, "Note under the button"),
      link_label: str(d.link_label, 80, "More-info label"), link_url: url(d.link_url, "More-info link"),
      hosted_by: str(d.hosted_by, 160, "Hosted by"),
      poster: media(d.poster, "Poster"), poster_back: media(d.poster_back, "Poster back"), press,
    };
  }
  if (kind === "member") {
    return {
      name: str(d.name, 120, "Name", true), logo: media(d.logo, "Logo"),
      fallback: str(d.fallback, 120, "Text shown without a logo"), link: url(d.link, "Website"),
      dark: !!d.dark,
    };
  }
  if (kind === "partner") {
    return {
      name: str(d.name, 120, "Name", true), description: str(d.description, 800, "Description"),
      url: url(d.url, "Website"), logo: media(d.logo, "Logo"),
      panel: PANELS.includes(d.panel) ? d.panel : "white",
    };
  }
  if (kind === "block") {
    const out = {};
    for (const [k, [label, max]] of Object.entries(BLOCK_FIELDS)) {
      out[k] = /^(share_image|logo_small|logo_large|mission_photo)$/.test(k) ? media(d[k], label) : str(d[k], max, label);
    }
    if (out.contact_email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(out.contact_email)) {
      throw new HttpError(400, "Contact email does not look like an email address.");
    }
    return out;
  }
  throw new HttpError(400, "Unknown kind of item.");
}

const uid = () => crypto.randomUUID();
export const newToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function getSettings(db) {
  let s = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
  if (!s) {
    await db.prepare("INSERT OR IGNORE INTO settings (id, draft_rev, preview_token) VALUES (1, 0, ?)").bind(newToken()).run();
    s = await db.prepare("SELECT * FROM settings WHERE id = 1").first();
  }
  return s;
}

const audit = (db, now, email, action, target, detail) =>
  db.prepare("INSERT INTO audit (at, email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(now, email, action, target ?? null, detail ?? null);
const bump = (db) => db.prepare("UPDATE settings SET draft_rev = draft_rev + 1 WHERE id = 1");

// ---- Draft -> document ------------------------------------------------------------------

export async function loadDraft(db) {
  const [items, mediaRows] = await Promise.all([
    db.prepare("SELECT * FROM items ORDER BY kind, position, id").all(),
    db.prepare("SELECT key, alt FROM media ORDER BY key").all(),
  ]);
  return buildDoc(items.results, mediaRows.results);
}

export function buildDoc(rows, mediaRows) {
  const doc = { blocks: {}, events: [], members: [], partners: [], media: {} };
  const used = new Set();
  const note = (k) => k && used.add(k);
  for (const r of rows) {
    const data = JSON.parse(r.data);
    const meta = { id: r.id, visible: !!r.visible, updated_by: r.updated_by, updated_at: r.updated_at };
    if (r.kind === "block") {
      doc.blocks = data;
      doc.blocks_meta = { updated_by: r.updated_by, updated_at: r.updated_at };
      ["share_image", "logo_small", "logo_large", "mission_photo"].forEach((k) => note(data[k]));
    } else {
      doc[r.kind + "s"].push({ ...meta, ...data });
      note(data.poster); note(data.poster_back); note(data.logo);
    }
  }
  for (const m of mediaRows) if (used.has(m.key) && m.alt) doc.media[m.key] = { alt: m.alt };
  return doc;
}

// What decides whether two documents are "the same site": content only, not who touched it.
export function fingerprint(doc) {
  const strip = ({ updated_by, updated_at, ...rest }) => rest;
  return JSON.stringify({
    blocks: doc.blocks || {},
    events: (doc.events || []).map(strip).sort((a, b) => a.id.localeCompare(b.id)),
    members: (doc.members || []).map(strip),
    partners: (doc.partners || []).map(strip),
    media: doc.media || {},
  });
}

const label = (kind, it) => (kind === "event" ? [it.title, it.accent].filter(Boolean).join(" ") : it.name) || "(untitled)";

// Human-readable list of what publishing would change.
export function diffDocs(draft, live) {
  const out = [];
  live = live || { blocks: {}, events: [], members: [], partners: [], media: {} };
  for (const kind of ["event", "member", "partner"]) {
    const a = new Map((live[kind + "s"] || []).map((x) => [x.id, x]));
    const b = new Map((draft[kind + "s"] || []).map((x) => [x.id, x]));
    const core = ({ updated_by, updated_at, ...rest }) => JSON.stringify(rest);
    for (const [id, it] of b) {
      const was = a.get(id);
      if (!was) out.push({ kind, id, change: "added", name: label(kind, it), by: it.updated_by, hidden: !it.visible });
      else if (core(was) !== core(it)) {
        const change = was.visible && !it.visible ? "hidden" : !was.visible && it.visible ? "shown" : "edited";
        out.push({ kind, id, change, name: label(kind, it), by: it.updated_by });
      }
    }
    for (const [id, it] of a) if (!b.has(id)) out.push({ kind, id, change: "removed", name: label(kind, it) });
    if (kind !== "event") {
      const common = (list, other) => list.filter((x) => other.has(x.id)).map((x) => x.id).join();
      if (common(live[kind + "s"] || [], b) !== common(draft[kind + "s"] || [], a)) {
        out.push({ kind, change: "reordered", name: kind === "member" ? "Member order" : "Partner order" });
      }
    }
  }
  for (const [k, [name]] of Object.entries(BLOCK_FIELDS)) {
    if ((draft.blocks?.[k] || "") !== (live.blocks?.[k] || "")) {
      out.push({ kind: "block", id: k, change: "edited", name, by: draft.blocks_meta?.updated_by });
    }
  }
  const keys = new Set([...Object.keys(draft.media || {}), ...Object.keys(live.media || {})]);
  let alts = 0;
  for (const k of keys) if ((draft.media?.[k]?.alt || "") !== (live.media?.[k]?.alt || "")) alts++;
  if (alts) out.push({ kind: "media", change: "edited", name: `Image descriptions (${alts})` });
  return out;
}

// ---- Editing the draft -----------------------------------------------------------------

export async function saveItem(db, { id, kind, data, visible = true, rev, force }, email, now = Date.now()) {
  const clean = validate(kind, data);
  const json = JSON.stringify(clean);
  if (kind === "block") id = "blocks";
  const existing = id ? await db.prepare("SELECT kind, rev, updated_by, updated_at FROM items WHERE id = ?").bind(id).first() : null;

  if (!existing) {
    const newId = kind === "block" ? "blocks" : uid();
    const pos = await db.prepare("SELECT COALESCE(MAX(position), 0) + 10 AS p FROM items WHERE kind = ?").bind(kind).first();
    await db.batch([
      db.prepare("INSERT INTO items (id, kind, position, visible, data, rev, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?)")
        .bind(newId, kind, pos.p, visible ? 1 : 0, json, now, email),
      bump(db), audit(db, now, email, "item.create", `${kind}:${newId}`, label(kind, clean)),
    ]);
    return { id: newId, rev: 1 };
  }
  if (existing.kind !== kind) throw new HttpError(400, "That item is a different kind.");
  if (!force && Number(rev) !== existing.rev) {
    throw new HttpError(409, `This was changed by ${existing.updated_by} while you were editing.`, {
      conflict: { by: existing.updated_by, at: existing.updated_at, rev: existing.rev },
    });
  }
  const res = await db.batch([
    db.prepare("UPDATE items SET data = ?, visible = ?, rev = rev + 1, updated_at = ?, updated_by = ? WHERE id = ? AND rev = ?")
      .bind(json, visible ? 1 : 0, now, email, id, existing.rev),
    bump(db), audit(db, now, email, "item.update", `${kind}:${id}`, label(kind, clean)),
  ]);
  if (!res[0].meta.changes) throw new HttpError(409, "This was changed by someone else just now. Reload and try again.");
  return { id, rev: existing.rev + 1 };
}

export async function deleteItem(db, id, email, now = Date.now()) {
  const row = await db.prepare("SELECT kind, data FROM items WHERE id = ?").bind(id).first();
  if (!row || row.kind === "block") throw new HttpError(404, "That item no longer exists.");
  await db.batch([
    db.prepare("DELETE FROM items WHERE id = ?").bind(id),
    bump(db), audit(db, now, email, "item.delete", `${row.kind}:${id}`, label(row.kind, JSON.parse(row.data))),
  ]);
}

export async function reorder(db, kind, ids, email, now = Date.now()) {
  if (!["member", "partner"].includes(kind) || !Array.isArray(ids)) throw new HttpError(400, "Nothing to reorder.");
  const stmts = ids.slice(0, 500).map((id, i) =>
    db.prepare("UPDATE items SET position = ? WHERE id = ? AND kind = ?").bind((i + 1) * 10, String(id), kind));
  await db.batch([...stmts, bump(db), audit(db, now, email, "item.reorder", kind, null)]);
}

// ---- Releases --------------------------------------------------------------------------

async function liveSnapshot(db, settings) {
  if (!settings.current_release_id) return null;
  const r = await db.prepare("SELECT snapshot FROM releases WHERE id = ?").bind(settings.current_release_id).first();
  return r ? JSON.parse(r.snapshot) : null;
}

export async function getLiveDoc(db) {
  const r = await db.prepare(
    "SELECT r.snapshot FROM settings s JOIN releases r ON r.id = s.current_release_id WHERE s.id = 1").first();
  return r ? JSON.parse(r.snapshot) : null;
}

function checkRev(settings, draftRev) {
  if (draftRev != null && Number(draftRev) !== settings.draft_rev) {
    throw new HttpError(409, "The draft changed since you opened this screen. Review the changes again before publishing.");
  }
}

export async function publish(db, { draft_rev, note }, email, now = Date.now()) {
  const settings = await getSettings(db);
  checkRev(settings, draft_rev);
  const doc = await loadDraft(db);
  const id = uid();
  const res = await db.batch([
    db.prepare(`INSERT INTO releases (id, snapshot, status, base_release_id, note, created_at, created_by, published_at)
                SELECT ?, ?, 'published', ?, ?, ?, ?, ? WHERE (SELECT draft_rev FROM settings WHERE id = 1) = ?`)
      .bind(id, JSON.stringify(doc), settings.current_release_id, str(note, 300, "Note") || null, now, email, now, settings.draft_rev),
    db.prepare("UPDATE releases SET status = 'superseded' WHERE status = 'scheduled' AND EXISTS (SELECT 1 FROM releases WHERE id = ?)").bind(id),
    db.prepare("UPDATE settings SET current_release_id = ? WHERE id = 1 AND EXISTS (SELECT 1 FROM releases WHERE id = ?)").bind(id, id),
    audit(db, now, email, "publish", id, note || null),
  ]);
  if (!res[2].meta.changes) throw new HttpError(409, "The draft changed while publishing. Review the changes and publish again.");
  return { id };
}

export async function schedule(db, { draft_rev, note, publish_at }, email, now = Date.now()) {
  if (!isLocal(publish_at)) throw new HttpError(400, "Choose a date and time to publish.");
  const at = nyToUtc(publish_at);
  if (at < now + 60e3) throw new HttpError(400, "Choose a time at least a couple of minutes from now, or publish now.");
  const settings = await getSettings(db);
  checkRev(settings, draft_rev);
  const doc = await loadDraft(db);
  const id = uid();
  const res = await db.batch([
    db.prepare("UPDATE releases SET status = 'cancelled' WHERE status = 'scheduled' AND (SELECT draft_rev FROM settings WHERE id = 1) = ?").bind(settings.draft_rev),
    db.prepare(`INSERT INTO releases (id, snapshot, status, publish_at, base_release_id, note, created_at, created_by)
                SELECT ?, ?, 'scheduled', ?, ?, ?, ?, ? WHERE (SELECT draft_rev FROM settings WHERE id = 1) = ?`)
      .bind(id, JSON.stringify(doc), at, settings.current_release_id, str(note, 300, "Note") || null, now, email, settings.draft_rev),
    audit(db, now, email, "schedule", id, publish_at),
  ]);
  if (!res[1].meta.changes) throw new HttpError(409, "The draft changed while scheduling. Review the changes and schedule again.");
  return { id, publish_at: at };
}

export async function cancelSchedule(db, email, now = Date.now()) {
  await db.batch([
    db.prepare("UPDATE releases SET status = 'cancelled' WHERE status = 'scheduled'"),
    audit(db, now, email, "schedule.cancel", null, null),
  ]);
}

// Called every minute by cron. Safe to run twice: each step only matches a still-scheduled release.
export async function promoteDue(db, now = Date.now()) {
  const due = await db.prepare("SELECT id FROM releases WHERE status = 'scheduled' AND publish_at <= ? ORDER BY publish_at").bind(now).all();
  const out = [];
  for (const { id } of due.results) {
    const res = await db.batch([
      db.prepare(`UPDATE releases SET status = 'published', published_at = ?
                  WHERE id = ? AND status = 'scheduled'
                    AND base_release_id IS (SELECT current_release_id FROM settings WHERE id = 1)`).bind(now, id),
      db.prepare(`UPDATE settings SET current_release_id = ?
                  WHERE id = 1 AND EXISTS (SELECT 1 FROM releases WHERE id = ? AND status = 'published' AND published_at = ?)`).bind(id, id, now),
      db.prepare("UPDATE releases SET status = 'superseded' WHERE id = ? AND status = 'scheduled'").bind(id),
    ]);
    const promoted = !!res[0].meta.changes;
    await audit(db, now, "schedule", promoted ? "schedule.fire" : "schedule.superseded", id, null).run();
    out.push({ id, promoted });
  }
  return out;
}

export async function rollback(db, releaseId, email, now = Date.now()) {
  const target = await db.prepare("SELECT id, snapshot, status FROM releases WHERE id = ?").bind(releaseId).first();
  if (!target || target.status !== "published") throw new HttpError(404, "That version is not in the history.");
  const settings = await getSettings(db);
  if (settings.current_release_id === releaseId) throw new HttpError(400, "That version is already live.");
  const id = uid();
  await db.batch([
    db.prepare(`INSERT INTO releases (id, snapshot, status, base_release_id, rolled_back_from, created_at, created_by, published_at)
                VALUES (?, ?, 'published', ?, ?, ?, ?, ?)`).bind(id, target.snapshot, settings.current_release_id, releaseId, now, email, now),
    db.prepare("UPDATE releases SET status = 'superseded' WHERE status = 'scheduled'"),
    db.prepare("UPDATE settings SET current_release_id = ? WHERE id = 1").bind(id),
    audit(db, now, email, "rollback", id, releaseId),
  ]);
  return { id };
}

// Throws away unpublished edits: the draft becomes a copy of what is live.
export async function resetDraft(db, email, now = Date.now()) {
  const settings = await getSettings(db);
  const doc = await liveSnapshot(db, settings);
  if (!doc) throw new HttpError(400, "Nothing has been published yet.");
  const rev = Math.floor(now / 1000);
  const ins = (id, kind, pos, visible, data) =>
    db.prepare("INSERT INTO items (id, kind, position, visible, data, rev, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, kind, pos, visible ? 1 : 0, JSON.stringify(data), rev, now, email);
  const stmts = [db.prepare("DELETE FROM items")];
  stmts.push(ins("blocks", "block", 0, true, doc.blocks || {}));
  for (const kind of ["event", "member", "partner"]) {
    (doc[kind + "s"] || []).forEach(({ id, visible, updated_by, updated_at, ...data }, i) =>
      stmts.push(ins(id, kind, (i + 1) * 10, visible, data)));
  }
  for (const [key, m] of Object.entries(doc.media || {})) {
    stmts.push(db.prepare("UPDATE media SET alt = ? WHERE key = ?").bind(m.alt || "", key));
  }
  stmts.push(bump(db), audit(db, now, email, "draft.reset", settings.current_release_id, null));
  await db.batch(stmts);
}

export async function rotatePreviewToken(db, email, now = Date.now()) {
  const token = newToken();
  await db.batch([
    db.prepare("UPDATE settings SET preview_token = ? WHERE id = 1").bind(token),
    audit(db, now, email, "preview.rotate", null, null),
  ]);
  return token;
}

export async function listReleases(db, limit = 50) {
  const r = await db.prepare(
    `SELECT id, status, publish_at, base_release_id, rolled_back_from, note, created_at, created_by, published_at
     FROM releases ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
  return r.results;
}

// Everything the editor needs on load.
export async function getState(db) {
  const settings = await getSettings(db);
  const [items, mediaAll, scheduled, live] = await Promise.all([
    db.prepare("SELECT * FROM items ORDER BY kind, position, id").all(),
    db.prepare("SELECT * FROM media ORDER BY created_at DESC").all(),
    db.prepare("SELECT id, publish_at, created_by, created_at, note, snapshot FROM releases WHERE status = 'scheduled' ORDER BY publish_at LIMIT 1").first(),
    settings.current_release_id
      ? db.prepare("SELECT id, snapshot, published_at, created_by, rolled_back_from FROM releases WHERE id = ?").bind(settings.current_release_id).first()
      : null,
  ]);
  const draft = buildDoc(items.results, mediaAll.results);
  const liveDoc = live ? JSON.parse(live.snapshot) : null;
  const revs = Object.fromEntries(items.results.map((r) => [r.id, r.rev]));
  const changes = diffDocs(draft, liveDoc);
  let sched = null;
  if (scheduled) {
    const sdoc = JSON.parse(scheduled.snapshot);
    sched = {
      id: scheduled.id, publish_at: scheduled.publish_at, by: scheduled.created_by, note: scheduled.note,
      changes: diffDocs(sdoc, liveDoc),
      draft_ahead: fingerprint(sdoc) !== fingerprint(draft),
    };
  }
  return {
    draft, revs, media: mediaAll.results, draft_rev: settings.draft_rev, preview_token: settings.preview_token,
    live: live ? { id: live.id, published_at: live.published_at, by: live.created_by, rolled_back: !!live.rolled_back_from } : null,
    changes, scheduled: sched,
  };
}
