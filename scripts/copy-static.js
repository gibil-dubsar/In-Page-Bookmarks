const fs = require('fs');
const path = require('path');

const root = __dirname + '/..';
const staticDir = path.join(root, 'static');
const outDir = path.join(root, 'extension');

if (!fs.existsSync(staticDir)) {
  throw new Error('static/ directory not found');
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const files = ['manifest.json', 'UI.html', 'style.css'];
for (const file of files) {
  const src = path.join(staticDir, file);
  const dest = path.join(outDir, file);
  fs.copyFileSync(src, dest);
}
