const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../src/public');
const destination = path.resolve(__dirname, '../dist/public');

// Generate cache-busting version from current timestamp
const CACHE_VERSION = Date.now().toString();

// Clean destination directory
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });

// Replace cache version placeholder in index.html
const indexPath = path.join(destination, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/__CACHE_VERSION__/g, CACHE_VERSION);
fs.writeFileSync(indexPath, html);

console.log(`Build complete. Cache version: ${CACHE_VERSION}`);
