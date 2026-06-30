# KSA Passive Income Dashboard

A single-file dashboard for running the Stake (real estate) + Sahm (Tadawul stocks)
passive-income plan. No build step, no server, no account — open the file and go.

## Run it

- **Hosted (phone + laptop):** `https://ahmedbahahalil.github.io/ksa-investment-dashboard/`
- **Local:** double-click **`index.html`**.

By default your data is saved in that browser only (`localStorage`). To sync the **same
data across phone and laptop**, click **☁ Connect Drive** (top-right) — it stores one
private file in your own Google Drive. One-time setup is in **[SETUP.md](SETUP.md)**
(includes optional daily auto-pricing via `apps-script/Code.gs`).

- The hosted page is public; your **data is private** (in your Drive, behind Google sign-in).
- **Backup** (top-right) downloads a JSON copy; **Import** loads one back — your safety net and the way to move data between Google accounts.

## The monthly workflow (≈5 min)

1. Open the dashboard → **Holdings** tab. Update each stock's **price** with the live
   Sahm price (and set the "Prices last updated" date). This is the only manual data entry.
2. Go to **Monthly plan**. It shows exactly how many shares of each stock to buy this
   month, plus the Stake deposit. **Export CSV** if you want a checklist.
3. Place those orders yourself in the Sahm app + Stake (Sahm has no trading API).
4. Back in **Holdings**, add the shares you bought to the **shares** column.
5. (Optional) Log the trade and any dividends received under **Logs**.

Next month, repeat — the plan recalculates from your updated holdings.

## How the monthly plan decides what to buy

It takes the month's stock budget (default 650 SAR = 65% of 1,000) and buys whole shares
to get the portfolio **as close as possible to your target weights** — directing cash to
whatever is most underweight, never selling. High-priced, low-weight names (e.g. ACWA Power
at ~320 SAR for a 7.5% slot) are intentionally skipped early and bought later once the
portfolio is large enough that one share doesn't overshoot the target. Small leftover cash
("carry") rolls into next month.

## Tabs

- **Dashboard** — totals, platform split (Sahm vs Stake), sector allocation, target-vs-current.
- **Monthly plan** — the buy list + CSV export.
- **Holdings** — your source of truth. Editable: tickers, weights, prices, shares, yields.
- **Income** — 5-year projection from your inputs (budget, split, yields, reinvest toggle).
- **Logs** — trade log and dividend log.

## Important caveats

- **Seed prices and yields are placeholders.** Replace them with real Sahm/Tadawul figures
  before trusting any number. The 12 seed stocks and weights come straight from your plan.
- **Projections are income-only** (dividends + Stake rental yield) and **exclude** any
  share-price gains or losses. They are a transparent model, not a forecast or a guarantee.
- **Not investment advice.** The tool tracks *your* plan and does the arithmetic; it doesn't
  recommend what to own.
- **Tax:** as a Saudi-resident individual, your Tadawul dividends are generally **not** subject
  to personal income tax or withholding — the 5% withholding tax applies to non-resident
  shareholders, so the plan's "dividends are subject to withholding" note doesn't apply to you.
  Zakat may apply to your wealth; confirm specifics with a specialist.

## Why a single HTML file (not a Vite/npm project)

For a tool one person uses monthly, "open the file, it works offline, data persists" beats
"run `npm install` first." It's still React with hooks, and it's still a static file you can
host on Vercel/GitHub Pages by dropping `index.html` there. If you later want to extend it
(live price feed, Google Sheets sync, more charts), it converts cleanly to a full project.

## Possible next steps

- **Live prices:** wire a Tadawul/market-data API so prices update themselves (removes the
  one manual step). Most free APIs don't cover Tadawul well — may need a paid feed.
- **Google Sheets sync:** if you'd rather keep the source of truth in Sheets, the dashboard
  can read a published sheet via the Sheets API. (The dashboard currently *replaces* the
  4-tab sheet from the plan — Holdings = Portfolio Setup, Logs = Holdings/Dividend logs,
  and the tracker is computed.)
- **Deploy:** drop `index.html` on Vercel/Netlify/GitHub Pages for access from your phone.

---
Built as Phase 1b of the KSA passive-income plan. Sahm has no public trading API, so execution
stays manual — this dashboard is the rebalancing brain; you are the hands.
