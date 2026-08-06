#!/usr/bin/env node
/**
 * build.js — bundle the site into a single self-contained HTML file.
 *
 * The multi-file version needs to be served (or at least kept intact) because
 * index.html references css/ and js/ by relative path. The bundled output can be
 * opened by double-clicking it from anywhere, which makes it much easier to share.
 *
 * Usage:  node build.js
 * Output: dist/GeneCharacterize.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'GeneCharacterize.html');

const STYLESHEET = 'css/styles.css';
const SCRIPTS = [
  'js/seqlib.js',
  'js/seqtools.js',
  'js/notebook.js',
  'js/databases.js',
  'js/tools-data.js',
  'js/app.js'
];

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Replace `needle` with `payload` using a replacer FUNCTION.
 *
 * This matters: String.prototype.replace treats `$$`, `$&` and `$1` in a string
 * replacement as special patterns. Our source contains a `$$` DOM helper, and a
 * plain string replacement silently mangles it into `$`. A function replacer
 * disables that substitution entirely.
 */
function inject(haystack, needle, payload) {
  if (!haystack.includes(needle)) {
    throw new Error(`Build failed: could not find "${needle}" in index.html`);
  }
  return haystack.replace(needle, () => payload);
}

function build() {
  let html = read('index.html');

  html = inject(html, `<link href="${STYLESHEET}" rel="stylesheet">`,
    '<style>\n' + read(STYLESHEET) + '\n</style>');

  for (const script of SCRIPTS) {
    html = inject(html, `<script src="${script}"></script>`,
      '<script>\n' + read(script) + '\n</script>');
  }

  // ---- verification: the bundle must be self-contained and undamaged
  const problems = [];

  if (html.includes('css/styles.css')) problems.push('stylesheet reference survived');
  SCRIPTS.forEach(s => { if (html.includes(`src="${s}"`)) problems.push(`${s} reference survived`); });

  // The $$ helper is the canary for the replace-escaping bug described above
  const dollarHelpers = (html.match(/const \$\$ = sel/g) || []).length;
  if (dollarHelpers !== 1) {
    problems.push(`expected exactly one "$$" helper, found ${dollarHelpers} — ` +
                  'the $$ escape bug has probably reappeared');
  }

  if (!html.trimStart().startsWith('<!DOCTYPE html>')) problems.push('missing doctype');
  if (!html.trimEnd().endsWith('</html>')) problems.push('truncated output');

  const openTags = (html.match(/<script/g) || []).length;
  const closeTags = (html.match(/<\/script>/g) || []).length;
  if (openTags !== closeTags) problems.push(`unbalanced script tags (${openTags} open, ${closeTags} close)`);

  if (problems.length) {
    console.error('Build failed:');
    problems.forEach(p => console.error('  - ' + p));
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html);

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`Built ${path.relative(ROOT, OUT_FILE)} (${kb} KB)`);
  console.log('Self-contained apart from three CDN resources: Chart.js, Font Awesome and Google Fonts.');
  console.log('It still opens and analyses sequences offline; only icons and charts need the network.');
}

build();
