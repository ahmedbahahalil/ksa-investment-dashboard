/**
 * KSA Passive Income Dashboard — daily price refresh.
 *
 * Runs inside YOUR Google account, finds the dashboard's "ksa-portfolio.json"
 * in your Drive, updates each holding's price, and saves it back. The dashboard
 * picks up the new prices next time it syncs. No external server.
 *
 * One-time setup:
 *   1. script.google.com → New project → paste this whole file → Save.
 *   2. Run installDailyTrigger() once (authorize Drive access when prompted).
 *   3. Optionally run refreshPrices() once to test it now.
 *
 * Prices are fetched from Yahoo Finance (ticker + ".SR") in parallel via
 * UrlFetchApp.fetchAll — fast even for a long watchlist. It's an unofficial
 * endpoint and may rate-limit; if a price comes back 0 the old price is kept.
 * Swap fetchPrices_()/parsePrice_() if you have a better data source.
 */

var PORTFOLIO_FILE = "ksa-portfolio.json";
var REFRESH_HOUR   = 16;            // ~1h after the 15:00 Tadawul close (Sun–Thu) — captures the closing price
var TIMEZONE       = "Asia/Riyadh";

function refreshPrices() {
  var file = findPortfolioFile_();
  if (!file) { Logger.log("✗ " + PORTFOLIO_FILE + " not found in Drive — connect the dashboard first."); return; }

  var data = JSON.parse(file.getBlob().getDataAsString());
  var holdings = data.holdings || [];
  var prices = fetchPrices_(holdings.map(function (h) { return h.ticker; }));
  var updated = 0;

  holdings.forEach(function (h) {
    var price = prices[h.ticker];
    if (price > 0) { h.price = price; updated++; Logger.log("✓ " + h.ticker + " → " + price); }
    else { Logger.log("· " + h.ticker + " — no price, kept " + h.price); }
  });

  data.settings = data.settings || {};
  data.settings.pricesUpdated = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd") + " (auto)";

  // Day-over-day: upsert one close snapshot per day, matching the dashboard's history.
  var r2 = function (n) { return Math.round((Number(n)||0)*100)/100; };
  var equity = 0, pl = 0, snapPrices = {};
  holdings.forEach(function (h) {
    var p = Number(h.price)||0, sh = Number(h.shares)||0, a = Number(h.avgCost)||0;
    equity += p*sh; if (a>0) pl += (p-a)*sh;
    if (h.ticker) snapPrices[h.ticker] = r2(p);
  });
  var cash = Number(data.cash)||0, stake = (data.stake && Number(data.stake.currentValue))||0;
  var today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  var hist = (data.history||[]).filter(function (x) { return x.date !== today; });
  hist.push({ date: today, value: r2(equity+cash+stake), equity: r2(equity), cash: r2(cash), pl: r2(pl), prices: snapPrices });
  hist.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  data.history = hist;

  data.updatedAt = Date.now();
  file.setContent(JSON.stringify(data));
  Logger.log("Done — updated " + updated + " of " + holdings.length + " prices.");
}

/**
 * Live-price endpoint for the dashboard's "fetch-on-open".
 * Deploy this script as a Web App (Execute as: Me, Who has access: Anyone) and
 * paste the URL into the dashboard. Returns ONLY public prices — no portfolio data —
 * so it's safe to expose. The browser can't fetch Yahoo directly (CORS); this can.
 *   GET <webapp-url>?tickers=4009,1303,4220,4327
 *   → { "prices": {"4009":31.86, ...}, "asOf": "2026-06-30 14:32" }
 */
function doGet(e) {
  var tickers = ((e && e.parameter && e.parameter.tickers) || "")
    .split(",").map(function (s) { return s.trim(); }).filter(String);
  var prices = fetchPrices_(tickers);
  var out = { prices: prices, asOf: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm") };
  var json = JSON.stringify(out);
  // JSONP: Apps Script sends no CORS headers, so the dashboard loads this via a <script> tag
  // and passes ?callback=fn. Wrap the JSON in that call. (Plain ?tickers=… still returns JSON.)
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// Fetches all tickers in PARALLEL (UrlFetchApp.fetchAll) — ~1–2s for 16 vs ~15s one-by-one.
function fetchPrices_(tickers) {
  tickers = (tickers || []).map(function (t) { return (t || "").trim(); }).filter(String);
  var out = {};
  if (!tickers.length) return out;
  var requests = tickers.map(function (t) {
    return {
      url: "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(t) + ".SR",
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0" }
    };
  });
  var responses;
  try { responses = UrlFetchApp.fetchAll(requests); } catch (e) { return out; }
  responses.forEach(function (resp, i) {
    var p = parsePrice_(resp);
    if (p > 0) out[tickers[i]] = p;
  });
  return out;
}

function parsePrice_(resp) {
  try {
    if (resp.getResponseCode() !== 200) return 0;
    var j = JSON.parse(resp.getContentText());
    var meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
    return meta && meta.regularMarketPrice ? Number(meta.regularMarketPrice) : 0;
  } catch (e) { return 0; }
}

function findPortfolioFile_() {
  var it = DriveApp.getFilesByName(PORTFOLIO_FILE);
  return it.hasNext() ? it.next() : null;
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "refreshPrices") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("refreshPrices").timeBased().everyDays(1).atHour(REFRESH_HOUR).inTimezone(TIMEZONE).create();
  Logger.log("Daily trigger installed — refreshPrices() runs ~" + REFRESH_HOUR + ":00 " + TIMEZONE + ".");
}
