const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const { loadEnv } = require('./load-env');
const { extensionIdFromKey } = require('./extension-id');

let generatedKey = null;

function generateManifestKey() {
  if (generatedKey) {
    return generatedKey;
  }

  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'der'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  generatedKey = Buffer.from(publicKey).toString('base64');
  return generatedKey;
}

function getUiTestConfig() {
  loadEnv();

  const chromePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const uiTestsEnabled = process.env.EXT_UI_TESTS === '1';
  const headlessEnv = process.env.EXT_HEADLESS;
  const headless = headlessEnv === '1' || headlessEnv === 'new' ? 'new' : false;
  const strictUi = process.env.EXT_UI_STRICT === '1';
  const explicitId = process.env.EXTENSION_ID;
  const keyFromEnv = process.env.EXTENSION_KEY;
  let key = keyFromEnv || null;

  if (!explicitId && !keyFromEnv) {
    key = generateManifestKey();
  }

  if (!uiTestsEnabled) {
    return { skipReason: 'UI test skipped: set EXT_UI_TESTS=1 to run locally' };
  }
  if (!chromePath) {
    return { skipReason: 'UI test skipped: CHROME_PATH or CHROMIUM_PATH not set in env or .env' };
  }
  if (!fs.existsSync(chromePath)) {
    return { skipReason: `UI test skipped: browser path not found at ${chromePath}` };
  }

  const extensionDir = path.join(__dirname, '..', '..', 'extension');
  const manifestPath = path.join(extensionDir, 'manifest.json');

  if (!fs.existsSync(extensionDir)) {
    return { skipReason: 'UI test skipped: extension build output not found; run npm run build' };
  }
  if (!fs.existsSync(manifestPath)) {
    return { skipReason: 'UI test skipped: extension manifest not found; run npm run build' };
  }

  return {
    config: {
      chromePath,
      headless,
      strictUi,
      explicitId,
      key,
      extensionDir,
      manifestPath
    }
  };
}

function ensureManifestKey(manifestPath, key) {
  if (!key) {
    return;
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  if (manifest.key === key) {
    return;
  }

  manifest.key = key;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createTempExtensionDir(sourceDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'in-page-bookmarks-'));
  const tempDir = path.join(tempRoot, 'extension');
  fs.mkdirSync(tempDir, { recursive: true });

  if (fs.cpSync) {
    fs.cpSync(sourceDir, tempDir, { recursive: true });
  } else {
    const copyDir = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    copyDir(sourceDir, tempDir);
  }

  return {
    extensionDir: tempDir,
    manifestPath: path.join(tempDir, 'manifest.json'),
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true })
  };
}

function parseExtensionIdFromUrl(url) {
  if (!url || !url.startsWith('chrome-extension://')) {
    return null;
  }
  const parts = url.split('/');
  return parts[2] || null;
}

async function waitForServiceWorker(browser, { timeoutMs = 20000, expectedId } = {}) {
  try {
    const target = await browser.waitForTarget(
      (candidate) => {
        if (candidate.type() !== 'service_worker') {
          return false;
        }
        const url = candidate.url() || '';
        if (expectedId) {
          return url === `chrome-extension://${expectedId}/background.js`;
        }
        return url.startsWith('chrome-extension://') && url.endsWith('background.js');
      },
      { timeout: timeoutMs }
    );
    return target;
  } catch (err) {
    return null;
  }
}

async function detectExtensionId(browser, timeoutMs = 4000) {
  try {
    const target = await browser.waitForTarget(
      (candidate) => (candidate.url() || '').startsWith('chrome-extension://'),
      { timeout: timeoutMs }
    );
    return parseExtensionIdFromUrl(target.url());
  } catch (err) {
    return null;
  }
}

