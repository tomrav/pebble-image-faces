import { syncFaceRuntime } from './lib/face-runtime.mjs';
// Regenerates photo-face's photo library from docs/photo-face/img/ +
// library.json (written by scripts/import-photo-library.mjs).
//
// The library is larger than the watch's flash budget, so it splits — the same
// hybrid the franchise faces use:
//   BUNDLED   the FIRST image of each category ships in the .pbw (offline
//             fallback rotation; instant, no phone)
//   STREAMED  everything else is hosted; the phone fetches
//             processed/<name>.b64 and chunk-streams it to the watch
//
// One run maintains every consistency point. Order IS the wire protocol (the
// phone sends IMG_BUILTIN as an index into the watch's table):
//   - docs/photo-face/config.html            -> var GALLERY (key/title/file/bundled)
//   - src/faces/photo-face/src/pkjs/index.js -> BUILTINS + CATS (galleries)
//   - src/faces/photo-face/src/c/main.c      -> s_builtin_resources[]
//   - src/faces/photo-face/package.json      -> pebble.resources.media (bundled only)
// Plus the converted assets themselves:
//   docs/photo-face/processed/<name>.png     settings-page previews (all)
//   docs/photo-face/processed/<name>.b64     streamed copies (all; 32KB cap,
//                                            un-streamable images are DROPPED
//                                            from the catalog)
//   src/faces/photo-face/resources/images/builtin-<name>.png  (bundled only)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'docs', 'photo-face');
const imgDir = path.join(docsDir, 'img');
const processedDir = path.join(docsDir, 'processed');
const faceDir = path.join(root, 'src', 'faces', 'photo-face');
const resDir = path.join(faceDir, 'resources', 'images');

const START = '// >>>GEN:GALLERY>>>';
const END = '// <<<GEN:GALLERY<<<';

function replaceRegion(text, body, what) {
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`Missing GEN:GALLERY markers in ${what}`);
  return text.slice(0, a + START.length) + '\n' + body + '\n' + text.slice(b);
}

// RESOURCE_ID / media name from a basename: 'cities-1' -> 'IMAGE_B_CITIES_1'.
const resName = (name) => 'IMAGE_B_' + name.toUpperCase().replace(/-/g, '_');

