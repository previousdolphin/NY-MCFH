import { render } from "./render.js";
import { getEditor } from "./access.js";
import * as C from "./content.js";
import * as M from "./media.js";
import { utcToNy } from "./time.js";
import { studioShell } from "./studio/shell.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

function page(html, { status = 200, cache = "public, max-age=60", noindex = false } = {}) {
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": cache,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  if (noindex) headers["x-robots-tag"] = "noindex, nofollow";
  return new Response(html, { status, headers });
}

const plain = (text, status) => page(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${text}</title><body style="font-family:system-ui;margin:15vh auto;max-width:32rem;padding:0 1rem;color:#111"><h1 style="font-size:1.4rem">${text}</h1><p><a href="/" style="color:#cc191c">Go to the home page</a></p>`,
  { status, cache: "no-store", noindex: true });

function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function mediaBase(env) {
  return env.MEDIA_BASE || "/media";
}

async function publicPage(env, url, which, isSiteHost) {
  const doc = await C.getLiveDoc(env.DB);
  if (!doc) return plain("This site is being set up.", 503);
  const html = render(which, doc, { mediaBase: mediaBase(env), origin: `https://${env.SITE_HOST}` });
  return page(html, { noindex: !isSiteHost });
}

async function previewPage(env, url, parts) {
  // /preview/<token>[/scheduled](/ | /partners.html)
  const settings = await C.getSettings(env.DB);
  if (!sameToken(parts[0] || "", settings.preview_token)) return plain("This preview link is no longer valid.", 404);
  const scheduled = parts[1] === "scheduled";
  const rest = parts.slice(scheduled ? 2 : 1).join("/");
  if (rest !== "" && rest !== "partners.html") return plain("Page not found.", 404);
  if (!url.pathname.endsWith("/") && rest === "") return Response.redirect(url.origin + url.pathname + "/", 302);

  let doc, banner;
  if (scheduled) {
    const r = await env.DB.prepare("SELECT snapshot, publish_at FROM releases WHERE status = 'scheduled' ORDER BY publish_at LIMIT 1").first();
    if (!r) return plain("Nothing is scheduled right now.", 404);
    doc = JSON.parse(r.snapshot);
    banner = `Preview of the version scheduled for ${utcToNy(r.publish_at).replace("T", " at ")} (New York time). Not public yet.`;
  } else {
    doc = await C.loadDraft(env.DB);
    banner = "Preview of unpublished changes. Only people with this link can see this.";
  }
  const base = `/preview/${parts[0]}${scheduled ? "/scheduled" : ""}`;
  const html = render(rest ? "partners" : "home", doc, { mediaBase: mediaBase(env), base, preview: banner });
  return page(html, { cache: "no-store", noindex: true });
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") throw 0;
    return body;
  } catch {
    throw new C.HttpError(400, "The request could not be read.");
  }
}

async function api(request, env, url, me) {
  const db = env.DB;
  const path = url.pathname.slice("/studio/api/".length);
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  const method = request.method;

  if (method !== "GET") {
    // Writes must come from the editor page itself.
    if (request.headers.get("origin") !== url.origin || request.headers.get("x-requested-with") !== "XMLHttpRequest") {
      throw new C.HttpError(403, "This request did not come from the editor.");
    }
  }

  if (method === "GET" && path === "state") {
    const state = await C.getState(db);
    return json({
      ...state, me: me.email, media_base: mediaBase(env), now_local: utcToNy(Date.now()),
      site: `https://${env.SITE_HOST}`,
    });
  }
  if (method === "GET" && path === "releases") return json({ releases: await C.listReleases(db) });

  if (seg[0] === "items") {
    if (method === "POST" && seg.length === 1) return json(await C.saveItem(db, await readJson(request), me.email), 201);
    if (method === "PUT" && seg.length === 2) return json(await C.saveItem(db, { ...(await readJson(request)), id: seg[1] }, me.email));
    if (method === "DELETE" && seg.length === 2) { await C.deleteItem(db, seg[1], me.email); return json({ ok: true }); }
  }
  if (method === "PUT" && seg[0] === "order" && seg.length === 2) {
    await C.reorder(db, seg[1], (await readJson(request)).ids, me.email);
    return json({ ok: true });
  }
  if (seg[0] === "media") {
    if (method === "POST" && seg.length === 1) return json(await M.upload(request, env, me.email), 201);
    if (method === "PATCH" && seg.length === 2) { await M.patch(env, seg[1], await readJson(request), me.email); return json({ ok: true }); }
  }
  if (method === "POST" && path === "publish") return json(await C.publish(db, await readJson(request), me.email));
  if (path === "schedule") {
    if (method === "POST") return json(await C.schedule(db, await readJson(request), me.email));
    if (method === "DELETE") { await C.cancelSchedule(db, me.email); return json({ ok: true }); }
  }
  if (method === "POST" && seg[0] === "releases" && seg[2] === "rollback" && seg.length === 3) {
    return json(await C.rollback(db, seg[1], me.email));
  }
  if (method === "POST" && path === "draft/reset") { await C.resetDraft(db, me.email); return json({ ok: true }); }
  if (method === "POST" && path === "preview-token") return json({ preview_token: await C.rotatePreviewToken(db, me.email) });

  throw new C.HttpError(404, "Not found.");
}

async function studio(request, env, url) {
  const isApi = url.pathname.startsWith("/studio/api/");
  const me = await getEditor(request, env);
  if (!me) {
    return isApi
      ? json({ error: "Your sign-in has expired. Sign in again to continue.", signin: true }, 401)
      : plain("Sign-in is required to edit this site.", 403);
  }
  if (isApi) {
    try {
      return await api(request, env, url, me);
    } catch (e) {
      if (e instanceof C.HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
      console.error("studio api", e && e.stack ? e.stack : e);
      return json({ error: "Something went wrong on our side. Nothing was saved." }, 500);
    }
  }
  if (url.pathname !== "/studio") return Response.redirect(url.origin + "/studio", 302);
  const media = mediaBase(env);
  const imgSrc = media.startsWith("http") ? ` ${new URL(media).origin}` : "";
  return new Response(studioShell(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "same-origin",
      "content-security-policy":
        `default-src 'self'; img-src 'self' data: blob:${imgSrc}; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname;
    const isSiteHost = host === env.SITE_HOST;
    if (host === `www.${env.SITE_HOST}`) {
      return Response.redirect(`https://${env.SITE_HOST}${url.pathname}${url.search}`, 301);
    }
    const p = url.pathname;
    try {
      if (p === "/studio" || p.startsWith("/studio/")) return await studio(request, env, url);

      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

      if (p === "/") return await publicPage(env, url, "home", isSiteHost);
      if (p === "/partners.html") return await publicPage(env, url, "partners", isSiteHost);
      if (p === "/index.html") return Response.redirect(url.origin + "/", 301);
      if (p === "/partners" || p === "/partners/") return Response.redirect(url.origin + "/partners.html", 301);
      if (p.startsWith("/preview/")) return await previewPage(env, url, p.slice(9).replace(/\/$/, "").split("/"));
      if (p.startsWith("/media/")) return await M.serve(request, env, decodeURIComponent(p.slice(7)));

      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      return plain("Page not found.", 404);
    } catch (e) {
      console.error("fetch", e && e.stack ? e.stack : e);
      return plain("Something went wrong. Please try again in a moment.", 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(C.promoteDue(env.DB, Date.now()).then((r) => { if (r.length) console.log("promoted", JSON.stringify(r)); }));
  },
};
