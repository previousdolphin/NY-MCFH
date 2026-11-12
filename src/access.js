// Who is editing. Cloudflare Access sits in front of /studio and signs a token for each
// request; this checks that token itself, so the editor stays closed even if the Access
// application is misconfigured or removed.

import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks, jwksIssuer;

export async function getEditor(request, env) {
  // Local development only: needs the variable (kept in .dev.vars) and a localhost address.
  if (env.DEV_EDITOR_EMAIL) {
    const host = new URL(request.url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return { email: env.DEV_EDITOR_EMAIL };
  }
  const team = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!team || !aud) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const issuer = `https://${team}`;
  if (jwksIssuer !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksIssuer = issuer;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud, algorithms: ["RS256"] });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email || (payload.type && payload.type !== "app")) return null;
    return { email };
  } catch {
    return null;
  }
}
