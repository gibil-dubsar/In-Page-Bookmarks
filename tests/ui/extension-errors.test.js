const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getUiTestConfig,
  launchExtensionBrowser,
  openPopupPage
} = require('../helpers/extension-e2e');

const { skipReason, config } = getUiTestConfig();

if (skipReason) {
  test.skip(skipReason);
} else {
  test('extension surfaces no console errors on startup', async () => {
    const errors = [];
    const { browser, extensionId, serviceWorkerTarget, cleanup } = await launchExtensionBrowser(config);
    let popupPage;

    try {
      if (!serviceWorkerTarget && config.strictUi) {
        errors.push('Service worker not detected; extension may not have loaded.');
      }

      if (serviceWorkerTarget) {
        const worker = await serviceWorkerTarget.worker();
        if (!worker) {
          errors.push('Service worker handle not available.');
        } else {
          worker.on('console', (msg) => {
            if (msg.type() === 'error') {
              errors.push(`SW console error: ${msg.text()}`);
            }
          });
        }
      }

      const result = await openPopupPage({ browser, extensionId, serviceWorkerTarget });
      popupPage = result.popupPage;

      popupPage.on('pageerror', (err) => errors.push(`Popup page error: ${err.message}`));
      popupPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(`Popup console error: ${msg.text()}`);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      if (popupPage) {
        await popupPage.close().catch(() => {});
      }
      await browser.close();
      if (cleanup) {
        cleanup();
      }
    }

    if (errors.length > 0) {
      console.error('Extension UI error check failed with:', errors);
      throw new Error(`Found extension errors:\n${errors.join('\n')}`);
    }

    assert.equal(errors.length, 0);
  });
}