async function launchExtensionBrowser(config) {
  const { chromePath, headless, strictUi, explicitId, key, extensionDir } = config;
  const temp = createTempExtensionDir(extensionDir);
  const manifestPath = temp.manifestPath;

  if (key) {
    ensureManifestKey(manifestPath, key);
  }

  const puppeteer = require('puppeteer-core');
  const expectedId = explicitId || (key ? extensionIdFromKey(key) : null);
  const browser = await puppeteer.launch({
    pipe: true,
    executablePath: chromePath,
    headless: headless,
    enableExtensions: [temp.extensionDir]
  });

  const serviceWorkerTarget = await waitForServiceWorker(browser, {
    timeoutMs: 20000,
    expectedId
  });
  const actualId = serviceWorkerTarget ? parseExtensionIdFromUrl(serviceWorkerTarget.url()) : null;
  const detectedId = actualId || (await detectExtensionId(browser, 4000));
  const extensionId = actualId || expectedId || detectedId;

  if (!serviceWorkerTarget) {
    const targets = await browser.targets();
    const summary = targets.map((target) => `${target.type()}: ${target.url()}`).join('\n');
    await browser.close();
    throw new Error(`Service worker not found. Targets seen:\n${summary}`);
  }

  if (expectedId && actualId && expectedId !== actualId) {
    console.warn(`Extension ID mismatch: expected ${expectedId}, detected ${actualId}`);
  }

  return {
    browser,
    extensionId,
    serviceWorkerTarget,
    extensionDir: temp.extensionDir,
    cleanup: temp.cleanup
  };
}

async function openPopupPage({
  browser,
  extensionId,
  serviceWorkerTarget,
  requireWorker = false,
  timeoutMs = 20000
}) {
  let worker = null;

  const workerTarget = serviceWorkerTarget || (await waitForServiceWorker(browser, { timeoutMs, expectedId: extensionId }));
  if (!workerTarget) {
    throw new Error('Service worker not available to open popup');
  }

  const getWorker = async (target, attempts = 3) => {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await target.worker();
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    throw lastError;
  };

  try {
    worker = await getWorker(workerTarget);
  } catch (err) {
    const retryTarget = await waitForServiceWorker(browser, { timeoutMs, expectedId: extensionId });
    if (!retryTarget) {
      throw new Error('Service worker not available to open popup');
    }
    worker = await getWorker(retryTarget);
  }

  const actionInfo = await worker.evaluate(() => {
    return {
      hasChrome: Boolean(globalThis.chrome),
      hasAction: Boolean(globalThis.chrome && chrome.action),
      hasOpenPopup: Boolean(globalThis.chrome && chrome.action && chrome.action.openPopup),
      runtimeId: globalThis.chrome && chrome.runtime ? chrome.runtime.id : null,
      href: typeof location !== 'undefined' && location.href ? location.href : null
    };
  });
  if (!actionInfo.hasOpenPopup) {
    throw new Error(`chrome.action.openPopup not available in service worker: ${JSON.stringify(actionInfo)}`);
  }

  const pages = await browser.pages();
  const activePage = pages.length > 0 ? pages[0] : await browser.newPage();
  await activePage.bringToFront();

  const popupTargetPromise = browser.waitForTarget(
    (candidate) => {
      if (candidate.type() !== 'page') {
        return false;
      }
      const url = candidate.url() || '';
      return url.endsWith('/UI.html');
    },
    { timeout: timeoutMs }
  );

  try {
    await worker.evaluate('chrome.action.openPopup();');
  } catch (err) {
    popupTargetPromise.catch(() => {});
    throw err;
  }

  const popupTarget = await popupTargetPromise;
  const popupPage = await popupTarget.asPage();
  return { popupPage, worker };
}

async function createTestServer() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Extension Test Page</title>
  <style>
    body { margin: 0; font-family: sans-serif; }
    .spacer { height: 4000px; background: linear-gradient(#f5f5f5, #e0e0e0); }
  </style>
</head>
<body>
  <h1>Scroll Test Page</h1>
  <div class="spacer"></div>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'string' ? null : address.port;

  if (!port) {
    server.close();
    throw new Error('Failed to start test server');
  }

  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

module.exports = {
  getUiTestConfig,
  launchExtensionBrowser,
  openPopupPage,
  createTestServer
};
