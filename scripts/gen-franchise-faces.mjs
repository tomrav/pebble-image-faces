import { syncFaceRuntime } from './lib/face-runtime.mjs';
// Generates the per-franchise watchface projects and their settings pages from
// the shared template in src/shared/franchise-face/ and the image packs in
// media/epaper/ (or $PEBBLE_MEDIA).
//
// For each entry in src/shared/franchise-face/franchises.json this writes:
//   src/faces/<project>/                     the Pebble project (GENERATED)
//     package.json                           uuid, messageKeys, bundled resources
//     wscript, src/c/main.c                  copies of the template (+ GEN region)
//     src/pkjs/index.js                      from pkjs.tmpl.js (+ BUILTINS region)
//     resources/images/builtin-*.png         palettized 200x228, from epaper/
//   docs/faces/<id>/                         the hosted side (GENERATED)
//     config.html                            from config.tmpl.html (+ CATALOG)
//     img/<group>/<slug>.png                 thumbnails for the settings page
//     processed/<group>/<slug>.b64           watch-ready PNGs the phone streams
//
// Image conversion (palettize + base64) shells out to python3/Pillow — the
// same stack the image packs were made with. Sources come from media/epaper/
// (already 200x228, dithered to the Pebble 64-color palette).
//
// Re-run after changing the template, franchises.json, or the image packs:
//   npm run pebble:gen-faces
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const tplDir = path.join(root, 'src', 'shared', 'franchise-face');
// Image packs: 200x228 PNGs already dithered to the Pebble 64-color palette, in
// media/epaper/<id>[_media|_artwork]/. PEBBLE_MEDIA overrides the location.
const mediaRoot = path.resolve(process.env.PEBBLE_MEDIA || path.join(root, 'media', 'epaper'));
const facesRoot = path.join(root, 'src', 'faces');
const docsRoot = path.join(root, 'docs', 'faces');

if (!existsSync(mediaRoot)) {
  console.error(`Image packs not found at ${mediaRoot} (set PEBBLE_MEDIA to override)`);
  process.exit(1);
}

const { faces } = JSON.parse(readFileSync(path.join(tplDir, 'franchises.json'), 'utf8'));

// Group key -> media dir suffix and settings-page label. Order here is the
// display order everywhere.
const GROUPS = [
  { key: 'char', suffix: '', label: 'Characters' },
  { key: 'media', suffix: '_media', label: 'Posters & box art' },
  { key: 'art', suffix: '_artwork', label: 'Artwork' },
];

const START = '// >>>GEN:GALLERY>>>';
const END = '// <<<GEN:GALLERY<<<';
const CAT_START = '// >>>GEN:CATALOG>>>';
const CAT_END = '// <<<GEN:CATALOG<<<';

