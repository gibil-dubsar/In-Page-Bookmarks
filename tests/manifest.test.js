const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.join(__dirname, '..', 'static', 'manifest.json');

test('manifest has required fields', () => {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(manifest.action && manifest.action.default_popup);
  assert.equal(manifest.action.default_popup, 'UI.html');
  assert.ok(manifest.background && manifest.background.service_worker);
});
