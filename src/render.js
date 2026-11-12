// Public pages. One entry point: render(page, doc, opts). The same doc shape is used for the
// draft and for every published release, so preview and live go through identical code.

import { esc, safeUrl, inline, paragraphs, firstParagraphPlain, lines } from "./text.js";
import { longDate, shortDate, timeRange, endsAtUtc, isLocal } from "./time.js";

const PIN = `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path></svg>`;
const CLOCK = `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"></path></svg>`;

// Press chips keep the colours the site already used for each outlet.
const CHIP_BASE = "flex items-center justify-center text-white font-bold text-[11px] px-2 py-1 border border-brand-black transition-colors shadow-[2px_2px_0_0_#111] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#111]";
const OUTLETS = [
  [/^ny1$/i, "bg-[#1e488d] font-sans hover:bg-blue-800"],
  [/indypendent/i, "bg-gray-900 font-sans hover:bg-black"],
  [/^(ap|ap news|associated press)$/i, "bg-[#c22700] font-sans hover:bg-[#a32100]"],
  [/times/i, "bg-black font-serif italic hover:bg-gray-800"],
  [/ny post|new york post/i, "bg-[#cc0000] font-serif font-black italic hover:bg-red-800"],
  [/nyu news|washington square news/i, "bg-[#57068c] font-sans hover:bg-purple-900"],
  [/fordham/i, "bg-[#860038] font-sans hover:bg-[#5e0027]"],
];
const chipClass = (outlet) => (OUTLETS.find(([re]) => re.test(outlet)) || [, "bg-brand-black font-sans hover:bg-gray-800"])[1];

export const PANELS = {
  blue: "bg-[#2b5ba4]", red: "bg-brand-red", green: "bg-brand-green",
  white: "bg-white", black: "bg-brand-black", cream: "bg-brand-cream",
};

const BTN = "font-display font-bold uppercase tracking-wider border-2 border-brand-black shadow-brutal hover:translate-y-1 hover:shadow-brutal-hover transition-all";

function ctx(doc, opts) {
  const mediaBase = (opts.mediaBase || "/media").replace(/\/$/, "");
  const base = opts.base || "";
  return {
    doc, now: opts.now ?? Date.now(), base, preview: opts.preview || null,
    origin: opts.origin || "",
    img: (key) => (key ? `${mediaBase}/${encodeURIComponent(key)}` : ""),
    alt: (key, fallback) => esc((doc.media && doc.media[key] && doc.media[key].alt) || fallback || ""),
    home: (hash = "") => `${base}/${hash}`,
    partners: `${base}/partners.html`,
    b: (k) => (doc.blocks && doc.blocks[k]) || "",
  };
}

export function splitEvents(doc, now) {
  const upcoming = [], past = [];
  for (const e of doc.events || []) {
    if (e.visible === false || !isLocal(e.start)) continue;
    (endsAtUtc(e.start, e.end) > now ? upcoming : past).push(e);
  }
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  past.sort((a, b) => b.start.localeCompare(a.start));
  return { upcoming, past };
}

function head(c, title, page) {
  const desc = esc(c.b("site_description"));
  const share = c.b("share_image") ? c.img(c.b("share_image")) : "";
  const url = c.origin ? `${c.origin}${page === "partners" ? "/partners.html" : "/"}` : "";
  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    ${desc ? `<meta name="description" content="${desc}">` : ""}
    ${c.preview ? `<meta name="robots" content="noindex, nofollow">` : ""}
    ${url && !c.preview ? `<link rel="canonical" href="${esc(url)}">` : ""}
    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(title)}">
    ${desc ? `<meta property="og:description" content="${desc}">` : ""}
    ${url ? `<meta property="og:url" content="${esc(url)}">` : ""}
    ${share ? `<meta property="og:image" content="${esc(share)}">\n    <meta name="twitter:card" content="summary_large_image">` : ""}
    <link rel="icon" href="/static/favicon.png">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Oswald:wght@500;700&family=Playfair+Display:wght@900&display=swap" rel="stylesheet">
    <script src="/static/tailwind-config.js"></script>
    <link rel="stylesheet" href="/static/site.css">
