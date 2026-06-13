# C.B Campaign Tracker

A serverless, local-first cashback-campaign tracker. The browser SPA works fully offline
against IndexedDB and (optionally) syncs through a Cloudflare Worker to Koofr cloud storage,
which holds `campaigns.json` and a `/media/` folder of uploaded T&C snapshots and SMS images.
Everything runs on free tiers (GitHub Pages + Cloudflare Workers + Koofr).

```
Static SPA (GitHub Pages) ⇄ Cloudflare Worker (auth + proxy) ⇄ Koofr (WebDAV)
        ⇅
   IndexedDB / LocalForage (local-first cache)
```

## What it does
- **Cards & campaigns** with multi-month windows.
- **Monthly tracker** — one row per month: type your spend, tick when cashback lands.
- **Dashboard** — active progress (qualify / cap), upcoming countdown, "Next Best Card"
  (where the next ringgit earns most), and a reconciliation ledger that flashes overdue payouts.
- **T&C upload** — drop the Terms PDF, snapshot a page, extract its text (grounds the AI).
- **SMS upload** — drag a screenshot of the bank's confirmation as proof.
- **Ask** — NotebookLM-style Q&A grounded in your campaign data + T&C text (Cloudflare
  Workers AI, optional Gemini fallback). Numbers come from the deterministic engine.

## Frontend (`frontend/`)
```bash
cd frontend
npm install
cp .env.example .env        # fill VITE_WORKER_URL + VITE_APP_API_KEY (or leave blank for local-only)
npm run dev                 # http://localhost:5173
npm test                    # unit tests (selectors + cycles)
npm run build               # static output in dist/
```
Leaving `.env` blank runs the app fully local (offline) — the cloud calls are skipped.

### Deploy to GitHub Pages
```bash
VITE_BASE=/<repo-name>/ npm run build
# publish frontend/dist to the gh-pages branch (or via GitHub Actions)
```

## Worker (`worker/`)
```bash
cd worker
npm install
# set secrets (never committed):
npx wrangler secret put APP_API_KEY        # must equal frontend VITE_APP_API_KEY
npx wrangler secret put KOOFR_AUTH_HEADER  # "Basic " + base64(koofr-email:app-password)
npx wrangler secret put GEMINI_API_KEY     # optional fallback brain
# edit wrangler.toml: ALLOWED_ORIGIN (your Pages URL), KOOFR_DAV_BASE, paths
npx wrangler dev                           # local
npx wrangler deploy                        # production
```

### Koofr credentials
Create an **app password** in Koofr (Account → Preferences → Password → App passwords) and use
HTTP Basic auth: `KOOFR_AUTH_HEADER = "Basic " + base64("you@email:apppassword")`. Confirm your
WebDAV base path; the default is `https://app.koofr.net/dav/Koofr`.

## API (Worker)
| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/sync` | Fetch `campaigns.json` (returns an empty doc if absent) |
| POST | `/api/save` | Replace `campaigns.json` with the posted state |
| POST | `/api/upload-snapshot` | Store a PNG/image into `/media/` (FormData: `name`, `file`) |
| POST | `/api/ask` | Grounded Q&A: `{ question, context }` → `{ answer, citations }` |

All endpoints require the `X-App-Auth` header to equal `APP_API_KEY`.

## Sync model
Read-through / write-behind: on load, render from IndexedDB instantly, then pull remote and adopt
it only if its `last_updated` is newer. Mutations write locally at once and trigger a 3-second
debounced `POST /api/save`.