const manifestPath = path.join(docsDir, 'library.json');
if (!existsSync(manifestPath)) {
  console.error('No docs/photo-face/library.json — run: node scripts/import-photo-library.mjs <library.html>');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// --- Convert: everything gets a preview PNG + streamable b64; the first image
// of each category additionally becomes a bundled flash resource. ------------
mkdirSync(processedDir, { recursive: true });
mkdirSync(resDir, { recursive: true });
for (const f of readdirSync(processedDir)) rmSync(path.join(processedDir, f));
for (const f of readdirSync(resDir)) rmSync(path.join(resDir, f));

// Conversion lives in the SHARED converter, scripts/lib/emery-image.py — one
// quantizer for every face. Its browser twin is docs/shared/pebble-image.js
// (uploads); the two must stay in visual agreement.
const jobs = [];
const bundled = [];
for (const cat of manifest.categories) {
  cat.images.forEach((im, i) => {
    // Sources are cover-cropped to the screen (never stretched); `focus` in
    // library.json ([x, y] fractions, default centre) picks the crop window
    // for photos whose subject is off-centre.
    const job = {
      src: path.join(imgDir, `${im.file}.jpg`),
      png: path.join(processedDir, `${im.file}.png`),
      b64: path.join(processedDir, `${im.file}.b64`),
    };
    if (im.focus) { job.focus = im.focus; }
    if (i === 0) {
      job.dests = [path.join(resDir, `builtin-${im.file}.png`)];
      bundled.push(im.file);
    }
    jobs.push(job);
  });
}
const pyOut = execFileSync('python3', [path.join(root, 'scripts', 'lib', 'emery-image.py')], {
  input: JSON.stringify(jobs), stdio: ['pipe', 'pipe', 'inherit'], encoding: 'utf8',
});
const dropped = new Set();
for (const line of pyOut.trim().split('\n')) {
  if (line.startsWith('DROP ')) {
    dropped.add(path.basename(line.slice(5), '.jpg'));
  } else { console.log(line.replace(/^DONE /, '')); }
}
// A dropped BUNDLED image still works from flash (the cap is stream-only), but
// keeping it would mean one image the page can't re-send. Simpler contract:
// bundled images small enough to stream, streamed images streamable, or out.
for (const name of dropped) {
  if (bundled.includes(name)) {
    console.error(`WARN: bundled ${name} exceeds the stream cap — dropping it from the catalog too.`);
    bundled.splice(bundled.indexOf(name), 1);
    rmSync(path.join(resDir, `builtin-${name}.png`), { force: true });
  }
}

// Catalog after drops, still grouped by category.
const catalog = manifest.categories.map((cat) => ({
  slug: cat.slug,
  name: cat.name,
  images: cat.images.filter((im) => !dropped.has(im.file)),
})).filter((cat) => cat.images.length);

const allNames = catalog.flatMap((c) => c.images.map((im) => im.file));

// --- 1. config.html GALLERY ------------------------------------------------
const cfgPath = path.join(docsDir, 'config.html');
const galleryLit = '    var GALLERY = [\n'
  + catalog.flatMap((cat) => cat.images.map((im) =>
      `      { key: '${im.file}', name: ${JSON.stringify(im.title)}, cat: ${JSON.stringify(cat.name)}, file: 'img/${im.file}.jpg', bundled: ${bundled.includes(im.file)}`
      + (im.focus ? `, focus: [${im.focus[0]}, ${im.focus[1]}]` : '') + ' }'))
    .join(',\n')
  + '\n    ];\n'
  + '    var CATS = [\n'
  + catalog.map((cat) => `      { slug: '${cat.slug}', name: ${JSON.stringify(cat.name)} }`).join(',\n')
  + '\n    ];';
writeFileSync(cfgPath, replaceRegion(readFileSync(cfgPath, 'utf8'), galleryLit, 'config.html'));

// --- 2. PKJS: bundled list + category map for the default galleries ---------
const pkjsPath = path.join(faceDir, 'src', 'pkjs', 'index.js');
const pkjsLit = 'var BUILTINS = [\n  '
  + bundled.map((n) => `'${n}'`).join(', ')
  + '\n];\n'
  + '// Every image in the library, category slug -> ordered names. First of each\n'
  + '// category is bundled (see BUILTINS); the rest stream from Pages.\n'
  + 'var LIBRARY = {\n'
  + catalog.map((cat) => `  ${cat.slug}: [${cat.images.map((im) => `'${im.file}'`).join(', ')}]`).join(',\n')
  + '\n};\n'
  + 'var CAT_NAMES = {\n'
  + catalog.map((cat) => `  ${cat.slug}: ${JSON.stringify(cat.name)}`).join(',\n')
  + '\n};';
writeFileSync(pkjsPath, replaceRegion(readFileSync(pkjsPath, 'utf8'), pkjsLit, 'pkjs/index.js'));

// --- 3. C resource table (bundled only) --------------------------------------
const cPath = path.join(faceDir, 'src', 'c', 'main.c');
const cLit = 'static const uint32_t s_builtin_resources[] = {\n'
  + bundled.map((n) => `  RESOURCE_ID_${resName(n)},`).join('\n')
  + '\n};';
writeFileSync(cPath, replaceRegion(readFileSync(cPath, 'utf8'), cLit, 'main.c'));

// --- 4. package.json media (bundled only) ------------------------------------
const pkgPath = path.join(faceDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
// Keep every non-generated resource (custom fonts etc.); only the bundled
// IMAGE_B_* rows belong to this generator.
pkg.pebble.resources.media = [
  ...(pkg.pebble.resources.media || []).filter((m) => !String(m.name).startsWith('IMAGE_B_')),
  ...bundled.map((n) => ({
    type: 'png', name: resName(n), file: `images/builtin-${n}.png`,
  })),
];
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const flash = bundled.reduce((s, n) => s + statSync(path.join(resDir, `builtin-${n}.png`)).size, 0);
console.log(`${allNames.length} images in ${catalog.length} categories `
  + `(${bundled.length} bundled = ${(flash / 1024).toFixed(0)}KB flash, `
  + `${allNames.length - bundled.length} streamed, ${dropped.size} dropped un-streamable)`);
console.log('Build with: npm run pebble:build -- photo-face');
console.log('Publish (required for streaming!): npm run pebble:publish-config');

syncFaceRuntime(faceDir);
