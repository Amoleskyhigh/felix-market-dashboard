const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8899;

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
  try {
    const csv = await fetchURL('https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2');
    const lines = csv.trim().split('\n').slice(1).reverse();
    for (const line of lines) {
      const v = parseFloat(line.split(',')[1]);
      if (!Number.isNaN(v)) return { value: v, symbol: 'BAMLH0A0HYM2' };
    }
  } catch {}
  return null;
}

async function fetchMarketBreadth() {
  try {
    // Hard source: Barchart $S5TH = % of S&P 500 stocks above 200MA
    const raw = await fetchURL('https://query1.finance.yahoo.com/v8/finance/chart/$S5TH?range=1mo&interval=1d');
    const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    const p = result?.meta?.regularMarketPrice;
    if (Number.isFinite(p) && p >= 0 && p <= 100) return { value: p, source: 'Barchart:$S5TH' };
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const last = closes.filter(v => Number.isFinite(v)).slice(-1)[0];
    if (Number.isFinite(last) && last >= 0 && last <= 100) return { value: last, source: 'Barchart:$S5TH' };
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

  return { qqq, smh, boxx, spy, spx, ixic, sox, qld, vix, usdtwd, twd: usdtwd, dxy, tnx, shiller, fearGreed, creditSpread, copper, breadth, timestamp: Date.now() };
}

function isHealthyPayload(d) {
  return !!(d && d.qqq?.currentPrice && d.smh?.currentPrice && d.vix?.currentPrice && d.shiller?.current);
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    const data = await getAllData();
    res.end(JSON.stringify(data));
    return;
  }
  if (urlPath === '/api/health') {
    const data = await getAllData();
    const ok = isHealthyPayload(data);
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok, timestamp: Date.now() }));
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
});

server.listen(PORT, '0.0.0.0', () => console.log(`Market Dashboard server http://localhost:${PORT}`));