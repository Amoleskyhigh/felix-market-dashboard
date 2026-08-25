'use strict';

const assert = require('assert');
const { chromium } = require('/opt/homebrew/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto('http://127.0.0.1:8899/market-dashboard.html', { waitUntil: 'domcontentloaded' });
      await page.locator('#chart-forward-pe').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelectorAll('#forward-pe-latest .forward-pe-metric').length === 4, null, { timeout: 15000 });
      await page.locator('#status-bar.success').waitFor({ state: 'visible', timeout: 20000 });
      assert(await page.locator('#forward-pe-meta').isVisible());
      assert.equal(await page.locator('.forward-pe-metric').count(), 4);
      assert((await page.locator('#chart-forward-pe line, #chart-forward-pe path').count()) > 0);
      if (viewport.width < 500) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      if (viewport.width > 500) {
        await page.getByRole('button', { name: 'Weekly' }).click();
        await page.getByRole('button', { name: 'Monthly' }).click();
        await page.getByRole('button', { name: 'Daily' }).click();
        await page.getByRole('button', { name: /Reset to Actual/ }).click();
        await page.locator('h3[onclick="toggleCollapse(this)"]').first().click();
      }
      if (errors.length) console.error('page errors:', errors.join('\n'));
      assert.deepEqual(errors, [], errors.join('\n'));
      await page.close();
    }
    console.log('browser UI smoke tests passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
