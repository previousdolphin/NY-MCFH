// Escaping and the small safe formatting subset editors can use.

const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ENT[c]);
}

// Only http, https and mailto links are allowed anywhere on the site.
export function safeUrl(u) {
  const s = String(u ?? "").trim();
  if (!s) return "";
  if (/^(https?:\/\/|mailto:)[^\s]+$/i.test(s)) return s;
  if (/^\/[^/\\]/.test(s) || s === "/") return s; // same-site path
  return "";
}

// **bold**, *italic*, [text](url). Input is escaped first, so nothing else gets through.
export function inline(text) {
  let s = esc(text);
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(url.replace(/&amp;/g, "&"));
    if (!u) return label;
    const ext = /^https?:/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${esc(u)}"${ext} class="text-brand-red underline decoration-2 underline-offset-2">${label}</a>`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  return s.replace(/\r?\n/g, "<br>");
}

export function paragraphs(text) {
  return String(text ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Plain first paragraph, used when an event has no short blurb.
export function firstParagraphPlain(text) {
  const p = paragraphs(text)[0] || "";
  return p.replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1").replace(/\*+/g, "");
}

export function lines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
