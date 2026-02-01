const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadEnv } = require('../helpers/load-env');

loadEnv();

const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;

if (!chromePath) {
  test.skip('UI test skipped: CHROME_PATH or CHROMIUM_PATH not set in env or .env');
} else if (!fs.existsSync(chromePath)) {
  test.skip(`UI test skipped: browser path not found at ${chromePath}`);
} else {
  const puppeteer = require('puppeteer-core');

  test('popup UI renders base elements', async () => {
    const extensionDir = path.join(__dirname, '..', '..', 'extension');
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        '--no-sandbox'
      ]
    });

    const page = await browser.newPage();
    await page.goto('https://example.com');

    const targets = await browser.targets();
    const extensionTarget = targets.find((target) => target.type() === 'background_page' || target.type() === 'service_worker');
    const extensionId = extensionTarget && extensionTarget.url().split('/')[2];
    assert.ok(extensionId);

    const popupUrl = `chrome-extension://${extensionId}/UI.html`;
    const popupPage = await browser.newPage();
    await popupPage.goto(popupUrl);

    const headerText = await popupPage.$eval('h1', (el) => el.textContent);
    assert.match(headerText, /In-Page Bookmarks/);

    await browser.close();
  });
}
