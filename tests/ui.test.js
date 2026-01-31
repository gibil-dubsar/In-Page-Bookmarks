const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiPath = path.join(__dirname, '..', 'static', 'UI.html');

test('UI references popup and styles', () => {
  const html = fs.readFileSync(uiPath, 'utf8');
  assert.match(html, /popup\.js/);
  assert.match(html, /style\.css/);
  assert.match(html, /In-Page Bookmarks/);
});
