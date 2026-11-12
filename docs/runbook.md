# Runbook

One Cloudflare Worker (`ny-mcfh`) renders the site and the editor. Content is in D1
(`ny-mcfh-db`), images in R2 (`ny-mcfh-r2-media`). Account: the one `wrangler whoami` shows.

## Everyday

```bash
npm test                 # unit tests (content, time, rendering)
npm run dev              # http://localhost:8794  (editor at /studio, signed in as dev@localhost)
npm run seed:local       # first time only: fill the local database and bucket
wrangler deploy          # ship code changes
```

Content changes never need a deploy. Editors make them at `/studio`.

Local dev cannot fire the cron trigger (`/cdn-cgi/handler/scheduled` errors with static
assets enabled). The logic is covered by `test/content.test.mjs`, and production cron was
verified on 2026-11-11 by planting a due version and watching it go live.

## Where things are

| Thing | Where |
| --- | --- |
| Staging | https://staging.nymetrocoalition.org (noindex) |
| Editor | `/studio` on either hostname, behind Cloudflare Access |
| Draft | D1 table `items` |
| Versions | D1 table `releases`; `settings.current_release_id` is the live one |
| Who did what | D1 table `audit` |
| Original static site | `legacy/` here, tag `static-v1`, and branch `main` (GitHub Pages) |

## Turning on sign-in (once)

1. Cloudflare dashboard, Zero Trust, Access, Applications: add a **self-hosted** application.
   Do not use the Access tab on the Worker itself; that would lock the whole public site.
2. Application domains: `staging.nymetrocoalition.org` path `studio`, and
   `nymetrocoalition.org` path `studio`.
3. Policy: Allow, Include, Emails: each editor's address. Login method: One-time PIN.
4. Session duration: 1 week or longer. Cookie settings: SameSite Lax, HttpOnly on.
5. Copy the application's **AUD tag** and your team domain (`<team>.cloudflareaccess.com`)
   into `wrangler.jsonc` as `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`, then `wrangler deploy`.

Until step 5 the editor refuses everyone. Check afterwards:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://staging.nymetrocoalition.org/studio/api/state   # 302 or 401, never 200
```

Adding or removing an editor is a change to the policy's email list. No deploy.

## Images on their own hostname (recommended before cutover)

```bash
wrangler r2 bucket domain add ny-mcfh-r2-media --domain media.nymetrocoalition.org --zone-id <zone id from the dashboard overview>
```

Then set `MEDIA_BASE` to `https://media.nymetrocoalition.org` in `wrangler.jsonc` and deploy.
This keeps image requests off the Worker's daily request allowance. `/media/<key>` on the
Worker keeps working either way.

## Cutover to the live domain

The live domain's DNS already points at GitHub Pages through Cloudflare. A Worker route goes
in front of it; no DNS change.

1. Sign-in is on and tested on staging. A publish and a restore have been done on staging.
2. Add to `routes` in `wrangler.jsonc`:
   ```jsonc
   { "pattern": "nymetrocoalition.org/*", "zone_name": "nymetrocoalition.org" },
   { "pattern": "www.nymetrocoalition.org/*", "zone_name": "nymetrocoalition.org" }
   ```
3. `wrangler deploy`, then load the site, sign in at `/studio`, publish something small.

**Undo:** remove those two routes and deploy. Traffic falls back to GitHub Pages, which still
serves branch `main`. Keep `main` as the static site; do not merge `cms` into it while it is
the fallback.

## Backup

```bash
wrangler d1 export ny-mcfh-db --remote --output backup-$(date +%F).sql
```

D1 also keeps 7 days of point-in-time history (`wrangler d1 time-travel`). Images in R2 are
never deleted by the editor.

## Emergency: put an old version back without the editor

```bash
wrangler d1 execute ny-mcfh-db --remote --command "SELECT id, published_at, note FROM releases WHERE status='published' ORDER BY created_at DESC LIMIT 10"
wrangler d1 execute ny-mcfh-db --remote --command "UPDATE settings SET current_release_id='<id>' WHERE id=1"
```