</head>`;
}

function ticker(c, href) {
  const phrases = lines(c.b("ticker"));
  if (!phrases.length) return "";
  const once = phrases.map(esc).join(" • ") + " • ";
  return `
    <a href="${href}" class="block bg-brand-black text-white font-display text-sm tracking-widest uppercase border-b-4 border-brand-red marquee-container py-2 relative z-[80] hover:bg-gray-900 transition-colors cursor-pointer">
        <div class="marquee-content">
            ${once.repeat(4)}
        </div>
    </a>`;
}

function nav(c, page) {
  const onHome = page === "home";
  const link = (hash) => (onHome ? hash : c.home(hash));
  const d = "font-display font-bold text-lg uppercase tracking-wide";
  const m = "block px-6 py-4 font-display font-bold text-xl uppercase border-t-2 border-brand-black";
  const dLink = (href, label) => `<a href="${href}" class="${d} hover:text-brand-red transition-colors">${label}</a>`;
  const mLink = (href, label) => `<a href="${href}" class="${m} hover:bg-brand-red hover:text-white bg-brand-cream transition-colors">${label}</a>`;
  return `
    <nav class="sticky top-0 z-50 bg-brand-cream border-b-4 border-brand-black relative">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-40">
            <div class="flex justify-between h-20 items-center">
                <a href="${onHome ? "#" : c.home()}" class="flex items-center group relative h-full">
                    <div class="relative z-[60] -mb-12 sm:-mb-16 mr-3 sm:mr-4 border-4 border-brand-black bg-brand-cream p-1 shadow-brutal transition-transform group-hover:translate-y-1 group-hover:shadow-brutal-hover">
                        <img src="${c.img(c.b("logo_small"))}" alt="NY Metro Coalition Logo" class="h-16 sm:h-28 w-auto object-contain">
                    </div>
                    <span class="font-display font-bold text-lg sm:text-xl uppercase leading-none block tracking-wide">
                        NY Metro Coalition<br>
                        <span class="text-brand-red text-sm sm:text-base">For Higher Ed</span>
                    </span>
                </a>
                <div class="hidden lg:flex space-x-6 items-center">
                    ${dLink(link("#actions"), "Actions")}
                    ${dLink(link("#who-we-are"), "Who We Are")}
                    ${onHome ? dLink(c.partners, "Partner Orgs") : `<a href="#" class="${d} text-brand-red border-b-4 border-brand-red pb-1">Partner Orgs</a>`}
                    ${dLink(link("#mission"), "Mission")}
                    <a href="${link("#get-involved")}" class="bg-brand-red text-white font-display font-bold text-lg uppercase tracking-wider px-6 py-2 border-2 border-brand-black shadow-brutal hover:translate-y-1 hover:shadow-brutal-hover transition-all">Get Involved</a>
                </div>
                <div class="lg:hidden flex items-center relative z-[70]">
                    <button id="mobile-menu-btn" aria-label="Menu" class="text-brand-black focus:outline-none p-2 border-2 border-brand-black shadow-[2px_2px_0_0_#111] bg-white hover:bg-gray-100 transition-colors">
                        <svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="square" stroke-linejoin="miter" stroke-width="3" d="M4 6h16M4 12h16M4 18h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        <div id="mobile-menu" class="hidden lg:hidden absolute top-full left-0 w-full bg-brand-cream border-b-4 border-brand-black z-[70] shadow-2xl flex flex-col">
            ${mLink(link("#actions"), "Actions")}
            ${mLink(link("#who-we-are"), "Who We Are")}
            ${onHome ? mLink(c.partners, "Partner Orgs") : `<a href="#" class="${m} bg-brand-red text-white transition-colors">Partner Orgs</a>`}
            ${mLink(link("#mission"), "Mission")}
            <a href="${link("#get-involved")}" class="block px-6 py-4 font-display font-bold text-xl uppercase bg-brand-red text-white border-t-2 border-brand-black hover:bg-brand-black transition-colors">Get Involved</a>
        </div>
    </nav>`;
}

function footer(c, extra = "relative overflow-hidden") {
  const email = String(c.b("contact_email")).trim();
  const year = new Date(c.now).getUTCFullYear();
  return `
    <footer id="get-involved" class="bg-brand-black text-white py-20 border-t-8 border-brand-red ${extra}">
        <div class="max-w-5xl mx-auto px-4 text-center relative z-10">
            <h2 class="text-6xl font-display font-bold uppercase tracking-tighter mb-6 text-white" style="text-shadow: 4px 4px 0 #2d6a4f;">
                ${esc(c.b("footer_heading"))}
            </h2>
            <p class="text-xl font-medium mb-10 max-w-2xl mx-auto">
                ${inline(c.b("footer_text"))}
            </p>
            ${/^[^\s@<>"]+@[^\s@<>"]+$/.test(email) ? `<a href="mailto:${esc(email)}" class="inline-block bg-brand-red text-white font-display font-bold text-2xl uppercase px-12 py-4 border-4 border-white hover:bg-white hover:text-brand-red hover:-translate-y-1 transition-all shadow-[8px_8px_0_0_#2d6a4f] hover:shadow-[4px_4px_0_0_#2d6a4f]">
                ${esc(c.b("contact_button") || "Email Us Now")}
            </a>` : ""}
            <div class="mt-20 pt-8 border-t-2 border-gray-800 font-display uppercase tracking-widest text-sm text-gray-400">
                &copy; ${year} NY Metro Coalition for Higher Education. All Rights Reserved.
            </div>
        </div>
    </footer>`;
}

function tail(c, page) {
  const banner = c.preview
    ? `
    <div class="fixed bottom-0 inset-x-0 z-[90] bg-[#f9c041] text-brand-black border-t-4 border-brand-black px-4 py-2 text-center font-sans font-semibold text-sm">
        ${esc(c.preview)}
    </div>`
    : "";
  const modal = page === "home"
    ? `
    <div id="image-modal" class="fixed inset-0 z-[100] bg-black/90 hidden opacity-0 transition-opacity duration-300 flex-col items-center justify-center p-4 sm:p-8 backdrop-blur-sm">
        <button id="close-modal" aria-label="Close" class="absolute top-4 right-4 sm:top-8 sm:right-8 text-white hover:text-brand-red p-2 focus:outline-none transition-colors group z-10">
            <svg class="w-10 h-10 transform group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
        <div class="relative max-w-5xl max-h-full w-full h-full flex items-center justify-center cursor-auto">
            <img id="modal-image" alt="Enlarged poster" class="max-w-full max-h-full object-contain border-4 border-brand-black shadow-[8px_8px_0_0_#cc191c]">
        </div>
    </div>`
    : "";
  return `${modal}${banner}
    <script src="/static/site.js"></script>
