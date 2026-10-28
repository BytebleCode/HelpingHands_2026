// Writes the mainframe tree: the frozen site plus this branch's own files, as readable text.
// z/OS git converts it to IBM-1047 on checkout (see .gitattributes), so every text file except
// Markdown is made pure ASCII here so that conversion is lossless.
// Usage: node export.mjs <mainCheckout> <distDir> <branchFilesDir> <outDir>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';

const [repo, distDir, branchFiles, out] = process.argv.slice(2);
const BINARY = new Set(['.jpg', '.jpeg', '.png', '.gif', '.ico', '.woff', '.woff2', '.ttf']);
const NON_ASCII = /[^\x00-\x7F]/gu;

const u = (c) => c.split('').map((h) => '\\u' + h.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const entity = (c) => '&#x' + c.codePointAt(0).toString(16) + ';';
const toAscii = {
  '.js': u, '.mjs': u, '.json': u, '.webmanifest': u,
  '.css': (c) => '\\' + c.codePointAt(0).toString(16) + ' ',
  '.html': entity, '.svg': entity,
};

const walk = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile());
const report = { text: 0, binary: 0, escaped: 0 };

function emit(rel, src) {
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const ext = extname(rel).toLowerCase();
  if (BINARY.has(ext) || ext === '.md') { copyFileSync(src, dest); report[ext === '.md' ? 'text' : 'binary']++; return; }
  let text = readFileSync(src, 'utf8');
  if (NON_ASCII.test(text)) {
    if (!toAscii[ext]) throw new Error(`non-ASCII text in ${rel} and no escape rule for ${ext || 'this file type'}`);
    text = text.replace(NON_ASCII, toAscii[ext]);
    report.escaped++;
  }
  writeFileSync(dest, text);
  report.text++;
}

const dist = walk(distDir);
if (!dist.includes('index.html')) throw new Error(`no index.html in ${distDir}`);
emit('README.md', join(repo, 'README.md'));
for (const f of dist) emit(join('client/dist', f), join(distDir, f));
for (const f of walk(branchFiles)) emit(f, join(branchFiles, f));
console.log(JSON.stringify(report));
