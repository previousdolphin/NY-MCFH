import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "./d1.mjs";
import * as C from "../src/content.js";
import { nyToUtc } from "../src/time.js";

const ev = (over = {}) => ({ title: "Forum", start: "2026-11-16T18:30", end: "2026-11-16T20:30", ...over });
const T0 = nyToUtc("2026-11-11T12:00");

async function setup() {
  const db = makeDb();
  await C.getSettings(db);
  const a = await C.saveItem(db, { kind: "event", data: ev() }, "a@x.org", T0);
  return { db, a };
}

test("saving is a draft until published", async () => {
  const { db } = await setup();
  assert.equal(await C.getLiveDoc(db), null);
  const s = await C.getState(db);
  assert.equal(s.changes.length, 1);
  assert.equal(s.changes[0].change, "added");
  await C.publish(db, { draft_rev: s.draft_rev }, "a@x.org", T0);
  const live = await C.getLiveDoc(db);
  assert.equal(live.events[0].title, "Forum");
  assert.equal((await C.getState(db)).changes.length, 0);
});

test("a stale revision is refused, force overwrites", async () => {
  const { db, a } = await setup();
  await C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "B edit" }), rev: 1 }, "b@x.org", T0);
  await assert.rejects(
    C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "A edit" }), rev: 1 }, "a@x.org", T0),
    (e) => e.status === 409 && e.extra.conflict.by === "b@x.org");
  const r = await C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "A edit" }), rev: 1, force: true }, "a@x.org", T0);
  assert.equal(r.rev, 3);
});

test("publish is refused if the draft moved since the screen loaded", async () => {
  const { db } = await setup();
  const s = await C.getState(db);
  await C.saveItem(db, { kind: "event", data: ev({ title: "Late" }) }, "b@x.org", T0);
  await assert.rejects(C.publish(db, { draft_rev: s.draft_rev }, "a@x.org", T0), (e) => e.status === 409);
  assert.equal(await C.getLiveDoc(db), null);
});

test("rollback appends a new release and leaves the draft alone", async () => {
  const { db, a } = await setup();
  const first = await C.publish(db, {}, "a@x.org", T0);
  await C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "Bad" }), rev: 1 }, "a@x.org", T0 + 1);
  await C.publish(db, {}, "a@x.org", T0 + 2);
  assert.equal((await C.getLiveDoc(db)).events[0].title, "Bad");
  const rb = await C.rollback(db, first.id, "b@x.org", T0 + 3);
  assert.equal((await C.getLiveDoc(db)).events[0].title, "Forum");
  const rel = await C.listReleases(db);
  assert.equal(rel.length, 3);
  assert.equal(rel[0].id, rb.id);
  assert.equal(rel[0].rolled_back_from, first.id);
  const s = await C.getState(db);
  assert.equal(s.draft.events[0].title, "Bad");
  assert.equal(s.changes.length, 1, "draft still differs from live");
  await C.resetDraft(db, "b@x.org", T0 + 4);
  const s2 = await C.getState(db);
  assert.equal(s2.draft.events[0].title, "Forum");
  assert.equal(s2.changes.length, 0);
  await assert.rejects(C.rollback(db, rb.id, "b@x.org"), (e) => e.status === 400);
});

test("a schedule freezes the draft and fires once", async () => {
  const { db, a } = await setup();
  await C.publish(db, {}, "a@x.org", T0);
  await C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "Scheduled" }), rev: 1 }, "a@x.org", T0);
  await C.schedule(db, { publish_at: "2026-11-12T09:00" }, "a@x.org", T0);
  await C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "Later edit" }), rev: 2 }, "a@x.org", T0);
  let s = await C.getState(db);
  assert.equal(s.scheduled.draft_ahead, true);
  assert.equal(s.scheduled.changes[0].change, "edited");

  const at = nyToUtc("2026-11-12T09:00");
  assert.deepEqual(await C.promoteDue(db, at - 1), []);
  assert.equal((await C.getLiveDoc(db)).events[0].title, "Forum");
  const fired = await C.promoteDue(db, at);
  assert.equal(fired[0].promoted, true);
  assert.equal((await C.getLiveDoc(db)).events[0].title, "Scheduled");
  assert.deepEqual(await C.promoteDue(db, at + 60e3), [], "second run does nothing");
  s = await C.getState(db);
  assert.equal(s.scheduled, null);
  assert.equal(s.draft.events[0].title, "Later edit");
});

