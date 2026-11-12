import { test } from "node:test";
import assert from "node:assert/strict";
import { nyToUtc, utcToNy, longDate, timeRange, endsAtUtc, isLocal } from "../src/time.js";
import { esc, inline, safeUrl } from "../src/text.js";
import { render, splitEvents } from "../src/render.js";

test("New York time converts both ways across the clock changes", () => {
  assert.equal(new Date(nyToUtc("2026-11-16T18:30")).toISOString(), "2026-11-16T23:30:00.000Z");
  assert.equal(new Date(nyToUtc("2026-07-04T12:00")).toISOString(), "2026-07-04T16:00:00.000Z");
  assert.equal(utcToNy(Date.parse("2026-11-16T23:30:00Z")), "2026-11-16T18:30");
  // 14 March 2027: 2:00-2:59 does not exist
  assert.throws(() => nyToUtc("2027-03-14T02:30"), /does not exist/);
  assert.equal(new Date(nyToUtc("2027-03-14T03:00")).toISOString(), "2027-03-14T07:00:00.000Z");
  assert.equal(new Date(nyToUtc("2027-03-14T01:59")).toISOString(), "2027-03-14T06:59:00.000Z");
  // 7 November 2027: 1:30 happens twice, first occurrence (EDT) wins
  assert.equal(new Date(nyToUtc("2027-11-07T01:30")).toISOString(), "2027-11-07T05:30:00.000Z");
  assert.equal(new Date(nyToUtc("2027-11-07T02:00")).toISOString(), "2027-11-07T07:00:00.000Z");
  assert.equal(isLocal("2026-13-01T10:00"), false);
});

test("labels", () => {
  assert.equal(longDate("2026-11-16T18:30"), "Monday, November 16");
  assert.equal(timeRange("2026-11-16T18:30", "2026-11-16T20:30"), "6:30 PM - 8:30 PM");
  assert.equal(timeRange("2026-05-01T00:05", ""), "12:05 AM");
  assert.equal(endsAtUtc("2026-11-16T18:30", ""), nyToUtc("2026-11-17T00:00"));
});

test("escaping and the formatting subset", () => {
  assert.equal(esc(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.equal(inline("**Join** *us* <b>"), "<strong>Join</strong> <em>us</em> &lt;b&gt;");
  assert.match(inline("[site](https://a.org/?x=1&y=2)"), /href="https:\/\/a\.org\/\?x=1&amp;y=2"/);
  assert.equal(inline("[x](javascript:alert(1))"), "x)");
  assert.equal(safeUrl("data:text/html,x"), "");
  assert.equal(safeUrl("//evil.example"), "");
  assert.equal(safeUrl("mailto:a@b.org"), "mailto:a@b.org");
});

const doc = {
  blocks: { ticker: "ONE\nTWO", hero_line1: "DEFEND", hero_line2: "<LEARN>", footer_heading: "Join", contact_email: "c@x.org" },
  events: [
    { id: "1", visible: true, title: "Forum", start: "2026-11-16T18:30", end: "2026-11-16T20:30", cta_url: "https://z.example/r", cta_label: "Register" },
    { id: "2", visible: true, title: "Old rally", start: "2025-04-17T15:00", press: [{ outlet: "AP", url: "https://ap.example" }] },
    { id: "3", visible: false, title: "Secret", start: "2026-12-01T10:00" },
    { id: "4", visible: true, title: `"><script>alert(1)</script>`, start: "2026-12-05T10:00" },
  ],
  members: [{ id: "m", visible: true, name: "Union <1>", logo: "", fallback: "Union\nOne" }],
  partners: [{ id: "p", visible: true, name: "HELU", description: "desc", url: "https://h.example", panel: "blue" }],
  media: {},
};

test("events move from upcoming to past on their own", () => {
  const before = splitEvents(doc, nyToUtc("2026-11-16T20:29"));
  assert.deepEqual(before.upcoming.map((e) => e.id), ["1", "4"]);
  assert.deepEqual(before.past.map((e) => e.id), ["2"]);
  const after = splitEvents(doc, nyToUtc("2026-11-16T20:31"));
  assert.deepEqual(after.upcoming.map((e) => e.id), ["4"]);
  assert.deepEqual(after.past.map((e) => e.id), ["1", "2"]);
});

test("rendered pages escape content and hide hidden items", () => {
  const html = render("home", doc, { now: nyToUtc("2026-11-11T12:00") });
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(html.includes("&lt;script&gt;alert(1)"));
  assert.ok(html.includes("&lt;LEARN&gt;"));
  assert.ok(!html.includes("Secret"));
  assert.ok(html.includes("Upcoming and Past Actions"));
  assert.ok(html.includes('href="https://z.example/r"'));
  assert.ok(html.includes("Union<br>One"));
  assert.ok(!html.includes("noindex"));
  const none = render("home", { ...doc, events: [] }, {});
  assert.ok(!none.includes("Past Actions Archive"));
  const pv = render("partners", doc, { preview: "Preview", base: "/preview/abc" });
  assert.ok(pv.includes("noindex") && pv.includes('href="/preview/abc/#actions"') && pv.includes("HELU"));
});
