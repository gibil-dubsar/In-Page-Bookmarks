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

const manifestPath = path.join(staticDir, 'manifest.json');
const manifestOutPath = path.join(outDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (process.env.EXTENSION_KEY && typeof process.env.EXTENSION_KEY === 'string') {
  manifest.key = process.env.EXTENSION_KEY;
}

fs.writeFileSync(manifestOutPath, JSON.stringify(manifest, null, 2));

const files = ['UI.html', 'style.css'];
for (const file of files) {
  const src = path.join(staticDir, file);
  const dest = path.join(outDir, file);
  fs.copyFileSync(src, dest);
}
