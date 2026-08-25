'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  parseYahooForwardPE,
  parseYahooQuoteForwardPE,
  normalizeYahooSymbol,
  currentNYSEDate,
  estimateETFForwardPE,
  makeUnavailablePoint,
  redactSensitiveError
} = require('../scripts/update-forward-pe-history');

assert.equal(parseYahooForwardPE('{\\"forwardPE\\":{\\"raw\\":16.34}'), 16.34);
assert.equal(parseYahooForwardPE('"forwardPE":{"raw":25.1}'), 25.1);
assert.equal(parseYahooForwardPE('"trailingPE":{"raw":99.2}'), null, 'trailing P/E must never be used');
assert.equal(parseYahooForwardPE('"forwardPE":{"raw":-2}'), null);
assert.equal(normalizeYahooSymbol('BRK.B'), 'BRK-B');
const quoteValues = parseYahooQuoteForwardPE({ quoteResponse: { result: [
  { symbol: 'MSFT', forwardPE: 20.8, trailingPE: 27.4 },
  { symbol: 'ONLYTRAILING', trailingPE: 99.2 }
] } });
assert.equal(quoteValues.get('MSFT'), 20.8);
assert.equal(quoteValues.has('ONLYTRAILING'), false, 'quote API trailing P/E must never be used');
assert.equal(currentNYSEDate(new Date('2026-08-26T02:30:00.000Z')), '2026-08-25');

const estimated = estimateETFForwardPE(
  [{ symbol: 'A', weight: 0.6 }, { symbol: 'B', weight: 0.2 }, { symbol: 'C', weight: 0.2 }],
  new Map([['A', 20], ['B', 40]]),
  { maxHoldings: 2 }
);
assert.equal(estimated.value, 22.86);
assert.equal(estimated.coverage, 0.8, 'coverage must be against all holdings, not only selected holdings');
assert.equal(estimated.status, 'available');

const unavailable = makeUnavailablePoint({ asOf: '2026-08-25', retrievedAt: '2026-08-25T22:35:00.000Z', error: 'source unavailable' });
assert.equal(unavailable.value, null);
assert.equal(unavailable.status, 'unavailable');
assert.match(unavailable.sources.constituentForwardPE, /forwardPE/);
assert.equal(unavailable.asOf, '2026-08-25');
assert.doesNotMatch(redactSensitiveError('API key as PRIVATEKEY123 rejected; ?apikey=PRIVATEKEY123', 'PRIVATEKEY123'), /PRIVATEKEY123/);

for (const filename of ['dashboard-core.js', 'dashboard-styles.css', 'dashboard-ui.js', 'market-dashboard.html']) {
  const root = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', filename), 'utf8');
  assert.equal(docs, root, `docs/${filename} must match its root counterpart`);
}
assert.equal(
  fs.readFileSync(path.join(__dirname, '..', 'forward-pe-history.json'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'forward-pe-history.json'), 'utf8'),
  'root and docs forward P/E histories must match'
);

function fakeNode() {
  return {
    innerHTML: '', textContent: '', className: '', children: [], attributes: {},
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attributes[key] = String(value); }
  };
}

const uiNodes = {
  'forward-pe-status': fakeNode(),
  'forward-pe-latest': fakeNode(),
  'forward-pe-meta': fakeNode(),
  'chart-forward-pe': fakeNode()
};
const uiDocument = {
  getElementById(id) { return uiNodes[id] || (uiNodes[id] = fakeNode()); },
  createElementNS() { return fakeNode(); }
};
const uiContext = vm.createContext({ document: uiDocument, console, Date, setTimeout, clearTimeout, init() {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dashboard-ui.js'), 'utf8'), uiContext);
vm.runInContext(`
  forwardPEHistory = {
    startedAt: '2026-08-25',
    sources: { holdings: 'Alpha Vantage ETF_PROFILE', constituentForwardPE: 'Yahoo forwardPE only; trailingPE excluded' },
    snapshots: [{ date: '2026-08-25', asOf: '2026-08-25', retrievedAt: '2026-08-25T22:35:00.000Z', etfs: {
      SPY: { value: 20.12, status: 'available', coverage: 0.9, asOf: '2026-08-25' },
      QQQ: { value: 25.34, status: 'partial', coverage: 0.5, asOf: '2026-08-25' },
      SMH: { value: null, status: 'unavailable', coverage: 0, asOf: '2026-08-25', error: 'source unavailable' },
      IGV: { value: null, status: 'unavailable', coverage: 0, asOf: '2026-08-25', error: 'source unavailable' }
    }}]
  };
  renderForwardPEPanel();
`, uiContext);
assert.match(uiNodes['forward-pe-latest'].innerHTML, /SPY/);
assert.match(uiNodes['forward-pe-latest'].innerHTML, /20\.12x/);
assert.match(uiNodes['forward-pe-latest'].innerHTML, /N\/A/);
assert.match(uiNodes['forward-pe-latest'].innerHTML, /2026-08-25/);
assert.match(uiNodes['forward-pe-meta'].textContent, /forwardPE only; trailingPE excluded/);
assert.ok(uiNodes['chart-forward-pe'].children.length > 0, 'forward P/E trend SVG should render');

console.log('forward-pe unit and docs-sync tests passed');
