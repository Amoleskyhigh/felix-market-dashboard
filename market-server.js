const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8899;

function fetchURL(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchURL(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function fetchYahooChart(symbol, range = '1y', interval = '1d') {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
        const raw = await fetchURL(url);
        const data = JSON.parse(raw);
        const result = data.chart.result[0];
        const meta = result.meta;
        return {
            symbol,
            currentPrice: meta.regularMarketPrice,
            previousClose: meta.chartPreviousClose,
            timestamps: (result.timestamp || []).map(t => t * 1000),
            closes: result.indicators.quote[0].close || []
        };
    } catch (e) {
        console.error(`Yahoo fetch error for ${symbol}:`, e.message);
        return null;
    }
}

async function fetchShillerPE() {
    try {
        const html = await fetchURL('https://www.multpl.com/shiller-pe/table/by-month');
        const rows = [];
        // Match pairs: <td>DATE</td>\n<td>\n...\nVALUE\n</td>
        const regex = /<td>([A-Z][a-z]+ \d{1,2}, \d{4})<\/td>\s*<td>\s*[\s\S]*?([\d]+\.[\d]+)\s*<\/td>/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
            rows.push({ date: m[1], value: parseFloat(m[2]) });
        }
        const current = rows.length > 0 ? rows[0].value : null;
        console.log(`Shiller PE: current=${current}, history=${rows.length} rows`);
        return { current, history: rows.slice(0, 120).reverse() };
    } catch (e) {
        console.error('Shiller PE fetch error:', e.message);
        return { current: null, history: [] };
    }
}

// Fetch CNN Fear & Greed via scraping
async function fetchFearGreed() {
    try {
        const html = await fetchURL('https://edition.cnn.com/markets/fear-and-greed');
        // Try to extract the score from page
        const scoreMatch = html.match(/fear-and-greed-index"[^>]*>[\s\S]*?(\d+)/);
        if (scoreMatch) return { score: parseInt(scoreMatch[1]), source: 'cnn' };
    } catch (e) {}
    // Fallback: calculate from VIX (inverse relationship)
    // VIX 10-12 = Extreme Greed (90-100), VIX 30+ = Extreme Fear (0-10)
    return null;
}

async function getAllData() {
    const [qqq, smh, boxx, spy, spx, ixic, sox, qld, vix, twd, jpy, dxy, tnx, shiller, fearGreed] = await Promise.all([
        fetchYahooChart('QQQ'),
        fetchYahooChart('SMH'),
        fetchYahooChart('BOXX'),
        fetchYahooChart('SPY'),
        fetchYahooChart('^GSPC'),
        fetchYahooChart('^IXIC'),
        fetchYahooChart('^SOX'),
        fetchYahooChart('QLD'),
        fetchYahooChart('^VIX'),
        fetchYahooChart('TWD=X'),
        fetchYahooChart('JPY=X'),
        fetchYahooChart('DX-Y.NYB'),
        fetchYahooChart('^TNX'),
        fetchShillerPE(),
        fetchFearGreed()
    ]);

    // Calculate Fear & Greed from VIX if CNN unavailable
    let fg = fearGreed;
    if (!fg && vix) {
        // VIX to Fear/Greed: VIX 10→95(Extreme Greed), VIX 20→50(Neutral), VIX 35→5(Extreme Fear)
        const vixVal = vix.currentPrice;
        const score = Math.max(0, Math.min(100, Math.round(100 - (vixVal - 10) * (100 / 25))));
        const rating = score >= 75 ? 'Extreme Greed' : score >= 55 ? 'Greed' : score >= 45 ? 'Neutral' : score >= 25 ? 'Fear' : 'Extreme Fear';
        fg = { score, rating, source: 'vix-derived' };
    }

    return { qqq, smh, boxx, spy, spx, ixic, sox, qld, vix, twd, jpy, dxy, tnx, shiller, fearGreed: fg, timestamp: Date.now() };
}

async function getRetirementData() {
    try {
        const sheetId = '13Q9i1NcfIvFkQ2dtvX2QdEXYeHOFRNnagTWJx59m6WI';
        const gogPath = '/opt/homebrew/bin/gog';
        // Get summary and header info
        const summaryRaw = await new Promise((resolve) => {
            const { exec } = require('child_process');
            exec(`${gogPath} sheets get ${sheetId} "工作表1!A1:B7" --json`, (err, stdout) => {
                if (err) {
                    console.error('Summary fetch error:', err);
                    resolve(null);
                } else resolve(JSON.parse(stdout));
            });
        });

        // Get chart data (Month 1 to 48)
        const chartRaw = await new Promise((resolve) => {
            const { exec } = require('child_process');
            exec(`${gogPath} sheets get ${sheetId} "工作表1!A18:E66" --json`, (err, stdout) => {
                if (err) {
                    console.error('Chart fetch error:', err);
                    resolve(null);
                } else resolve(JSON.parse(stdout));
            });
        });

        if (!summaryRaw || !chartRaw) return null;

        // Parse summary values
        const data = { target: 1500000, current: 0, gap: 0 };
        if (summaryRaw && summaryRaw.values) {
            summaryRaw.values.forEach(row => {
                if (row[0] && row[1]) {
                    if (row[0].includes('目標總資產')) data.target = parseInt(row[1].replace(/[$,]/g, '')) || 1500000;
                    if (row[0].includes('目前總資產')) data.current = parseInt(row[1].replace(/[$,]/g, '')) || 0;
                    if (row[0].includes('剩餘缺口')) data.gap = parseInt(row[1].replace(/[$,]/g, '')) || 0;
                }
            });
        }

        // Parse chart values
        const chartData = { labels: [], rates5: [], rates8: [], rates12: [] };
        if (chartRaw && chartRaw.values) {
            chartRaw.values.slice(1).forEach(row => {
                if (row[0] && row[2] && row[3] && row[4]) {
                    chartData.labels.push(row[0]);
                    chartData.rates5.push(parseInt(row[2].replace(/[$,]/g, '')) || 0);
                    chartData.rates8.push(parseInt(row[3].replace(/[$,]/g, '')) || 0);
                    chartData.rates12.push(parseInt(row[4].replace(/[$,]/g, '')) || 0);
                }
            });
        }

        return { ...data, chart: chartData, timestamp: Date.now() };
    } catch (e) {
        console.error('Retirement data fetch error:', e.message);
        return null;
    }
}

const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0]; // 忽略 query string
    if (urlPath === '/api/data') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        try {
            const data = await getAllData();
            res.end(JSON.stringify(data));
        } catch (e) {
            res.end(JSON.stringify({ error: e.message }));
        }
    } else if (urlPath === '/api/retirement') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        const data = await getRetirementData();
        res.end(JSON.stringify(data || { error: 'Failed to fetch spreadsheet data' }));
    } else {
        let filePath = req.url === '/' ? '/market-dashboard.html' : req.url;
        filePath = path.join(__dirname, filePath);
        const ext = path.extname(filePath);
        const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        try {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(content);
        } catch (e) {
            res.writeHead(404);
            res.end('Not found');
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Market Dashboard server running at:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://10.0.0.60:${PORT}`);
});
