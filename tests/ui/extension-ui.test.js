const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUiTestConfig,
  launchExtensionBrowser,
  openPopupPage,
  createTestServer
} = require('../helpers/extension-e2e');


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const { setMaxIdleHTTPParsers } = require('node:http');

const { skipReason, config } = getUiTestConfig();

if (skipReason) {
  test.skip(skipReason);
} else {
  test('popup UI renders base elements (via chrome.action.openPopup)', async () => {
    console.log('extension Path:', config.extensionDir);
    const { browser, extensionId, serviceWorkerTarget, cleanup } = await launchExtensionBrowser(config);
    console.log('extensionId:', extensionId);
    console.log(`chrome-extension://${extensionId}/UI.html`);
    let popupPage;

    try {
      const result = await openPopupPage({ browser, extensionId, serviceWorkerTarget });
      popupPage = result.popupPage;

      const headerText = await popupPage.$eval('h1', (el) => el.textContent || '');
      assert.match(headerText, /In-Page Bookmarks/);
    } finally {
      if (popupPage) {
        await popupPage.close().catch(() => {});
      }
      await browser.close();
      if (cleanup) {
        cleanup();
      }
    }
  });

  test('popup can save a bookmark and updates storage', async () => {
    const { storageKey } = require('../../extension/lib/background-logic.js');
    const { browser, extensionId, serviceWorkerTarget, cleanup } = await launchExtensionBrowser(config);
    const server = await createTestServer();
    let page;
    let popupPage;

    try {
      page = await browser.newPage();
      await page.goto(server.url, { waitUntil: 'domcontentloaded' });
      await page.bringToFront();
      await page.evaluate(() => window.scrollTo(0, 400));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const result = await openPopupPage({
        browser,
        extensionId,
        serviceWorkerTarget
      });
      popupPage = result.popupPage;

      await popupPage.waitForSelector('#bookmarkName');
      await popupPage.type('#bookmarkName', 'Test Bookmark');
      await popupPage.click('#saveBookmarkBtn');

      await popupPage.waitForSelector('.bookmark-item');
      const countText = await popupPage.$eval('#bookmarkCount', (el) => el.textContent || '');
      assert.equal(countText.trim(), '1');

      const nameText = await popupPage.$eval('.bookmark-name', (el) => el.textContent || '');
      assert.equal(nameText.trim(), 'Test Bookmark');

      const key = storageKey(page.url());
      const stored = await popupPage.evaluate((storageKeyValue) => {
        return new Promise((resolve) => {
          chrome.storage.local.get([storageKeyValue], (data) => {
            resolve(data[storageKeyValue] || []);
          });
        });
      }, key);

      assert.equal(stored.length, 1);
      assert.equal(stored[0].name, 'Test Bookmark');
    } finally {
      if (popupPage) {
        await popupPage.close().catch(() => {});
      }
      if (page) {
        await page.close().catch(() => {});
      }
      await browser.close().catch(() => {});
      if (cleanup) {
        cleanup();
      }
      await server.close();
    }
  });
}