</body>
</html>`;
}

function featured(c, e) {
  const posterCol = !e.poster
    ? ""
    : e.poster_back
      ? `
                    <div data-flip class="w-full lg:w-1/2 border-b-4 lg:border-b-0 lg:border-r-4 border-brand-black bg-brand-cream relative cursor-pointer" tabindex="0">
                        <img data-flip-front src="${c.img(e.poster)}" alt="${c.alt(e.poster, e.title)}" class="w-full h-full object-cover absolute inset-0 z-10 transition-opacity duration-500 ease-in-out">
                        <img src="${c.img(e.poster_back)}" alt="${c.alt(e.poster_back, e.title + " (back)")}" class="w-full h-full object-cover relative z-0">
                    </div>`
      : `
                    <div class="w-full lg:w-1/2 border-b-4 lg:border-b-0 lg:border-r-4 border-brand-black bg-brand-black">
                        <img src="${c.img(e.poster)}" alt="${c.alt(e.poster, e.title)}" class="w-full h-auto lg:h-full object-contain cursor-pointer action-poster">
                    </div>`;

  const row = (icon, strong, sub, note) => `
                            <li class="flex items-start">
                                <span class="mr-4 text-brand-red">${icon}</span>
                                <div>
                                    <strong class="block text-xl font-display uppercase tracking-wider text-brand-black">${esc(strong)}</strong>
                                    ${sub ? `<span class="text-gray-600">${esc(sub)}</span>` : ""}
                                    ${note ? `<p class="mt-1">${esc(note)}</p>` : ""}
                                </div>
                            </li>`;
  const stops = (e.stops || []).filter((s) => s && (s.time || s.place));
  const rows = stops.length
    ? stops.map((s) => row(PIN, [s.time, s.place].filter(Boolean).join(" - "), s.address, s.note)).join("")
    : row(CLOCK, timeRange(e.start, e.end), e.time_note) + (e.venue ? row(PIN, e.venue, e.address) : "");

  const desc = paragraphs(e.description).map((p) => `
                        <p class="text-lg font-medium mb-4">${inline(p)}</p>`).join("");

  const cta = safeUrl(e.cta_url), more = safeUrl(e.link_url);
  const foot = cta || more || e.cta_note || e.hosted_by
    ? `
                        <div class="mt-auto pt-8 border-t-4 border-brand-black text-center">
                            ${cta ? `<a href="${esc(cta)}" target="_blank" rel="noopener noreferrer" class="inline-block text-center bg-brand-red text-white text-xl px-8 py-4 ${BTN}">
                                ${esc(e.cta_label || "Register")}
                            </a>` : ""}
                            ${e.cta_note ? `<p class="mt-4 text-sm font-bold uppercase tracking-wider text-gray-600">${esc(e.cta_note)}</p>` : ""}
                            ${more ? `<p class="${cta || e.cta_note ? "mt-4 " : ""}font-display text-xl font-bold uppercase tracking-wider text-center">More info at <a href="${esc(more)}" target="_blank" rel="noopener noreferrer" class="text-brand-red hover:underline decoration-4 underline-offset-4">${esc(e.link_label || more.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></p>` : ""}
                            ${e.hosted_by ? `<p class="mt-2 text-sm font-medium text-gray-600">Hosted by ${esc(e.hosted_by)}</p>` : ""}
                        </div>`
    : "";

  return `
            <div class="mb-20">
                <div class="bg-white border-4 border-brand-black shadow-brutal flex flex-col lg:flex-row overflow-hidden">${posterCol}
                    <div class="w-full ${e.poster ? "lg:w-1/2" : ""} p-8 md:p-12 flex flex-col justify-center">
                        ${e.badge ? `<div class="inline-block bg-brand-black text-white font-display font-bold uppercase px-4 py-2 mb-6 border-2 border-brand-black w-max text-xl">
                            ${esc(e.badge)}
                        </div>` : ""}
                        <h3 class="text-4xl md:text-5xl font-display font-bold uppercase tracking-tighter leading-tight mb-4">
                            ${esc(e.title)}${e.accent ? ` <br><span class="text-brand-red">${esc(e.accent)}</span>` : ""}
                        </h3>
                        ${e.subtitle ? `<p class="text-lg font-bold font-display uppercase tracking-wider mb-4">${esc(e.subtitle)}</p>` : ""}
                        <p class="text-2xl font-bold font-display uppercase tracking-widest border-b-4 border-brand-black pb-4 mb-8">${esc(longDate(e.start))}</p>

                        <ul class="space-y-6 text-lg font-medium mb-8">${rows}
                        </ul>
