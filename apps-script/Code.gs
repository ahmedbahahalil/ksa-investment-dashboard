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
 * Price source is Yahoo Finance (ticker + ".SR"). It's an unofficial endpoint
 * and may rate-limit or change — check the execution log; if a price comes back
 * 0 the old price is kept. Swap fetchPrice_() if you have a better data source.
 */

var PORTFOLIO_FILE = "ksa-portfolio.json";
var REFRESH_HOUR   = 16;            // ~1h after the 15:00 Tadawul close (Sun–Thu) — captures the closing price
var TIMEZONE       = "Asia/Riyadh";

function refreshPrices() {
  var file = findPortfolioFile_();
  if (!file) { Logger.log("✗ " + PORTFOLIO_FILE + " not found in Drive — connect the dashboard first."); return; }

  var data = JSON.parse(file.getBlob().getDataAsString());
  var holdings = data.holdings || [];
  var updated = 0;

  holdings.forEach(function (h) {
    if (!h.ticker) return;
    var price = fetchPrice_(h.ticker);
    if (price > 0) { h.price = price; updated++; Logger.log("✓ " + h.ticker + " → " + price); }
    else { Logger.log("· " + h.ticker + " — no price, kept " + h.price); }
  });

  data.settings = data.settings || {};
  data.settings.pricesUpdated = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd") + " (auto)";
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
  var prices = {};
  tickers.forEach(function (t) { var p = fetchPrice_(t); if (p > 0) prices[t] = p; });
  var out = { prices: prices, asOf: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm") };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function fetchPrice_(ticker) {
  try {
    var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker) + ".SR";
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { "User-Agent": "Mozilla/5.0" } });
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