// 'pokémon-red-and-blue' -> 'pokemon-red-and-blue' (ASCII slug; refs, file
// names and resource IDs all derive from this).
function sanitize(name) {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function titleCase(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// 'char/skull-kid' -> 'IMAGE_B_CHAR_SKULL_KID'
function resourceName(ref) {
  return 'IMAGE_B_' + ref.toUpperCase().replace(/[/-]/g, '_');
}

function replaceRegion(text, startMark, endMark, body, label) {
  const s = text.indexOf(startMark);
  const e = text.indexOf(endMark);
  if (s === -1 || e === -1) {
    console.error(`Region ${startMark} not found in ${label}`);
    process.exit(1);
  }
  return text.slice(0, s + startMark.length) + '\n' + body + '\n' + text.slice(e);
}

const mainTpl = readFileSync(path.join(tplDir, 'main.c'), 'utf8');
const pkjsTpl = readFileSync(path.join(tplDir, 'pkjs.tmpl.js'), 'utf8');
const configTpl = readFileSync(path.join(tplDir, 'config.tmpl.html'), 'utf8');

// One python3 run converts every image for all faces (job list on stdin).
const pyJobs = [];
const faceOutputs = [];

for (const face of faces) {
  // --- Catalog: every image the face offers, from the media repo -----------
  const catalog = []; // { ref: 'char/link', group, name, src }
  for (const g of GROUPS) {
    const dir = path.join(mediaRoot, face.id + g.suffix);
    if (!existsSync(dir)) {
      console.error(`${face.id}: missing media dir ${dir}`);
      process.exit(1);
    }
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.png')).sort()) {
      const slug = sanitize(f.replace(/\.png$/, ''));
      const ref = `${g.key}/${slug}`;
      if (catalog.some((c) => c.ref === ref)) {
        console.error(`${face.id}: duplicate slug after sanitizing: ${ref}`);
        process.exit(1);
      }
      catalog.push({ ref, group: g.label, name: titleCase(slug), src: path.join(dir, f) });
    }
  }

  const bundled = face.bundled;
  for (const ref of bundled) {
    if (!catalog.some((c) => c.ref === ref)) {
      console.error(`${face.id}: bundled ref '${ref}' not found in media repo`);
      process.exit(1);
    }
  }

  // --- Project directory ----------------------------------------------------
  const projDir = path.join(facesRoot, face.project);
  const imgDir = path.join(projDir, 'resources', 'images');
  rmSync(imgDir, { recursive: true, force: true }); // drop stale bundled images
  mkdirSync(path.join(projDir, 'src', 'c'), { recursive: true });
  mkdirSync(path.join(projDir, 'src', 'pkjs'), { recursive: true });
  mkdirSync(imgDir, { recursive: true });

  copyFileSync(path.join(tplDir, 'wscript'), path.join(projDir, 'wscript'));

  // Style fonts (shared across all faces; template owns the TTFs) and their
  // license texts, which must travel with every redistributed copy.
  const fontDir = path.join(projDir, 'resources', 'fonts');
  rmSync(fontDir, { recursive: true, force: true });
  mkdirSync(fontDir, { recursive: true });
  for (const f of readdirSync(path.join(tplDir, 'fonts')).filter((f) => /\.(ttf|txt)$/.test(f))) {
    copyFileSync(path.join(tplDir, 'fonts', f), path.join(fontDir, f));
  }

  // main.c: fill the builtin resource table.
  const table = `static const uint32_t s_builtin_resources[] = {\n` +
    bundled.map((r) => `  RESOURCE_ID_${resourceName(r)},`).join('\n') + `\n};`;
  writeFileSync(path.join(projDir, 'src', 'c', 'main.c'),
    replaceRegion(mainTpl, START, END, table, 'main.c'));

  // pkjs: BUILTINS in the same order as the C table.
  let pkjs = pkjsTpl
    .replaceAll('__FACE_ID__', face.id)
    .replaceAll('__FACE_TITLE__', face.displayName);
  const builtinsLit = `var BUILTINS = [\n` +
    bundled.map((r) => `  '${r}',`).join('\n') + `\n];`;
  pkjs = replaceRegion(pkjs, START, END, builtinsLit, 'pkjs');
  writeFileSync(path.join(projDir, 'src', 'pkjs', 'index.js'), pkjs);
  syncFaceRuntime(projDir);

  // package.json for the project.
  const pkg = {
    name: face.project,
    author: 'case',
    version: '1.3.6',  // failed phone saves are reported, not swallowed
    keywords: ['pebble-watchface'],
    private: true,
    dependencies: {},
    pebble: {
      displayName: face.displayName,
      uuid: face.uuid,
      sdkVersion: '3',
      enableMultiJS: true,
      capabilities: ['configurable', 'location', 'health'],
      // APPEND-ONLY wire ABI: array order assigns the numeric IDs shared by
      // the phone JS and the watch binary, which can transiently run
      // different versions. Never insert mid-list, never remove (the retired
      // S_SHOW_* toggles stay to keep every later ID stable).
      messageKeys: [
        'IMG_TOTAL', 'IMG_CHUNK', 'IMG_BUILTIN', 'REQUEST_NEXT', 'TEMP_NOW',
        'S_ROTATE_MIN', 'S_SHAKE', 'S_CLOCK_POS', 'S_SHOW_DATE', 'S_SHOW_BATT',
        'S_SHOW_STEPS', 'S_SHOW_TEMP', 'S_SHOW_HR', 'S_FONT', 'S_COLOR', 'S_BG',
        'S_POS_DATE', 'S_POS_BATT', 'S_POS_STEPS', 'S_POS_TEMP', 'S_POS_HR',
        'COND_NOW', 'S_POS_COND', 'S_POS_CONN', 'S_TIME_FMT', 'S_SECONDS',
        'S_POS_SPIN', 'S_FONT_ALL', 'S_INK_COLOR', 'S_BAR_COLOR',
        'OV_POS', 'OV_INK', 'OV_BG', 'OV_BAR', 'S_FONT_SIZE',
        'IMG_ID', 'IMG_SHOW', 'CACHE_MISS', 'CACHE_QUERY', 'CACHE_LIST',
        'CACHE_ACK', 'IMG_PREFETCH', 'SEL_IDS', 'CACHE_FULL',
        'SEL_GROUPS', 'S_SHUFFLE', 'CURSOR_IDX', 'REQUEST_IDX', 'OV_SET', 'NEED_IMAGE', 'IMG_SEQ', 'IMG_OFFSET'
      ],
      targetPlatforms: ['emery'],
      watchapp: { watchface: true },
      resources: {
        media: [
          // Style fonts, lazily loaded by main.c (clock digits + info text
          // subsets — same names/regex as photo-face's package.json).
          { type: 'font', name: 'FONT_PIXEL_44', file: 'fonts/VT323-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_SCRIPT_32', file: 'fonts/PermanentMarker-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_PIXEL_20', file: 'fonts/VT323-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_SCRIPT_16', file: 'fonts/PermanentMarker-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_TYPE_34', file: 'fonts/SpecialElite-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_TYPE_16', file: 'fonts/SpecialElite-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_NEON_30', file: 'fonts/Monoton-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_POSTER_36', file: 'fonts/AbrilFatface-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_POSTER_16', file: 'fonts/AbrilFatface-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_STENCIL_30', file: 'fonts/BlackOpsOne-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_STENCIL_14', file: 'fonts/BlackOpsOne-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_LCD_28', file: 'fonts/DSEG7Classic-Regular.ttf', characterRegex: '[0-9:]' },
          // Small/Large cuts of the same styles (S_FONT_SIZE); ~2-4KB each.
          { type: 'font', name: 'FONT_PIXEL_34', file: 'fonts/VT323-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_PIXEL_56', file: 'fonts/VT323-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_SCRIPT_24', file: 'fonts/PermanentMarker-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_SCRIPT_40', file: 'fonts/PermanentMarker-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_TYPE_26', file: 'fonts/SpecialElite-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_TYPE_42', file: 'fonts/SpecialElite-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_NEON_22', file: 'fonts/Monoton-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_NEON_38', file: 'fonts/Monoton-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_POSTER_28', file: 'fonts/AbrilFatface-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_POSTER_44', file: 'fonts/AbrilFatface-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_STENCIL_22', file: 'fonts/BlackOpsOne-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_STENCIL_38', file: 'fonts/BlackOpsOne-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_LCD_22', file: 'fonts/DSEG7Classic-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_LCD_36', file: 'fonts/DSEG7Classic-Regular.ttf', characterRegex: '[0-9:]' },
          { type: 'font', name: 'FONT_PIXEL_16', file: 'fonts/VT323-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_PIXEL_26', file: 'fonts/VT323-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_SCRIPT_13', file: 'fonts/PermanentMarker-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_SCRIPT_20', file: 'fonts/PermanentMarker-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_TYPE_13', file: 'fonts/SpecialElite-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_TYPE_20', file: 'fonts/SpecialElite-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_POSTER_13', file: 'fonts/AbrilFatface-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_POSTER_20', file: 'fonts/AbrilFatface-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_STENCIL_12', file: 'fonts/BlackOpsOne-Regular.ttf', characterRegex: '[ -~·°]' },
          { type: 'font', name: 'FONT_STENCIL_18', file: 'fonts/BlackOpsOne-Regular.ttf', characterRegex: '[ -~·°]' },
          ...bundled.map((r) => ({
            type: 'png',
            name: resourceName(r),
            file: `images/builtin-${r.replace('/', '-')}.png`
          }))
        ]
      }
    }
  };
  writeFileSync(path.join(projDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  // --- Hosted side ------------------------------------------------------------
  const faceDocs = path.join(docsRoot, face.id);
  rmSync(path.join(faceDocs, 'img'), { recursive: true, force: true });
  rmSync(path.join(faceDocs, 'processed'), { recursive: true, force: true });
  for (const g of GROUPS) {
    mkdirSync(path.join(faceDocs, 'img', g.key), { recursive: true });
    mkdirSync(path.join(faceDocs, 'processed', g.key), { recursive: true });
  }

  // --- Image jobs (config.html is written after conversion, which may drop
  // streamed images that can't fit the watch's 32KB transfer cap) -----------
  for (const c of catalog) {
    const job = { src: c.src, thumb: path.join(faceDocs, 'img', c.ref + '.png') };
    if (bundled.includes(c.ref)) {
      job.png = path.join(imgDir, `builtin-${c.ref.replace('/', '-')}.png`);
    } else {
      job.b64 = path.join(faceDocs, 'processed', c.ref + '.b64');
    }
    pyJobs.push(job);
  }

  // Per-franchise settings-page override: full custom page design lives in
  // pages/<id>.html (same placeholders + CATALOG region contract as the
  // generic template — see PAGE_CONTRACT.md); absent, the generic is used.
  const overridePath = path.join(tplDir, 'pages', `${face.id}.html`);
  const pageTpl = existsSync(overridePath) ? readFileSync(overridePath, 'utf8') : configTpl;

  faceOutputs.push({ face, faceDocs, catalog, bundled, pageTpl });
  console.log(`${face.project}: ${catalog.length} images in catalog, ${bundled.length} bundled`);
}

// --- Convert images (shared converter, one process for everything) ----------
// scripts/lib/emery-image.py owns quantization for ALL faces: pre-dithered
// epaper sources pass through untouched; anything off-palette gets the damped
// serpentine dither. Same stdout contract as before (DROP / DONE lines).
const pyOut = execFileSync('python3', [path.join(root, 'scripts', 'lib', 'emery-image.py')], {
  input: JSON.stringify(pyJobs), stdio: ['pipe', 'pipe', 'inherit'], encoding: 'utf8'
});
const droppedSrcs = new Set();
for (const line of pyOut.trim().split('\n')) {
  if (line.startsWith('DROP ')) { droppedSrcs.add(line.slice(5)); }
  else { console.log(line.replace(/^DONE /, '')); }
}

// --- Settings pages, excluding any dropped streamed images -------------------
for (const { face, faceDocs, catalog, bundled, pageTpl } of faceOutputs) {
  const usable = catalog.filter((c) => !droppedSrcs.has(c.src));
  if (usable.length < catalog.length) {
    console.log(`${face.project}: ${catalog.length - usable.length} un-streamable image(s) dropped from the catalog`);
  }
  const catalogLit = `    var CATALOG = [\n` + usable.map((c) => {
    const isBundled = bundled.includes(c.ref);
    const key = (isBundled ? 'b:' : 'r:') + c.ref;
    return `      { key: ${JSON.stringify(key)}, name: ${JSON.stringify(c.name)}, group: ${JSON.stringify(c.group)}, img: ${JSON.stringify('img/' + c.ref + '.png')} }`;
  }).join(',\n') + `\n    ];`;
  let page = pageTpl
    .replaceAll('__FACE_ID__', face.id)
    .replaceAll('__FACE_TITLE__', face.displayName);
  page = replaceRegion(page, CAT_START, CAT_END, catalogLit, 'config.html');
  writeFileSync(path.join(faceDocs, 'config.html'), page);
}

console.log(`Generated ${faces.length} face project(s). Build with: npm run pebble:build -- <project>`);
console.log('Publish the settings pages with: npm run pebble:publish-config');
