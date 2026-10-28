// Writes the branch tree. Everything z/OS reads (the site, .htaccess, setup script, Apache config)
// is encoded in EBCDIC IBM-1047; docs, git config and these tools stay readable.
// Usage: node export.mjs <mainCheckout> <distDir> <branchCheckout> <outDir>
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';

const [main, distDir, branch, out] = process.argv.slice(2);
const BINARY = new Set(['.jpg', '.jpeg', '.png', '.gif', '.ico', '.woff', '.woff2', '.ttf']);
const NON_ASCII = /[^\x00-\x7F]/gu;

// IBM-1047 can't hold curly quotes, dashes, arrows and the like, and Apache sends ISO8859-1 to a
// page that declares UTF-8, so text is made pure ASCII first with escapes that render the same.
const u = (c) => c.split('').map((h) => '\\u' + h.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const entity = (c) => '&#x' + c.codePointAt(0).toString(16) + ';';
const toAscii = {
  '.js': u, '.json': u, '.webmanifest': u,
  '.css': (c) => '\\' + c.codePointAt(0).toString(16) + ' ',
  '.html': entity, '.svg': entity,
};

const iconv = (from, to, input) => execFileSync('iconv', ['-f', from, '-t', to], { input });
const walk = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile());
const report = { ebcdic: 0, binary: 0, readable: 0 };

function place(rel) {
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  return dest;
}

function ebcdic(rel, src) {
  const ext = extname(rel).toLowerCase();
  if (BINARY.has(ext)) { copyFileSync(src, place(rel)); report.binary++; return; }
  let text = readFileSync(src, 'utf8');
  if (NON_ASCII.test(text)) {
    if (!toAscii[ext]) throw new Error(`non-ASCII text in ${rel} and no escape rule for ${ext || 'this file type'}`);
    text = text.replace(NON_ASCII, toAscii[ext]);
  }
  const bytes = iconv('ISO8859-1', 'IBM1047', text);
  if (iconv('IBM1047', 'ISO8859-1', bytes).toString('latin1') !== text) throw new Error(`IBM-1047 round trip changed ${rel}`);
  writeFileSync(place(rel), bytes);
  report.ebcdic++;
}

function readable(rel, src) {
  copyFileSync(src, place(rel));
  report.readable++;
}

const site = walk(distDir);
if (!site.includes('index.html')) throw new Error(`no index.html in ${distDir}`);
for (const f of site) ebcdic(f, join(distDir, f));
ebcdic('.htaccess', join(branch, 'tools/zos/.htaccess'));
ebcdic('zos-setup.sh', join(branch, 'tools/zos/zos-setup.sh'));
ebcdic('apache/helping-hands.conf', join(branch, 'tools/zos/helping-hands.conf'));

readable('README.md', join(main, 'README.md'));
for (const f of ['README-ZOS.md', '.gitattributes', '.gitignore']) readable(f, join(branch, f));
for (const f of walk(join(branch, 'tools'))) readable(join('tools', f), join(branch, 'tools', f));
console.log(JSON.stringify(report));
