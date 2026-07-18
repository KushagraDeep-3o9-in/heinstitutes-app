# heinstitutes-app

SEO-optimized, server-rendered directory of Indian higher-education institutes
(AISHE data) for `nearme.3o9.in/india-heinstitutes`, built to slot in behind
your existing nginx without breaking any already-indexed URL.

## Why the URLs match byte-for-byte

Your live URL:
```
/india-heinstitutes/Andhra%20Pradesh/Anantapur/BHARTIYA%20...%20UNIVERSITY%20(Id:%20U-1132)
```
Notice spaces are `%20` but `(`, `)`, `:` are left **literal** — that's what
`encodeURI()` produces, not `encodeURIComponent()` (which would also escape
`:`). `utils/slug.js` replicates this exactly, so this app generates and
accepts the identical URL shape. That means the nginx switch in
`nginx/nearme.conf` is a **swap, not a redirect chain** — Google's already-
indexed URLs keep 200-ing on day one, no lost link equity, no crawl-budget
waste on 301s.

If an institute's name/state/district changes in the data later, the route
still finds it by `aisheCode` (parsed out of `(Id: ...)`) and issues a single
clean 301 to the new canonical URL — so you never silently 404 a page Google
already ranks.

## Setup

For production deployment on your server (PM2 + nginx cutover), see
**DEPLOY.md** — this section is just for local dev.

```bash
cp .env.example .env   # fill in MONGODB_URI for the SEPARATE cluster, SITE_ORIGIN, ADSENSE_CLIENT_ID
npm install
npm start               # or `npm run dev` with nodemon
```

Runs on `PORT` (default 3001) — deliberately a different port from your
existing app so both can run side by side during testing.

## Routes

| Route | Purpose |
|---|---|
| `/india-heinstitutes` | State-level hub (top of funnel) |
| `/india-heinstitutes/:state` | District-level hub |
| `/india-heinstitutes/:state/:district` | Paginated institute listing |
| `/india-heinstitutes/:state/:district/:name (Id: code)` | Institute detail page — money page |
| `/india-heinstitutes/sitemap.xml` | Sitemap index |
| `/india-heinstitutes/sitemap-hub.xml` | Hub-page sitemap |
| `/india-heinstitutes/sitemap-state-<state>.xml` | Per-state institute sitemap (chunked to stay under the 50k-URL sitemap limit) |
| `/robots.txt` | Points at the sitemap index |

## Deployment / cutover checklist

1. Deploy this app on the server, run it under PM2 on port `3001` (or your
   choice), pointed at the **separate** Mongo cluster.
2. Spot-check a handful of already-indexed URLs directly against port 3001
   (bypass nginx) — confirm identical content/canonical/status.
3. Submit `/india-heinstitutes/sitemap.xml` in Search Console *before* the
   cutover so it's already crawled once against the new app.
4. Drop in `nginx/nearme.conf`'s `location /india-heinstitutes { ... }`
   block, `nginx -t`, then `systemctl reload nginx`. This is the actual
   cutover — everything else on the domain is untouched.
5. Watch Search Console Coverage + server logs for a few days for any 404/500
   spikes on paths you didn't anticipate (e.g. an old query-string pagination
   scheme, if the legacy app had one you didn't replicate here).
6. Once stable, decommission the old `/india-heinstitutes` code path in the
   legacy app (keep the legacy app running for the rest of the site).

## Important AdSense / Search-quality caveat

Programmatic pages built straight off a government dataset are exactly the
shape Google's *helpful content* system and AdSense's *valuable content*
policy both scrutinize — thousands of near-identical pages differing mainly
in name/address. Mitigations already built in:

- FAQ answers are computed **from the data itself** (program counts, intake
  totals, levels offered), not boilerplate repeated verbatim across pages —
  each page's FAQ is genuinely different.
- Hub pages (state/district) exist so institute pages aren't orphaned leaves
  — this is real site structure, not a flat sitemap dump.
- `rel="nofollow"` on outbound official-website links.

Still, before turning on AdSense at scale:
- Get `ads.txt` published at your domain root pointing at your AdSense
  account (required by Google, separate from this app).
- Consider `noindex` on institute records that only have a name + address
  and nothing else (empty `programs` array, no `webSite`, no
  `yearOfEstablishment`) — thin pages there will hurt more than they earn.
  There's a natural place to add that check in `routes/institutes.js` where
  `programs` is already fetched.
- AdSense will manually reject a site with too high a thin-to-substantial
  page ratio at review time — you may want to launch AdSense against a
  filtered subset (institutes with ≥1 program on file) first, then expand.

## What's deliberately not built here

- Search/filter UI across institutes (would need a text index — easy add on
  `Institute` model if you want it: `name`, `stateName`, `districtName`).
- Auth/admin — this is a public read-only directory.
- Caching layer beyond the in-memory sitemap cache — add Redis if traffic
  outgrows a single Node process.
