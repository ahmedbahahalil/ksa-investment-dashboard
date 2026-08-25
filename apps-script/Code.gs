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
 * Prices (and optional daily closes) come from Yahoo Finance (ticker + ".SR"),
 * fetched in parallel via UrlFetchApp.fetchAll — one request per ticker, since
 * hitting the same ticker twice in a run gets the second call rate-limited.
 * It's an unofficial endpoint; if a price comes back 0 the old price is kept.
 * Swap fetchMarket_() if you have a better data source.
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
  // ?history=3mo also returns daily closes so the dashboard can backfill its History tab.
  // History is only needed for held positions, so it takes its own (shorter) ticker list.
  var range = e && e.parameter && e.parameter.history;
  if (range === "1") range = "3mo";
  var histT = range
    ? ((e.parameter.histTickers || e.parameter.tickers) || "").split(",")
        .map(function (s) { return s.trim(); }).filter(String)
    : [];
  var inHist = {};
  histT.forEach(function (t) { inHist[t] = true; });

  // Each ticker is fetched ONCE: held names come back with their history, the rest price-only.
  var withHist = fetchMarket_(histT, range);
  var priceOnly = fetchMarket_(tickers.filter(function (t) { return !inHist[t]; }), null);

  var prices = {};
  Object.keys(priceOnly.prices).forEach(function (t) { prices[t] = priceOnly.prices[t]; });
  Object.keys(withHist.prices).forEach(function (t) { prices[t] = withHist.prices[t]; });

  var out = { prices: prices, asOf: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm") };
  if (range) {
    out.closes = withHist.closes;
    // surfaced so a failure is diagnosable from the browser rather than guessed at
    out.closesInfo = { asked: histT.length, ok: Object.keys(withHist.closes).length, codes: withHist.codes };
  }
  var json = JSON.stringify(out);
  // JSONP: Apps Script sends no CORS headers, so the dashboard loads this via a <script> tag
  // and passes ?callback=fn. Wrap the JSON in that call. (Plain ?tickers=… still returns JSON.)
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/**
 * One request per ticker returns BOTH the current price and (when `range` is given)
 * that ticker's daily closes — the chart payload already carries both.
 * Fetching a ticker twice in one run gets the second call throttled by Yahoo, which
 * is exactly why history used to come back empty while prices succeeded.
 * Returns { prices:{t:price}, closes:{t:{date:close}}, codes:{t:httpStatus} }.
 */
function fetchMarket_(tickers, range) {
  tickers = (tickers || []).map(function (t) { return (t || "").trim(); }).filter(String);
  var out = { prices: {}, closes: {}, codes: {} };
  if (!tickers.length) return out;
  var requests = tickers.map(function (t) {
    return {
      url: "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(t) + ".SR"
         + (range ? "?range=" + encodeURIComponent(range) + "&interval=1d" : ""),
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0" }
    };
  });
  var responses;
  try { responses = UrlFetchApp.fetchAll(requests); }
  catch (e) { out.codes.__fetchAll = String(e); return out; }

  responses.forEach(function (resp, i) {
    var tk = tickers[i];
    try {
      var code = resp.getResponseCode();
      out.codes[tk] = code;
      if (code !== 200) return;
      var r = JSON.parse(resp.getContentText());
      r = r && r.chart && r.chart.result && r.chart.result[0];
      if (!r) return;
      var p = r.meta && r.meta.regularMarketPrice;
      if (p) out.prices[tk] = Number(p);
      if (!range) return;
      var ts = r.timestamp;
      var cl = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
      if (!ts || !cl) return;
      var m = {};
      ts.forEach(function (t, k) {
        var c = cl[k];
        if (c === null || c === undefined) return;              // market holiday / missing bar
        m[Utilities.formatDate(new Date(t * 1000), TIMEZONE, "yyyy-MM-dd")] = Math.round(c * 100) / 100;
      });
      out.closes[tk] = m;
    } catch (err) { out.codes[tk] = "parse:" + err; }
  });
  return out;
}

// Current prices only (used by the daily cron).
function fetchPrices_(tickers) { return fetchMarket_(tickers, null).prices; }

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
