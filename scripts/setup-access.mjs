// Creates the Cloudflare Access application that guards /studio, then writes its settings
// into wrangler.jsonc. Safe to run again: it reuses what already exists.
//
// Needs a Cloudflare API token in the file .cf-token (git-ignored) with two account permissions:
//   Access: Apps and Policies - Edit
//   Access: Organizations, Identity Providers, and Groups - Edit
//
//   node scripts/setup-access.mjs editor1@example.org editor2@example.org

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT = "8afd780e5b02e96116de10d340a9f48c";
const APP_NAME = "NY Metro Coalition site editor";
const HOSTS = ["nymetrocoalition.org/studio", "staging.nymetrocoalition.org/studio"];

const emails = process.argv.slice(2).map((e) => e.toLowerCase());
if (!emails.length || emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
  console.error("Give the editors' email addresses, e.g. node scripts/setup-access.mjs a@x.org b@y.org");
  process.exit(1);
}
const tokenFile = join(root, ".cf-token");
if (!existsSync(tokenFile)) {
  console.error("Save the API token in ny-mcfh/.cf-token first (see the top of this script).");
  process.exit(1);
}
const token = readFileSync(tokenFile, "utf8").trim();

async function cf(method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) {
    throw new Error(`${method} ${path} failed (${r.status}): ${JSON.stringify(d.errors || d).slice(0, 300)}`);
  }
  return d.result;
}

// 1. Team domain
const org = await cf("GET", "/access/organizations");
const team = org && org.auth_domain;
if (!team) throw new Error("No Zero Trust team found on this account.");
console.log("Team domain:", team);

// 2. Email one-time code sign-in
const idps = await cf("GET", "/access/identity_providers");
let otp = idps.find((i) => i.type === "onetimepin");
if (!otp) {
  otp = await cf("POST", "/access/identity_providers", { name: "One-time PIN", type: "onetimepin", config: {} });
  console.log("Added one-time PIN sign-in.");
}

// 3. Application and its allow-list
const policy = { name: "Editors", decision: "allow", include: emails.map((email) => ({ email: { email } })) };
const spec = {
  name: APP_NAME, type: "self_hosted", domain: HOSTS[0],
  destinations: HOSTS.map((uri) => ({ type: "public", uri })),
  session_duration: "168h", allowed_idps: [otp.id], auto_redirect_to_identity: true,
  http_only_cookie_attribute: true, same_site_cookie_attribute: "lax",
  policies: [policy],
};
const apps = await cf("GET", "/access/apps");
let app = apps.find((a) => a.name === APP_NAME);
app = app ? await cf("PUT", `/access/apps/${app.id}`, spec) : await cf("POST", "/access/apps", spec);
console.log("Application:", app.name, "| editors:", emails.join(", "));
console.log("AUD:", app.aud);

// 4. Tell the Worker
const cfgFile = join(root, "wrangler.jsonc");
let cfg = readFileSync(cfgFile, "utf8");
const set = (k, v) => {
  const re = new RegExp(`("${k}":\\s*)"[^"]*"`);
  if (!re.test(cfg)) throw new Error(`${k} not found in wrangler.jsonc`);
  cfg = cfg.replace(re, `$1"${v}"`);
};
set("ACCESS_TEAM_DOMAIN", team);
set("ACCESS_AUD", app.aud);
writeFileSync(cfgFile, cfg);
console.log("\nwrangler.jsonc updated. Now run: wrangler deploy");
