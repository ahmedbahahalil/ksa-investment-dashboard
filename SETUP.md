# Cloud sync + daily prices — one-time setup

The dashboard runs as a static page (GitHub Pages). To sync the same data across
your **phone and laptop**, it stores one private file — `ksa-portfolio.json` — in
**your own Google Drive**. There's no server: the browser talks to Google directly.

You do this once. ~15 minutes. Steps 1–2 turn on sync; step 3 adds daily auto-prices.

**Live dashboard:** `https://ahmedbahahalil.github.io/ksa-investment-dashboard/`
(public page, **private data** — a visitor sees an empty shell and a sign-in button).

---

## Part 1 — Create the Google sign-in (OAuth client)

Use your Fariiq Workspace account (you're the admin, so "Internal" works and skips Google's app-verification).

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)** → top bar → **Create Project** (e.g. "Investment Dashboard"). Select it.
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **Internal** → Create.
   - App name: `Investment Dashboard`, user support email: you, developer email: you → **Save and continue** through the rest.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Name: `Dashboard web`.
   - **Authorized JavaScript origins → Add URI** (add both):
     - `https://ahmedbahahalil.github.io`
     - `http://localhost:4321`  *(so it also works when testing locally)*
   - **Create** → copy the **Client ID** (looks like `1234567890-abc123.apps.googleusercontent.com`).

> Note: the Client ID is **not a secret** — it's meant to live in the browser. Security comes from the authorized origins above + your Google sign-in, not from hiding it.

---

## Part 2 — Connect the dashboard

1. Open the dashboard (live URL above, or locally).
2. Top-right → **☁ Connect Drive** → paste the **Client ID** → continue.
3. Google sign-in opens → choose your account → allow access to its own file in Drive.
4. The chip turns to **● Synced · <you>**. Done — open the same URL on your phone, **Connect Drive**, sign in, and it pulls the same data.

**How sync behaves:** on connect, the dashboard loads whatever is in Drive (Drive is the source of truth); your edits push up automatically a moment later. Use one device at a time to be safe; **Backup** (JSON export) is always your safety net.

---

## Part 3 — Daily price auto-refresh (optional)

A small Google Apps Script updates prices in that same Drive file once a day.

1. Go to **[script.google.com](https://script.google.com)** → **New project**.
2. Delete the placeholder, paste the entire contents of **`apps-script/Code.gs`** from this repo → **Save**.
3. Run **`installDailyTrigger`** once (top toolbar: select the function → Run). Authorize Drive access when prompted.
4. (Optional) Run **`refreshPrices`** once now to test — check **Execution log** for `✓ 4009 → …` lines.

It then runs daily ~20:00 Riyadh (after Tadawul close). Prices flow into the dashboard next time it syncs.

> The price source is Yahoo Finance (`<ticker>.SR`) — an unofficial endpoint. If a price returns 0 the old one is kept, and the log tells you. If Yahoo stops working, swap `fetchPrice_()` for another source.

---

## Troubleshooting

- **"Connect Drive" does nothing / popup blocked** → allow popups for the site, click again.
- **`redirect_uri_mismatch` / `origin` error** → the page's origin isn't in *Authorized JavaScript origins*. Re-check Part 1 step 4 (origin is scheme + host only, no path).
- **Sign-in blocked for your account** → the consent screen must be **Internal** and you must sign in with a Workspace-org account.
- **Prices not updating** → run `refreshPrices` manually and read the Execution log; confirm `ksa-portfolio.json` exists in your Drive (it's created the first time you Connect Drive).
- **Move data to a personal account later** → just **Backup** the JSON and **Import** it after connecting the other account. You're never locked in.
