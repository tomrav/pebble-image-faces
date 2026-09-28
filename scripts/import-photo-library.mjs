// Imports photo-face's built-in photo library from a saved gallery HTML file
// (an offline page of <figure class="card"> entries with embedded data-URI
// images, grouped under <h2> category headings, each carrying a license badge
// and source links).
//
//   node scripts/import-photo-library.mjs ~/Downloads/free-image-library.html
//
// Keeps ONLY license-free entries (badge lic-free: CC0 / Public Domain) — the
// face cannot display attribution on a 200x228 panel, so lic-attr images are
// skipped and listed at the end. Writes:
//   docs/photo-face/img/<cat>-<n>.jpg   decoded source images (page previews +
//                                       conversion input for gen-photo-face)
//   docs/photo-face/library.json        manifest: categories, titles, licenses
//   docs/photo-face/CREDITS.md          provenance for every kept image
//
// Then run: npm run pebble:gen-photo-face
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/import-photo-library.mjs <library.html>'); process.exit(1); }

const root = process.cwd();
const faceDocs = path.join(root, 'docs', 'photo-face');
const imgDir = path.join(faceDocs, 'img');

// Category display names -> short slugs used in file/ref names. Categories
// not listed here are SKIPPED (the library ships a curated subset).
const SLUGS = {
  'Animals': 'animals',
  'Space': 'space',
  'Architecture': 'architecture',
  'Transportation': 'transport',
  'Flora': 'flora',
};

const html = readFileSync(src, 'utf8');
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&times;/g, 'x');

// Hand-tuned crop focus points survive a re-import: they are keyed by the
// generated file name (<cat>-<n>), so they stay put as long as the category
// order is unchanged. Re-check them after inserting or reordering photos.
let prevFocus = {};
try {
  for (const cat of JSON.parse(readFileSync(path.join(faceDocs, 'library.json'), 'utf8')).categories) {
    for (const im of cat.images) { if (im.focus) prevFocus[im.file] = im.focus; }
  }
} catch (e) { /* first import */ }

const categories = [];
const skipped = [];
const sections = html.split(/<h2[^>]*>/).slice(1);
for (const sec of sections) {
  const name = unesc(sec.match(/(.*?)<\/h2>/s)[1].replace(/<[^>]+>/g, '').trim());
  const slug = SLUGS[name];
  if (!slug) { console.log('skipping category: ' + name); continue; }
  const images = [];
  for (const card of sec.match(/<figure class="card">.*?<\/figure>/gs) || []) {
    const title = unesc(card.match(/<h3[^>]*>(.*?)<\/h3>/s)[1].replace(/<[^>]+>/g, '').trim());
    const badge = card.match(/badge (lic-\w+)"[^>]*>(.*?)</);
    const uri = card.match(/data:image\/(\w+);base64,([A-Za-z0-9+/=]+)/);
    const links = {};
    for (const [, href, label] of card.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)) {
      links[label.trim()] = href;
    }
    const license = unesc(badge[2].trim());
    if (badge[1] !== 'lic-free') {
      skipped.push({ cat: name, title, license, source: links['source page'] || '' });
      continue;
    }
    images.push({ title, license, source: links['source page'] || '',
                  licenseUrl: links['license'] || '', data: Buffer.from(uri[2], 'base64') });
  }
  if (images.length) categories.push({ slug, name, images });
}

// Fresh img/ directory (the old library is fully replaced).
mkdirSync(imgDir, { recursive: true });
for (const f of readdirSync(imgDir)) rmSync(path.join(imgDir, f));

const manifest = { categories: [] };
const credits = ['# photo-face built-in photo credits', '',
  'Every bundled/streamed photo is **CC0 or public domain** — no attribution is',
  'legally required, which is why none is shown on the watch. Attribution-required',
  'entries in the source library are skipped (listed at the end). Imported from a',
  'saved library page by `scripts/import-photo-library.mjs`; regenerate the watch',
  'assets with `npm run pebble:gen-photo-face`.', ''];

let total = 0;
for (const cat of categories) {
  const entry = { slug: cat.slug, name: cat.name, images: [] };
  credits.push(`## ${cat.name}`, '', '| file | title | license | source |', '| --- | --- | --- | --- |');
  cat.images.forEach((im, i) => {
    const file = `${cat.slug}-${i + 1}`;
    writeFileSync(path.join(imgDir, `${file}.jpg`), im.data);
    const rec = { file, title: im.title };
    if (prevFocus[file]) rec.focus = prevFocus[file];
    entry.images.push(rec);
    credits.push(`| \`${file}.jpg\` | ${im.title} | ${im.license} | [source](${im.source}) |`);
    total++;
  });
  credits.push('');
  manifest.categories.push(entry);
}

if (skipped.length) {
  credits.push('## Skipped (attribution required)', '');
  for (const s of skipped) credits.push(`- ${s.cat} / ${s.title} — ${s.license} — ${s.source}`);
  credits.push('');
}

writeFileSync(path.join(faceDocs, 'library.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(path.join(faceDocs, 'CREDITS.md'), credits.join('\n'));

console.log(`${total} images in ${categories.length} categories -> docs/photo-face/img/`);
console.log(`skipped (attribution required): ${skipped.length}`);
console.log('Next: npm run pebble:gen-photo-face');