test("a manual publish supersedes a pending schedule", async () => {
  const { db, a } = await setup();
  await C.publish(db, {}, "a@x.org", T0);
  await C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "Old plan" }), rev: 1 }, "a@x.org", T0);
  await C.schedule(db, { publish_at: "2026-11-12T09:00" }, "a@x.org", T0);
  await C.saveItem(db, { id: a.id, kind: "event", data: ev({ title: "Newer" }), rev: 2 }, "a@x.org", T0);
  await C.publish(db, {}, "b@x.org", T0 + 5);
  assert.deepEqual(await C.promoteDue(db, nyToUtc("2026-11-12T09:01")), []);
  assert.equal((await C.getLiveDoc(db)).events[0].title, "Newer");
  assert.equal((await C.listReleases(db)).filter((r) => r.status === "superseded").length, 1);
});

test("a schedule whose base is no longer live is superseded at fire time", async () => {
  const { db } = await setup();
  await C.publish(db, {}, "a@x.org", T0);
  await C.schedule(db, { publish_at: "2026-11-12T09:00" }, "a@x.org", T0);
  // Simulate live moving without the supersede step having run.
  await db.prepare("UPDATE settings SET current_release_id = 'other'").run();
  const fired = await C.promoteDue(db, nyToUtc("2026-11-12T09:00"));
  assert.equal(fired[0].promoted, false);
  assert.equal((await db.prepare("SELECT current_release_id c FROM settings").first()).c, "other");
});

test("scheduling replaces an earlier schedule and rejects the past", async () => {
  const { db } = await setup();
  await C.schedule(db, { publish_at: "2026-11-12T09:00" }, "a@x.org", T0);
  await C.schedule(db, { publish_at: "2026-11-13T09:00" }, "a@x.org", T0);
  const rel = await C.listReleases(db);
  assert.equal(rel.filter((r) => r.status === "scheduled").length, 1);
  assert.equal(rel.filter((r) => r.status === "cancelled").length, 1);
  await assert.rejects(C.schedule(db, { publish_at: "2026-11-10T09:00" }, "a@x.org", T0), (e) => e.status === 400);
  await C.cancelSchedule(db, "a@x.org", T0);
  assert.equal((await C.getState(db)).scheduled, null);
});

test("validation: links, dates, unknown fields", async () => {
  assert.throws(() => C.validate("event", ev({ cta_url: "javascript:alert(1)" })), /https/);
  assert.throws(() => C.validate("event", ev({ start: "2026-02-30T10:00" })), /date/);
  assert.throws(() => C.validate("event", ev({ end: "2026-11-16T10:00" })), /before/);
  assert.throws(() => C.validate("event", ev({ start: "2027-03-14T02:30", end: "" })), /does not exist/);
  assert.throws(() => C.validate("event", ev({ poster: "../etc/passwd" })), /library/);
  const clean = C.validate("event", ev({ evil: "<script>", press: [{ outlet: "AP", url: "https://apnews.com/x" }, { outlet: "", url: "" }] }));
  assert.equal("evil" in clean, false);
  assert.equal(clean.press.length, 1);
  assert.throws(() => C.validate("block", { contact_email: "nope" }), /email/);
  assert.equal(C.validate("partner", { name: "X", panel: "pink" }).panel, "white");
});

test("hidden items and reordering show up in the change list", async () => {
  const { db } = await setup();
  const m1 = await C.saveItem(db, { kind: "member", data: { name: "One" } }, "a@x.org", T0);
  const m2 = await C.saveItem(db, { kind: "member", data: { name: "Two" } }, "a@x.org", T0);
  await C.publish(db, {}, "a@x.org", T0);
  await C.reorder(db, "member", [m2.id, m1.id], "a@x.org", T0);
  await C.saveItem(db, { id: m1.id, kind: "member", data: { name: "One" }, visible: false, rev: 1 }, "a@x.org", T0);
  const ch = (await C.getState(db)).changes;
  assert.ok(ch.some((c) => c.change === "reordered"));
  assert.ok(ch.some((c) => c.change === "hidden" && c.name === "One"));
});
