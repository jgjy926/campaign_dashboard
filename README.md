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
- **Import from T&C JSON** — run the shipped prompt on a campaign's T&C in any AI, paste the
  JSON back, review the preview, register. See
  [docs/tnc-to-json-prompt.md](docs/tnc-to-json-prompt.md).
- **SMS upload** — drag a screenshot of the bank's confirmation as proof.
- **Ask** — NotebookLM-style Q&A grounded in your campaign data + T&C text (Cloudflare
  Workers AI, optional Gemini fallback). Numbers come from the deterministic engine.

## Registering a campaign from its T&C
Instead of typing a campaign in by hand:

1. **Manage → Import JSON → Copy prompt**, then run that prompt against the campaign's T&C in
   any AI (the prompt lives in `frontend/src/lib/importPrompt.js`; `npm run prompt:doc`
   regenerates [docs/tnc-to-json-prompt.md](docs/tnc-to-json-prompt.md) from it).
2. Paste the JSON it returns into the import box — or drop a `.json` file on it. Fenced code
   blocks, a bare array, a single object, `"5%"`, `31/12/2026` and `RM 1,000` all parse.
3. The preview shows each campaign it found: the resolved values, the month rows that will be
   generated, anything the T&C never stated (amber), likely duplicates, and the verbatim T&C
   sentence behind each number. Edit anything, untick what you don't want.

   The earning rate is filled in whatever way the T&C words the reward: "5%", "RM1 for every
   RM20 spent" (5%) or "spend RM500, get RM30" (6% effective, capped at RM30, min spend RM500).
   The AI records the reward as stated in `reward`; the importer redoes the arithmetic itself
   and shows the working under each derived number.
4. Cards are fuzzy-matched by bank + product name; when nothing matches you pick a card or
   create one from the T&C's own wording.
5. **Register** writes them in one go. Nothing touches the document before that click.

Imported campaigns keep their provenance (`import_meta`: source document, confidence, evidence
quotes, and the working behind any derived value), visible under the campaign's detail view — so a rate can be checked against the clause
that produced it months later.

## Frontend (`frontend/`)
```bash
cd frontend
npm install
cp .env.example .env        # fill VITE_WORKER_URL (or leave blank for local-only)
npm run dev                 # http://localhost:5173
npm test                    # unit tests (selectors + cycles)
npm run build               # static output in dist/
```
Leaving `.env` blank runs the app fully local (offline) — the cloud calls are skipped. With a
URL set, each device enters the access token once by clicking the sync badge. The token stays
in that device's storage and is never built into the page or the APK.

### Deploy to GitHub Pages
```bash
VITE_BASE=/<repo-name>/ npm run build
# publish frontend/dist to the gh-pages branch (or via GitHub Actions)
```

### Android app (Capacitor)
`frontend/android/` wraps the same SPA in a native WebView, so it has every feature of the
web app and talks to the same Worker (`VITE_WORKER_URL` from `.env` is baked in at build time;
the token is entered on the phone). The WebView's origin is `https://localhost`, which the Worker's CORS
already allows. Needs Android Studio installed (for its JDK and the Android SDK):
```bash
# Windows: set JAVA_HOME to Android Studio's bundled JDK first
#   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run android:apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```
Copy the APK to the phone and open it (allow "install unknown apps" for your file manager).
Rebuild after any frontend change.
Data lives in the app's own IndexedDB and syncs through Koofr like any other browser.

## Worker (`worker/`)
```bash
cd worker
npm install
# set secrets (never committed):
powershell -File scripts/rotate-token.ps1  # generates APP_API_KEY; each device then enters it
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