${desc}
${foot}
                    </div>
                </div>
            </div>`;
}

function pastCard(c, e) {
  const press = (e.press || []).filter((p) => p && p.outlet && safeUrl(p.url));
  const more = safeUrl(e.link_url);
  const blurb = e.blurb || firstParagraphPlain(e.description);
  const title = [e.title, e.accent].filter(Boolean).join(" ");
  const footRow = press.length
    ? `
                            <div class="mt-auto pt-4 border-t-2 border-brand-black border-dashed flex items-center justify-between flex-wrap gap-2">
                                <span class="text-xs font-bold uppercase tracking-wider text-gray-600">Press:</span>
                                <div class="flex gap-2 flex-wrap">
                                    ${press.map((p) => `<a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer" title="Read on ${esc(p.outlet)}" class="${CHIP_BASE} ${chipClass(p.outlet)}">${esc(p.outlet.toUpperCase())}</a>`).join("\n                                    ")}
                                </div>
                            </div>`
    : more
      ? `
                            <div class="mt-auto pt-4 border-t-2 border-brand-black border-dashed flex items-center justify-between flex-wrap gap-2">
                                <span class="text-xs font-bold uppercase tracking-wider text-gray-600">More info:</span>
                                <a href="${esc(more)}" target="_blank" rel="noopener noreferrer" class="text-sm font-bold text-brand-red hover:underline">${esc(e.link_label || more.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>
                            </div>`
      : "";
  return `
                    <div class="bg-white border-4 border-brand-black shadow-brutal flex flex-col h-full">
                        ${e.poster ? `<div class="border-b-4 border-brand-black relative aspect-[3/4] bg-white overflow-hidden group">
                            <img src="${c.img(e.poster)}" alt="${c.alt(e.poster, title)}" loading="lazy" class="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300 action-poster">
                        </div>` : ""}
                        <div class="p-6 flex flex-col flex-grow">
                            <p class="text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">${esc(shortDate(e.start))}</p>
                            <h3 class="text-2xl font-display font-bold uppercase mb-2 leading-tight">${esc(title)}</h3>
                            <p class="text-brand-black font-medium mb-4 flex-grow">${esc(blurb)}</p>
${footRow}
                        </div>
                    </div>`;
}

function member(c, m) {
  const cls = `w-full h-auto aspect-square object-contain p-4 ${m.dark ? "bg-brand-black" : "bg-white"} border-4 border-brand-black shadow-brutal hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#111] transition-all`;
  const fb = lines(m.fallback || m.name).map(esc).join("<br>");
  const inner = m.logo
    ? `<img src="${c.img(m.logo)}" data-fallback="${esc(m.fallback || m.name)}" alt="${esc(m.name)} logo" loading="lazy" class="${cls}">`
    : `<div class="logo-fallback">${fb}</div>`;
  const url = safeUrl(m.link);
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(m.name)}" class="block">${inner}</a>` : inner;
}

