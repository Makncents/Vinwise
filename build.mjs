#!/usr/bin/env node
/**
 * VINwise build — compiles Tailwind, then inlines CSS + JS into ONE deployable file.
 * Output: ./index.html (single-file, zero external requests at runtime except APIs you enable)
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

console.log('→ Compiling Tailwind…');
execSync('npx tailwindcss -c tailwind.config.js -i src/input.css -o .tmp/output.css --minify', { cwd: root, stdio: 'inherit' });

const css = readFileSync(resolve(root, '.tmp/output.css'), 'utf8');
const js  = readFileSync(resolve(root, 'src/app.js'), 'utf8');
let html  = readFileSync(resolve(root, 'src/index.html'), 'utf8');

html = html
  .replace('/*{{INLINE_CSS}}*/', () => css)
  .replace('//{{INLINE_JS}}', () => js);

writeFileSync(resolve(root, 'index.html'), html);
copyFileSync(resolve(root, 'src/marketplace-preview.png'), resolve(root, 'marketplace-preview.png'));
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✔ Built index.html (${kb} KB, single file)`);
