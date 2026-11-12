// Image uploads and the fallback /media route. In production images are read straight
// from the public R2 hostname; the Worker only handles the upload.

import { HttpError } from "./content.js";

export const MAX_BYTES = 5 * 1024 * 1024;

// Decide the type from the file's first bytes, never from what the browser claims.
export function sniff(b) {
  const at = (i, ...sig) => sig.every((v, k) => b[i + k] === v);
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", ext: "png" };
  if (b.length >= 6 && at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return { mime: "image/gif", ext: "gif" };
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function sha256Hex(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const dim = (v) => { const n = Math.round(Number(v)); return n > 0 && n < 100000 ? n : null; };

export async function upload(request, env, email, now = Date.now()) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 64 * 1024) {
    throw new HttpError(413, "That image is over 5 MB. Try a smaller version.");
  }
  if (!(request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    throw new HttpError(400, "Send the image as a file upload.");
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "No image was attached.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "That image is over 5 MB. Try a smaller version.");
  const buf = await file.arrayBuffer();
  const kind = sniff(new Uint8Array(buf.slice(0, 16)));
  if (!kind) throw new HttpError(415, "Only JPEG, PNG, WebP and GIF images can be uploaded.");
  const hash = await sha256Hex(buf);
  const claimed = String(form.get("sha256") || "").toLowerCase();
  if (claimed && claimed !== hash) throw new HttpError(400, "The upload was damaged on the way. Try again.");
  const key = `${hash}.${kind.ext}`;

  const existing = await env.DB.prepare("SELECT * FROM media WHERE key = ?").bind(key).first();
  if (existing) {
    if (existing.archived_at) await env.DB.prepare("UPDATE media SET archived_at = NULL WHERE key = ?").bind(key).run();
    return { ...existing, archived_at: null, duplicate: true };
  }
  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: kind.mime, cacheControl: "public, max-age=31536000, immutable" },
  });
  const row = {
    key, mime: kind.mime, bytes: buf.byteLength, width: dim(form.get("width")), height: dim(form.get("height")),
    alt: String(form.get("alt") || "").trim().slice(0, 300),
    filename: String(file.name || "").slice(0, 200), created_at: now, created_by: email, archived_at: null,
  };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO media (key, mime, bytes, width, height, alt, filename, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(row.key, row.mime, row.bytes, row.width, row.height, row.alt, row.filename, row.created_at, row.created_by),
    env.DB.prepare("INSERT INTO audit (at, email, action, target, detail) VALUES (?, ?, 'media.upload', ?, ?)").bind(now, email, key, row.filename),
  ]);
  return row;
}

export async function patch(env, key, body, email, now = Date.now()) {
  const row = await env.DB.prepare("SELECT key FROM media WHERE key = ?").bind(key).first();
  if (!row) throw new HttpError(404, "That image is not in the library.");
  const stmts = [];
  if (typeof body.alt === "string") {
    stmts.push(env.DB.prepare("UPDATE media SET alt = ? WHERE key = ?").bind(body.alt.trim().slice(0, 300), key));
    stmts.push(env.DB.prepare("UPDATE settings SET draft_rev = draft_rev + 1 WHERE id = 1"));
  }
  if (typeof body.archived === "boolean") {
    stmts.push(env.DB.prepare("UPDATE media SET archived_at = ? WHERE key = ?").bind(body.archived ? now : null, key));
  }
  if (!stmts.length) throw new HttpError(400, "Nothing to change.");
  stmts.push(env.DB.prepare("INSERT INTO audit (at, email, action, target, detail) VALUES (?, ?, 'media.update', ?, NULL)").bind(now, email, key));
  await env.DB.batch(stmts);
}

export async function serve(request, env, key) {
  if (!/^[a-f0-9]{64}\.(jpg|png|webp|gif)$/.test(key)) return new Response("Not found", { status: 404 });
  const obj = await env.MEDIA.get(key, { onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (!obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}
