const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../src/public');
const destination = path.resolve(__dirname, '../dist/public');

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
