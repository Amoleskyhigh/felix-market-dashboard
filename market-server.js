const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = 8899;
const SNAPSHOT_PATH = path.join(__dirname, 'docs', 'market-data-snapshot.json');
let lastGoodCreditSpread = null;
let lastPayloadCache = null;

const API_BUDGET_MS = 9000;

try {
  if (fs.existsSync(SNAPSHOT_PATH)) {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    if (Number.isFinite(snap?.creditSpread?.value)) {
      lastGoodCreditSpread = {
        value: snap.creditSpread.value,
        symbol: snap.creditSpread.symbol || 'BAMLH0A0HYM2',
        asOf: snap.creditSpread.asOf || null,
        source: snap.creditSpread.source || 'snapshot-cache',
        stale: true
      };
    }
  }
} catch {}

function fetchURL(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timeout ${timeoutMs}ms: ${url}`));
    });
    req.on('error', reject);
  });
}

async function fetchYahooChart(symbol, range = '1y', interval = '1d') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
    const raw = await fetchURL(url);
    const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    return {
      symbol,
      currentPrice: meta.regularMarketPrice ?? null,
      previousClose: meta.chartPreviousClose ?? null,
      timestamps: (result.timestamp || []).map(t => t * 1000),
      closes: result?.indicators?.quote?.[0]?.close || []
    };
  } catch {
    return null;
  }
}

async function fetchShillerPE() {
  try {
    const html = await fetchURL('https://www.multpl.com/shiller-pe/table/by-month');
    const rows = [];
    const regex = /<td>([A-Z][a-z]+\s+\d{1,2},\s+\d{4})<\/td>\s*<td>\s*[\s\S]*?([\d]+\.[\d]+)\s*<\/td>/g;
    let m;
    while ((m = regex.exec(html)) !== null) rows.push({ date: m[1], value: parseFloat(m[2]) });
    if (!rows.length) return { current: null, history: [] };
    return { current: rows[0].value, history: rows.slice(0, 120).reverse() };
  } catch {
    return { current: null, history: [] };
  }
}

async function fetchFearGreed() {
  try {
    const html = await fetchURL('https://feargreedmeter.com/');
    const m = html.match(/Fear\s+and\s+Greed\s+Index(?:\s+is\s+currently\s+at|:)\s*(\d{1,3})\s*\(([^)]+)\)/i)
      || html.match(/"value"\s*:\s*(\d{1,3})\s*,\s*"unitText"\s*:\s*"([^"]+)"/i);
    if (!m) return null;
    return { score: Math.max(0, Math.min(100, parseInt(m[1], 10))), rating: (m[2] || '').trim() };
  } catch {
    return null;
  }
}

async function fetchCreditSpread() {
  const urls = [
    'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2',
    'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2&cosd=2020-01-01',
    'https://fred.stlouisfed.org/series/BAMLH0A0HYM2/downloaddata/BAMLH0A0HYM2.csv'
  ];
  const parseCsv = (csv) => {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(',').map(s => s.replace(/"/g, '').trim());
      if (parts.length < 2) continue;
      const maybeDate = parts[0];
      const maybeValue = parts[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) continue;
      const v = Number.parseFloat(maybeValue);
      if (Number.isFinite(v)) return { value: v, asOf: maybeDate };
    }
    return null;
  };

  for (const u of urls) {
    try {
      const csv = execFileSync('curl', ['-LfsS', '--max-time', '12', u], {
        encoding: 'utf8',
        timeout: 15000
      });
      const parsed = parseCsv(csv);
      if (parsed) {
        const result = {
          value: parsed.value,
          asOf: parsed.asOf,
          symbol: 'BAMLH0A0HYM2',
          source: 'FRED:curl-fallback',
          stale: false
        };
        lastGoodCreditSpread = result;
        return result;
      }
    } catch {}
  }

  for (const u of urls) {
    try {
      for (let attempt = 0; attempt < 1; attempt++) {
        const csv = await fetchURL(u, 4500);
        const parsed = parseCsv(csv);
        if (parsed) {
          const result = {
            value: parsed.value,
            asOf: parsed.asOf,
            symbol: 'BAMLH0A0HYM2',
            source: 'FRED:fredgraph.csv',
            stale: false
          };
          lastGoodCreditSpread = result;
          return result;
        }
      }
    } catch {}
  }

  if (lastGoodCreditSpread?.value != null) {
    return { ...lastGoodCreditSpread, stale: true, source: 'cache:lastGoodCreditSpread' };
  }
  return null;
}

function loadSnapshotFallback() {
  try {
    if (!fs.existsSync(SNAPSHOT_PATH)) return null;
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    return { ...snap, stale: true, source: 'snapshot-fallback' };
  } catch {
    return null;
  }
}

function getCachedFallback() {
  return lastPayloadCache || loadSnapshotFallback() || { timestamp: Date.now(), stale: true, source: 'empty-fallback' };
}

async function fetchMarketBreadth() {
  try {
    const raw = await fetchURL('https://query1.finance.yahoo.com/v8/finance/chart/$S5TH?range=1mo&interval=1d', 10000);
    const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    const p = result?.meta?.regularMarketPrice;
    if (Number.isFinite(p) && p >= 0 && p <= 100) return { value: p, source: 'Barchart:$S5TH(yahoo)' };
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const last = closes.filter(v => Number.isFinite(v)).slice(-1)[0];
    if (Number.isFinite(last) && last >= 0 && last <= 100) return { value: last, source: 'Barchart:$S5TH(yahoo)' };
  } catch {}

  // Fallback: parse Barchart page
  try {
    const html = await fetchURL('https://www.barchart.com/stocks/quotes/$S5TH', 12000);
    const m = html.match(/"lastPrice"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i)
      || html.match(/"raw"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (m) {
      const v = parseFloat(m[1]);
      if (Number.isFinite(v) && v >= 0 && v <= 100) return { value: v, source: 'Barchart:$S5TH(page)' };
    }
  } catch {}
  return null;
}

async function fetchUsdTwd() {
  // Primary: Yahoo TWD=X
  const y = await fetchYahooChart('TWD=X');
  if (y?.currentPrice) return { ...y, source: 'Yahoo:TWD=X' };

  // Fallback: exchangerate.host
  try {
    const raw = await fetchURL('https://api.exchangerate.host/convert?from=USD&to=TWD');
    const j = JSON.parse(raw);
    const v = j?.result;
    if (Number.isFinite(v)) {
      return {
        symbol: 'USD/TWD',
        currentPrice: v,
        previousClose: null,
        timestamps: [Date.now()],
        closes: [v],
        source: 'exchangerate.host'
      };
    }
  } catch {}
  return null;
}

async function getAllData() {
  const [qqq, smh, boxx, spy, spx, ixic, sox, qld, vix, usdtwd, dxy, tnx, shiller, fearGreed, creditSpread, copper, breadth] = await Promise.all([
    fetchYahooChart('QQQ'), fetchYahooChart('SMH'), fetchYahooChart('BOXX'), fetchYahooChart('SPY'), fetchYahooChart('^GSPC'),
    fetchYahooChart('^IXIC'), fetchYahooChart('^SOX'), fetchYahooChart('QLD'), fetchYahooChart('^VIX'), fetchUsdTwd(),
    fetchYahooChart('DX-Y.NYB'), fetchYahooChart('^TNX'), fetchShillerPE(), fetchFearGreed(), fetchCreditSpread(),
    fetchYahooChart('HG=F'), fetchMarketBreadth()
  ]);

  const payload = { qqq, smh, boxx, spy, spx, ixic, sox, qld, vix, usdtwd, twd: usdtwd, dxy, tnx, shiller, fearGreed, creditSpread, copper, breadth, timestamp: Date.now() };
  if (isHealthyPayload(payload)) lastPayloadCache = payload;
  return payload;
}

function isHealthyPayload(d) {
  return !!(d && d.qqq?.currentPrice && d.smh?.currentPrice && d.vix?.currentPrice && d.shiller?.current);
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/api/data') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      const data = await Promise.race([
        getAllData(),
        new Promise((resolve) => setTimeout(() => resolve(getCachedFallback()), API_BUDGET_MS))
      ]);
      res.end(JSON.stringify(data));
      return;
    }
    if (urlPath === '/api/health') {
      const cached = getCachedFallback();
      const ageMs = Date.now() - (cached?.timestamp || 0);
      const ok = isHealthyPayload(cached);
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok, timestamp: Date.now(), ageMs, stale: ageMs > API_BUDGET_MS, source: cached?.source || 'live-cache' }));
      return;
    }

    let filePath = req.url === '/' ? '/market-dashboard.html' : req.url;
    filePath = path.join(__dirname, filePath);
    const ext = path.extname(filePath);
    const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Market Dashboard server http://localhost:${PORT}`));
