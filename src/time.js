// Event times are entered and shown as New York wall-clock time ("2026-11-16T18:30").
// UTC is only used to decide when an event is over and when a schedule fires.

const ZONE = "America/New_York";
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function partsAt(ms) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}

const pad = (n) => String(n).padStart(2, "0");

export function isLocal(s) {
  const m = LOCAL_RE.exec(String(s ?? ""));
  if (!m) return false;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || h > 23 || mi > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// UTC ms -> "YYYY-MM-DDTHH:mm" in New York.
export function utcToNy(ms) {
  const p = partsAt(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function offsetAt(ms) {
  const p = partsAt(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

// New York wall-clock -> UTC ms. Throws for a time that does not exist (spring clock change).
// An ambiguous time (autumn clock change) resolves to its first occurrence.
export function nyToUtc(local) {
  if (!isLocal(local)) throw new Error("Use a date and time like 2026-11-16 18:30.");
  const [, y, mo, d, h, mi] = LOCAL_RE.exec(local).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const candidates = [guess - offsetAt(guess - 6 * 3600e3), guess - offsetAt(guess + 6 * 3600e3)];
  for (const t of candidates.sort((a, b) => a - b)) {
    if (utcToNy(t) === local) return t;
  }
  throw new Error("That time does not exist in New York (the clocks change then).");
}

export function longDate(local, withYear = false) {
  const [, y, mo, d] = LOCAL_RE.exec(local).map(Number);
  const wd = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${wd}, ${MONTHS[mo - 1]} ${d}` + (withYear ? `, ${y}` : "");
}

export function shortDate(local) {
  const [, y, mo, d] = LOCAL_RE.exec(local).map(Number);
  return `${MONTHS[mo - 1]} ${d}, ${y}`;
}

export function clock(local) {
  const [, , , , h, mi] = LOCAL_RE.exec(local).map(Number);
  return `${h % 12 || 12}:${pad(mi)} ${h < 12 ? "AM" : "PM"}`;
}

export function timeRange(start, end) {
  if (!end || end.slice(0, 10) !== start.slice(0, 10) || end === start) return clock(start);
  return `${clock(start)} - ${clock(end)}`;
}

// When an event counts as over: its end, or the end of its start day if no end was given.
export function endsAtUtc(start, end) {
  if (end && isLocal(end)) return nyToUtc(end);
  return nyToUtc(start.slice(0, 10) + "T23:59") + 60e3;
}