function home(c) {
  const { upcoming, past } = splitEvents(c.doc, c.now);
  const members = (c.doc.members || []).filter((m) => m.visible !== false);
  const heading = upcoming.length && past.length ? "Upcoming and Past Actions" : upcoming.length ? "Upcoming Actions" : "Past Actions";
  const actions = upcoming.length || past.length
    ? `
    <section id="actions" class="py-20 bg-brand-cream border-b-4 border-brand-black relative">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center gap-4 mb-16">
                <h2 class="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight text-brand-black inline-block bg-[#f9c041] px-4 py-1 border-4 border-brand-black shadow-brutal">
                    ${heading}
                </h2>
                <div class="h-2 flex-grow bg-brand-black hidden lg:block"></div>
            </div>
${upcoming.map((e) => featured(c, e)).join("")}
            ${past.length ? `<div>
                <h3 class="text-3xl font-display font-bold uppercase mb-8 inline-block border-b-4 border-brand-red pb-1">Past Actions Archive</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
${past.map((e) => pastCard(c, e)).join("")}
                </div>
            </div>` : ""}
        </div>
    </section>`
    : `<span id="actions"></span>`;

  return `${head(c, c.b("site_title") || "NY Metro Coalition for Higher Education", "home")}
<body class="bg-brand-cream text-brand-black font-sans antialiased selection:bg-brand-red selection:text-white">
${ticker(c, "#actions")}
${nav(c, "home")}

    <header class="border-b-4 border-brand-black bg-white overflow-hidden relative">
        <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(#111 2px, transparent 2px); background-size: 30px 30px;"></div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-32 relative z-10 flex flex-col md:flex-row items-center gap-12 lg:gap-16">
            <div class="flex-1 text-left order-2 md:order-1">
                <h1 class="text-6xl md:text-8xl font-display font-bold uppercase tracking-tighter leading-[0.9] mb-6">
                    ${esc(c.b("hero_line1"))}<br>
                    <span class="text-white" style="text-shadow: 4px 4px 0 #cc191c, -1px -1px 0 #111, 1px -1px 0 #111, -1px 1px 0 #111, 1px 1px 0 #111;">${esc(c.b("hero_line2"))}</span>
                </h1>
                <p class="mt-4 text-xl md:text-2xl font-semibold max-w-2xl text-brand-black border-l-4 border-brand-red pl-4">
                    ${inline(c.b("hero_tagline"))}
                </p>
                <div class="mt-10 flex flex-wrap gap-4">
                    <a href="#who-we-are" class="bg-brand-red text-white px-8 py-4 text-lg ${BTN}">Who We Are</a>
                    <a href="#mission" class="bg-brand-black text-white px-8 py-4 text-lg ${BTN}">Mission</a>
                    <a href="#actions" class="bg-white text-brand-black px-8 py-4 text-lg ${BTN}">Actions</a>
                </div>
            </div>
            <div class="flex-1 flex justify-center md:justify-end order-1 md:order-2 w-full max-w-sm md:max-w-none mx-auto">
                <div class="border-4 border-brand-black p-6 sm:p-8 shadow-[8px_8px_0_0_#111] relative">
                    <img src="${c.img(c.b("logo_large"))}" alt="NY Metro Coalition for Higher Ed logo" class="w-56 sm:w-72 md:w-80 lg:w-[400px] h-auto object-contain relative z-10 drop-shadow-md">
                </div>
            </div>
        </div>
    </header>
${actions}

    <section id="who-we-are" class="py-20 bg-brand-cream border-b-4 border-brand-black">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-12">
                <h2 class="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight inline-block border-b-8 border-brand-red pb-2">Who We Are</h2>
                <p class="mt-6 text-xl font-medium max-w-3xl mx-auto">${inline(c.b("who_intro"))}</p>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 lg:gap-8">
                ${members.map((m) => member(c, m)).join("\n                ")}
            </div>
        </div>
    </section>

    <section id="mission" class="py-24 bg-white border-b-4 border-brand-black relative">
        <div class="absolute inset-0 opacity-[0.03]" style="background-image: linear-gradient(#111 1px, transparent 1px), linear-gradient(90deg, #111 1px, transparent 1px); background-size: 40px 40px;"></div>
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div class="text-center mb-12">
                <h2 class="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight inline-block bg-brand-black text-white px-6 py-2 transform -skew-x-3">Mission Statement</h2>
            </div>
            <div class="text-xl leading-relaxed space-y-8 font-medium text-gray-800">
                ${paragraphs(c.b("mission_body")).map((p) => `<p>${inline(p)}</p>`).join("\n                ")}
                ${c.b("mission_callout") ? `<div class="mt-12 mb-12 bg-brand-red text-white p-8 md:p-12 border-4 border-brand-black shadow-brutal">
                    <p class="font-display text-2xl md:text-3xl uppercase leading-tight tracking-wide text-center m-0 shadow-none text-white">
                        ${inline(c.b("mission_callout"))}
                    </p>
                </div>` : ""}
            </div>
            <br>
            ${c.b("mission_photo") ? `<img src="${c.img(c.b("mission_photo"))}" alt="${c.alt(c.b("mission_photo"), "Rally photo")}" loading="lazy" class="w-full h-auto block border-4 border-brand-black shadow-brutal">` : ""}
        </div>
    </section>
${footer(c)}
${tail(c, "home")}`;
}

