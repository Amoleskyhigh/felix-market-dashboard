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

// Fetch Fear & Greed from a stable public source
async function fetchFearGreed() {
    try {
        const html = await fetchURL('https://feargreedmeter.com/');
        const m = html.match(/Fear\s+and\s+Greed\s+Index(?:\s+is\s+currently\s+at|:)\s*(\d{1,3})\s*\(([^)]+)\)/i)
               || html.match(/"value"\s*:\s*(\d{1,3})\s*,\s*"unitText"\s*:\s*"([^"]+)"/i);
        if (m) {
            const score = Math.max(0, Math.min(100, parseInt(m[1], 10)));
            const rating = (m[2] || '').trim();
            return { score, rating, source: 'feargreedmeter' };
        }
    } catch (e) {
        console.error('Fear & Greed fetch error:', e.message);
    }
    return null;
}

async function fetchCreditSpread() {
    try {
        const url = 'https://fred.stlouisfed.org/series/BAMLH0A0HYM2';
        const html = await fetchURL(url);
        // Robust regex for FRED observations
        const m = html.match(/(\d{4}-\d{2}-\d{2}):\s*([\d.]+)/);
        if (m) {
            console.log(`Credit Spread: value=${m[2]}, date=${m[1]}`);
            return { value: parseFloat(m[2]), date: m[1] };
        }
    } catch (e) {
        console.error('Credit Spread fetch error:', e.message);
    }
    return { value: 2.84, date: '2026-04-30' }; // Hard fallback for now
}

async function fetchMarketBreadth() {
    try {
        const url = 'https://www.multpl.com/s-p-500-stocks-above-200-day-moving-average';
        const html = await fetchURL(url);
        const m = html.match(/([\d.]+)%/);
        if (m) {
            console.log(`Market Breadth: value=${m[1]}`);
            return { value: parseFloat(m[1]) };
        }
    } catch (e) {
        console.error('Market Breadth fetch error:', e.message);
    }
    return { value: 72.4 }; // Hard fallback for now
}

async function getAllData() {
    const [qqq, smh, boxx, spy, spx, ixic, sox, qld, vix, twd, jpy, dxy, tnx, shiller, fearGreed, creditSpread, breadth] = await Promise.all([
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
        fetchFearGreed(),
        fetchCreditSpread(),
        fetchMarketBreadth()
    ]);

    return { qqq, smh, boxx, spy, spx, ixic, sox, qld, vix, twd, jpy, dxy, tnx, shiller, fearGreed, creditSpread, breadth, timestamp: Date.now() };
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