function partnersPage(c) {
  const list = (c.doc.partners || []).filter((p) => p.visible !== false);
  const card = (p) => {
    const url = safeUrl(p.url);
    return `
                <div class="bg-white border-4 border-brand-black shadow-brutal flex flex-col h-full hover:-translate-y-2 hover:shadow-[10px_10px_0_0_#111] transition-all duration-300">
                    <div class="border-b-4 border-brand-black relative h-48 sm:h-64 ${PANELS[p.panel] || PANELS.white} p-8 flex items-center justify-center">
                        ${p.logo ? `<img src="${c.img(p.logo)}" alt="${esc(p.name)} logo" class="max-h-full max-w-full object-contain">` : `<span class="font-display font-bold uppercase text-3xl text-center ${p.panel === "white" || p.panel === "cream" || !PANELS[p.panel] ? "text-brand-black" : "text-white"}">${esc(p.name)}</span>`}
                    </div>
                    <div class="p-8 flex flex-col flex-grow">
                        <h3 class="text-3xl font-display font-bold uppercase mb-4 leading-tight">${esc(p.name)}</h3>
                        <p class="text-brand-black font-medium mb-8 flex-grow text-lg">${inline(p.description)}</p>
                        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="inline-block text-center bg-brand-black text-white font-display font-bold uppercase tracking-wider px-6 py-4 border-2 border-brand-black shadow-[4px_4px_0_0_#cc191c] hover:translate-y-1 hover:shadow-[2px_2px_0_0_#cc191c] transition-all">
                            Visit Website ↗
                        </a>` : ""}
                    </div>
                </div>`;
  };
  return `${head(c, "Partner Organizations - NY Metro Coalition", "partners")}
<body class="bg-brand-cream text-brand-black font-sans antialiased selection:bg-brand-red selection:text-white flex flex-col min-h-screen">
${ticker(c, c.home("#actions"))}
${nav(c, "partners")}

    <header class="border-b-4 border-brand-black bg-white overflow-hidden relative">
        <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(#111 2px, transparent 2px); background-size: 30px 30px;"></div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10 text-center">
            <h1 class="text-5xl md:text-7xl font-display font-bold uppercase tracking-tighter leading-none mb-6 text-brand-black">
                Partner <br class="sm:hidden"><span class="text-brand-red">Organizations</span>
            </h1>
            <p class="mt-4 text-xl md:text-2xl font-medium max-w-3xl mx-auto text-gray-800">
                ${inline(c.b("partners_intro"))}
            </p>
        </div>
    </header>

    <section class="py-20 flex-grow relative bg-brand-cream">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14">
${list.map(card).join("")}
            </div>
        </div>
    </section>
${footer(c, "mt-auto")}
${tail(c, "partners")}`;
}

export function render(page, doc, opts = {}) {
  const c = ctx(doc || {}, opts);
  return page === "partners" ? partnersPage(c) : home(c);
}
