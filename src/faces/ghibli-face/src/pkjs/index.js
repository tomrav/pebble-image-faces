// Ghibli Time PKJS — serves images and settings to the watchface.
//
// GENERATED from src/shared/franchise-face/pkjs.tmpl.js by
// scripts/gen-franchise-faces.mjs — edit the template, not this copy.
//
// The WATCH owns rotation and, since 1.3.0, the playback decision too: it has
// the selection (SEL_IDS + SEL_GROUPS), the cursor and — for anything bundled or
// cached — the bytes, so a shake draws the next image with no round-trip. This
// side owns the catalog, the settings and the config of record (localStorage
// 'cfg', edited on the hosted settings page): it mirrors the watch's cursor
// (CURSOR_IDX), answers REQUEST_IDX with bytes, and keeps the watch's cache
// filled. A watch binary older than 1.3.0 still drives REQUEST_NEXT. Image refs:
//   'b:<group>/<slug>'  bundled in the .pbw — reply with its BUILTINS index
//                       (IMG_BUILTIN), no bytes on the wire.
//   'r:<group>/<slug>'  hosted — fetch processed/<group>/<slug>.b64 from
//                       Pages and stream it chunked (IMG_TOTAL + IMG_CHUNK).
// Settings ride S_* keys; weather (Open-Meteo, geolocated) rides TEMP_NOW +
// COND_NOW. Per-image look overrides (cfg.overrides[ref]) ride each image
// push on the OV_* keys, so the look changes atomically with the image.
//
// The settings model (data-point grid, looks, overrides) is ported from
// photo-face's index.js — keep the two in sync when porting improvements.

var BASE = 'https://glass-config.pages.dev/faces/ghibli/';
// Extensionless on purpose: Cloudflare Pages 308-redirects 'config.html' to
// 'config', and the phone webview shouldn't have to follow that to open settings.
var CONFIG_URL = BASE + 'config';

// Bundled images. The order IS the wire protocol: the watch's
// s_builtin_resources[] table is generated in the same order, and IMG_BUILTIN
// carries an index into it.
// >>>GEN:GALLERY>>>
var BUILTINS = [
  'char/totoro',
  'char/no-face',
  'char/calcifer',
  'char/kiki',
  'char/ponyo',
  'char/catbus',
  'char/chihiro-ogino',
  'char/howl',
  'char/porco-rosso-character',
];
// <<<GEN:GALLERY<<<

// MUST fit the watch's app_message_open inbox (4200) minus dict overhead.
// 4KB chunks make a 15KB stream ~4 ack round-trips instead of ~30.
var CHUNK_SIZE = 4096;
var MAX_RETRIES = 3;
// MUST match MAX_IMAGE_BYTES in the C code.
var MAX_IMAGE_BYTES = 32768;

function b64ToBytes(b64) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var bytes = [], buf = 0, bits = 0;
  for (var i = 0; i < b64.length; i++) {
    var v = chars.indexOf(b64.charAt(i));
    if (v < 0) { continue; }
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xFF); }
  }
  return bytes;
}

// --- Config (persisted) --------------------------------------------------
function defaultCfg() {
  return {
    sel: BUILTINS.map(function (k) { return 'b:' + k; }),  // bundled set by default
    shuffle: false,
    rotateMin: 30,
    shake: true,
    // Overlay + advance settings, mirroring the C defaults.
    clockPos: 2, timeFmt: 0, seconds: 0,
    tempUnit: 'c', font: 0, fontAll: 1, fontSize: 1, color: 0, bg: 0,
    // Date under the clock (bottom-center), spinner beside it bottom-right —
    // the classic layout.
    grid: [{ k: 'date', pos: 8 }, { k: 'spin', pos: 9 }],
    overrides: {},
    cursor: 0
  };
}

// The data-point registry: adding a future data point is one row here plus its
// S_POS_* message key (and the C/page rows). Order fixes the wire key mapping.
var DATA_POINTS = ['date', 'batt', 'steps', 'temp', 'hr', 'cond', 'conn', 'spin'];

function gridHas(k) {
  for (var i = 0; i < (cfg.grid || []).length; i++) {
    if (cfg.grid[i].k === k) { return true; }
  }
  return false;
}

// Old toggle-era configs: every enabled data point lands in the cell under the
// clock, in the old fixed order — exactly the layout those settings produced.
// (Themed settings pages that predate the grid still send the toggle fields;
// this normalizes their output too, not just old saved configs.)
function migrateGrid(c) {
  if (c.grid) { return; }
  var under = (c.clockPos === undefined ? 2 : c.clockPos) * 3 + 2;
  var flags = { date: c.showDate, batt: c.showBatt, steps: c.showSteps, temp: c.showTemp, hr: c.showHr };
  c.grid = [];
  for (var i = 0; i < DATA_POINTS.length; i++) {
    if (flags[DATA_POINTS[i]]) { c.grid.push({ k: DATA_POINTS[i], pos: under }); }
  }
  delete c.showDate; delete c.showBatt; delete c.showSteps; delete c.showTemp; delete c.showHr;
}

// The loading spinner is a placeable data point; configs saved before it
// existed don't mention it. Seed it once where it used to live (bottom
// right) — after that the user owns it, including removing it.
function seedSpin(c) {
  if (c.spinSeeded) { return; }
  var hasSpin = false;
  for (var i = 0; i < c.grid.length; i++) { if (c.grid[i].k === 'spin') { hasSpin = true; } }
  if (!hasSpin) { c.grid.push({ k: 'spin', pos: 9 }); }
  c.spinSeeded = true;
}

function loadCfg() {
  try {
    var raw = localStorage.getItem('cfg');
    if (!raw) { return defaultCfg(); }
    var c = JSON.parse(raw);
    if (!c || !c.sel || !c.sel.length) { return defaultCfg(); }
    var d = defaultCfg();
    for (var k in d) { if (d.hasOwnProperty(k) && c[k] === undefined && k !== 'grid') { c[k] = d[k]; } }
    migrateGrid(c);
    seedSpin(c);
    return c;
  } catch (e) { return defaultCfg(); }
}

function saveCfg() { try { localStorage.setItem('cfg', JSON.stringify(cfg)); } catch (e) {} }

var cfg = loadCfg();

// --- Image identity -------------------------------------------------------
// Every catalog ref has a 32-bit id computed identically here and in the C
// code, so the watch can be asked to redraw a picture it already has instead
// of being sent 16 KB of it again. Built-ins are 1 + BUILTINS index; streamed
// refs hash their FULL ref string with FNV-1a and set bit 31. Id 0 is
// reserved for "unnamed" (a transfer from a phone JS older than 1.3.0).
function fnv1a32(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    // Hash the UTF-8 BYTES, which is what the C side sees. Refs are ASCII
    // slugs today; doing this properly keeps a non-ASCII one from diverging.
    var bytes = c < 0x80 ? [c]
              : c < 0x800 ? [0xc0 | (c >> 6), 0x80 | (c & 63)]
                          : [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)];
    for (var b = 0; b < bytes.length; b++) {
      h ^= bytes[b];
      // h *= 16777619, done in shifts: the plain multiply overflows 2^53 and
      // silently loses the low bits, which would desync the two sides.
      // 16777619 = 2^24 + 2^8 + 2^7 + 2^4 + 2^1 + 1.
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
  }
  return h >>> 0;
}

function idForRef(ref) {
  if (ref.charAt(0) === 'b') {
    var idx = BUILTINS.indexOf(ref.slice(2));
    return idx < 0 ? 0 : idx + 1;
  }
  return (fnv1a32(ref) | 0x80000000) >>> 0;
}

function hexId(id) { return ('0000000' + (id >>> 0).toString(16)).slice(-8); }

// --- Transfer ------------------------------------------------------------
// Transfers supersede: the latest DISPLAY request wins (see touch-glass for
// the ordering argument -- at most one stale message is in flight, and it
// lands before the new IMG_TOTAL which resets the watch's buffer). Background
// prefetches run in their own generation and are superseded by ANY display
// request, so a shake never waits behind 16 KB of background traffic.
var xferGen = 0;
function beginTransfer() { return ++xferGen; }

// Display transfers and background prefetches share one radio AND one receive
// buffer on the watch: an IMG_TOTAL resets whatever transfer is in flight, and
// IMG_CHUNK carries no identity, so a prefetch that begins while a display
// image is streaming eats it and interleaves its chunks into the prefetch
// buffer. Nothing on the watch can untangle that after the fact, so the rule
// lives here: a prefetch never starts while a display image needs the wire.
//
// Busy begins the moment a display request needs bytes sent -- the fetch
// counts, not just the chunks -- and pendingShow counts too, since an
// unanswered IMG_SHOW turns into a stream. Only the current generation may
// clear it: a superseded transfer noticing it is stale must not un-busy the
// newer request that replaced it (that one clears its own, or transferRef
// resets the flag when the new request needs no bytes at all).
var displayBusy = false;
function displayIdle(gen) { if (gen === xferGen) { displayBusy = false; } }
function displayIsBusy() { return displayBusy || !!pendingShow; }

// Per-image overrides ride the image push itself (-1 = no override), so the
// look always changes atomically with the image.
function ovMsg(ref) {
  var o = (cfg.overrides || {})[ref] || {};
  return {
    OV_POS: o.pos === undefined ? -1 : o.pos,
    OV_INK: o.ink ? parseInt(o.ink.slice(1), 16) : -1,
    OV_BG: o.bg === undefined ? -1 : o.bg,
    OV_BAR: o.bar ? parseInt(o.bar.slice(1), 16) : -1
  };
}

// The same 32-bit word the C packs into a slot header (ov_pack): byte0 clock
// pos + 1, byte1 ink + 1, byte2 backdrop + 1, byte3 bar + 1, 0 = no override.
// Colors are 6-bit Pebble palette indices (2 bits per channel) — which is all
// the display keeps of a 0xRRGGBB value anyway.
function ovPackColor(hex) {
  if (!hex) { return 0; }
  var v = parseInt(String(hex).slice(1), 16);
  if (isNaN(v)) { return 0; }
  return 1 + (((v >> 22) & 3) << 4) + (((v >> 14) & 3) << 2) + ((v >> 6) & 3);
}

function ovWordFor(ref) {
  var o = (cfg.overrides || {})[ref] || {};
  var pos = (o.pos === undefined || o.pos === null) ? 0 : (o.pos | 0) + 1;
  var bg = (o.bg === undefined || o.bg === null) ? 0 : (o.bg | 0) + 1;
  return (((pos & 0xff)) | (ovPackColor(o.ink) << 8) |
          ((bg & 0xff) << 16) | (ovPackColor(o.bar) << 24)) >>> 0;
}

// pf, when set, marks a background prefetch: { gen, xg } are snapshots of
// pfGen and xferGen taken when it started, so a newer prefetch round or any
// display request abandons it mid-stream.
function sendStatus(text) { console.log('Status: ' + text); }
var sendTransfer = require('./image-transfer').create({
  send: function (msg, ok, fail) { Pebble.sendAppMessage(msg, ok, fail); },
  log: function (msg) { console.log(msg); },
  status: sendStatus,
  idle: displayIdle,
  stale: function (gen, pf) { return pf ? pf.gen !== pfGen || pf.xg !== xferGen || pf.item !== pfInflight : gen !== xferGen; }
});

// In-memory cache of fetched hosted images (slug -> byte array). Keeps repeat
// visits instant; deliberately not persisted (localStorage stays for config).
var imgCache = {};

// A streamed image goes out as IMG_SHOW first: four bytes asking the watch to
// draw the copy it already holds. Only a CACHE_MISS -- or silence from a watch
// binary too old to know the key -- falls through to the 16 KB stream.
var SHOW_TIMEOUT_MS = 2500;  // a persist flush on the watch can hold the reply ~1 s
var pendingShow = null;  // { id, ref, gen, ovm, timer }

function clearPendingShow() {
  if (pendingShow && pendingShow.timer) { clearTimeout(pendingShow.timer); }
  pendingShow = null;
}

// skipShow = the watch has already said it doesn't have this image (it asked
// with REQUEST_IDX, or NEED_IMAGE in the handshake), so the IMG_SHOW probe
// would just cost 1.5 s before the stream it is going to need anyway.
function transferRef(ref, skipShow) {
  var gen = beginTransfer();
  var ovm = ovMsg(ref);
  var key = ref.slice(2);
  clearPendingShow();
  // This generation owns the wire now, and an earlier transfer's callbacks are
  // stale and will not clear the flag for us. A built-in needs no bytes at all,
  // so busy stays false unless IMG_SHOW/streamRef below asks for some.
  displayBusy = false;
  if (ref.charAt(0) === 'b') {
    var idx = BUILTINS.indexOf(key);
    if (idx < 0) { console.log('Unknown built-in ' + ref); return; }
    console.log('Built-in ' + key + ' -> index ' + idx + ' (bundled, no transfer)');
    var msg = { IMG_BUILTIN: idx, OV_POS: ovm.OV_POS, OV_INK: ovm.OV_INK,
                OV_BG: ovm.OV_BG, OV_BAR: ovm.OV_BAR };
    Pebble.sendAppMessage(msg, function () {}, function (err) {
      console.log('IMG_BUILTIN ' + idx + ' failed: ' + JSON.stringify(err));
    });
    return;
  }
  var id = idForRef(ref);
  if (skipShow) { streamRef(ref, gen, ovm, id); return; }
  var p = { id: id, ref: ref, gen: gen, ovm: ovm, timer: null };
  pendingShow = p;
  p.timer = setTimeout(function () {
    p.timer = null;
    if (pendingShow !== p || gen !== xferGen) { return; }
    console.log('IMG_SHOW ' + hexId(id) + ' unanswered in ' + SHOW_TIMEOUT_MS + 'ms, streaming');
    pendingShow = null;
    streamRef(ref, gen, ovm, id);
  }, SHOW_TIMEOUT_MS);
  console.log('IMG_SHOW ' + hexId(id) + ' for ' + ref);
  Pebble.sendAppMessage({ IMG_SHOW: id | 0, OV_POS: ovm.OV_POS, OV_INK: ovm.OV_INK,
                          OV_BG: ovm.OV_BG, OV_BAR: ovm.OV_BAR },
    function () {},
    function (err) {
      if (pendingShow !== p) { return; }
      console.log('IMG_SHOW send failed, streaming: ' + JSON.stringify(err));
      clearPendingShow();
      streamRef(ref, gen, ovm, id);
    });
}

// The old path, unchanged apart from carrying IMG_ID: fetch the watch-ready
// PNG from Pages and stream it chunked.
function streamRef(ref, gen, ovm, id) {
  var key = ref.slice(2);
  displayBusy = true;  // the wire is spoken for from here, fetch included
  if (imgCache[key]) { sendTransfer(imgCache[key], gen, ovm, id, null); return; }
  var url = BASE + 'processed/' + key + '.b64';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 12000;
  xhr.onload = function () {
    if (xhr.status !== 200) { console.log('Fetch ' + url + ' -> ' + xhr.status); displayIdle(gen); return; }
    var bytes = b64ToBytes(xhr.responseText);
    imgCache[key] = bytes;
    if (gen !== xferGen) { console.log('Fetch finished but superseded'); return; }
    console.log('Streaming ' + key + ' (' + bytes.length + ' bytes)');
    sendTransfer(bytes, gen, ovm, id, null);
  };
  xhr.onerror = function () { console.log('Fetch ' + url + ' failed'); displayIdle(gen); };
  xhr.ontimeout = xhr.onerror;
  xhr.send();
}

// --- On-watch cache ------------------------------------------------------
// Everything selected should live on the watch: then a shake is a four-byte
// IMG_SHOW instead of a Bluetooth round-trip, and going offline still rotates
// the user's real selection rather than only the bundled built-ins.
//
// SEL_IDS tells the watch what is selected (and frees the slots of anything
// that no longer is). CACHE_QUERY asks what it already holds; the CACHE_LIST
// reply builds a queue that is streamed ONE image at a time with
// IMG_PREFETCH, paced by the watch's CACHE_ACK plus a gap -- Bluetooth is
// shared with the phone app and this is background work.
var PF_GAP_MS = 2000;
// Flash writes yield per record; allow slow physical storage to finish.
var PF_TIMEOUT_MS = 120000;
// A CACHE_FULL is not necessarily fatal. Right after a display stream the watch
// is still writing that PNG to flash, so heap sits near the prefetch gate's
// floor for a few hundred ms and the very next prefetch is refused. Out of
// quota and out of slots ARE permanent (until the selection shrinks), so retry
// a few times: transient heap clears well inside 10 s, a genuinely full cache
// never does.
var PF_RETRY_MS = 10000;
var PF_FULL_MAX = 3;
var PF_MAX_SLOTS = 48;   // MUST match SLOT_COUNT in the C code
var SEL_MAX = 64;        // MUST match SEL_MAX in the C code

var pfGen = 0;
var pfQueue = [];
var pfInflight = null;   // { ref, id, gen, retried }
var pfTimer = null;      // gap between prefetches
var pfWaitTimer = null;  // waiting for CACHE_ACK / CACHE_FULL
var pfDeferLogged = false;  // logged one "display busy" defer; stay quiet until it clears
var pfAttempts = {};
var pfFullStreak = 0;       // consecutive CACHE_FULLs; PF_FULL_MAX of them ends the round

function pfStop() {
  pfGen++;
  pfQueue = [];
  pfAttempts = {};
  pfInflight = null;
  pfDeferLogged = false;
  pfFullStreak = 0;
  if (pfTimer) { clearTimeout(pfTimer); pfTimer = null; }
  if (pfWaitTimer) { clearTimeout(pfWaitTimer); pfWaitTimer = null; }
}

function pfSchedule(delay) {
  if (pfTimer) { clearTimeout(pfTimer); }
  var g = pfGen;
  pfTimer = setTimeout(function () {
    pfTimer = null;
    if (g === pfGen) { pfRun(); }
  }, delay);
}

function pfFinish(why) {
  if (pfWaitTimer) { clearTimeout(pfWaitTimer); pfWaitTimer = null; }
  pfInflight = null;
  console.log('Prefetch: ' + why + ' (' + pfQueue.length + ' left)');
  pfSchedule(PF_GAP_MS);
}

function pfRun() {
  if (pfInflight) { return; }
  if (!pfQueue.length) { console.log('Prefetch: round complete'); return; }
  // A display image on the wire owns it outright (see displayBusy above):
  // an IMG_TOTAL now would reset the watch's buffer under the picture the user
  // is waiting for. Wait a gap and look again -- the queue is not lost.
  if (displayIsBusy()) {
    if (!pfDeferLogged) {
      console.log('Prefetch: deferring, a display image is in flight (' + (pfQueue.length) + ' left)');
      pfDeferLogged = true;
    }
    pfSchedule(PF_GAP_MS);
    return;
  }
  pfDeferLogged = false;
  var ref = pfQueue.shift();
  pfAttempts[ref] = (pfAttempts[ref] || 0) + 1;
  var item = { ref: ref, id: idForRef(ref), gen: pfGen };
  pfInflight = item;
  var pf = { gen: pfGen, xg: xferGen, item: item };
  pfWaitTimer = setTimeout(function () {
    pfWaitTimer = null;
    if (pfInflight !== item) { return; }
    pfInflight = null;
    // No CACHE_ACK: either a display request made the watch abort the slot
    // write, or the message never landed. Requeue it once at the back, then
    // leave it for the next round.
    var requeued = pfAttempts[ref] < 2;
    if (requeued) { pfQueue.push(ref); }
    console.log('Prefetch ' + ref + ' timed out' + (requeued ? ', requeued' : ', giving up'));
    pfSchedule(PF_GAP_MS);
  }, PF_TIMEOUT_MS);

  var key = ref.slice(2);
  if (imgCache[key]) {
    console.log('Prefetching ' + key + ' as ' + hexId(item.id) + ' (' + imgCache[key].length + ' bytes, cached)');
    sendTransfer(imgCache[key], 0, ovMsg(ref), item.id, pf);
    return;
  }
  var url = BASE + 'processed/' + key + '.b64';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 12000;
  xhr.onload = function () {
    if (pfInflight !== item || item.gen !== pfGen) { return; }
    if (xhr.status !== 200) { console.log('Prefetch fetch ' + url + ' -> ' + xhr.status); pfFinish('fetch failed'); return; }
    var bytes = b64ToBytes(xhr.responseText);
    imgCache[key] = bytes;
    // A display request landed while this was fetching. The bytes are kept, but
    // the IMG_TOTAL waits: it would reset the watch's receive buffer.
    if (displayIsBusy()) { pfQueue.unshift(ref); pfFinish('deferred ' + ref + ', display busy'); return; }
    console.log('Prefetching ' + key + ' as ' + hexId(item.id) + ' (' + bytes.length + ' bytes)');
    sendTransfer(bytes, 0, ovMsg(ref), item.id, pf);
  };
  xhr.onerror = function () {
    if (pfInflight !== item) { return; }
    pfFinish('fetch error');
  };
  xhr.ontimeout = xhr.onerror;
  xhr.send();
}

// The playable selection. One flat rotation for a franchise face, capped at
// what the watch can hold.
function selRefs() { return cfg.sel.slice(0, SEL_MAX); }

// Where the watch's cursor index lands in this config. True = it moved.
function setCursorFromIdx(idx) {
  if (idx < 0 || idx >= cfg.sel.length || cfg.cursor === idx) { return false; }
  cfg.cursor = idx;
  return true;
}

// The ordered selection as packed uint32 LE, plus one structure byte each
// (SEL_GROUPS: bits 0..6 group index, bit 7 = the group loops at its end). A
// franchise face is ONE looping group — the selection wraps at the end, which
// is what (cursor + 1) % n always did. The watch plays from this, and frees the
// slot of anything no longer in it.
function sendSelection() {
  var refs = selRefs(), bytes = [], groups = [];
  for (var i = 0; i < refs.length; i++) {
    var id = idForRef(refs[i]);
    bytes.push(id & 0xff, (id >>> 8) & 0xff, (id >>> 16) & 0xff, (id >>> 24) & 0xff);
    groups.push(0x80);
  }
  Pebble.sendAppMessage({ SEL_IDS: bytes, SEL_GROUPS: groups },
    function () { console.log('SEL_IDS sent (' + refs.length + ' images, 1 looping group)'); },
    function (err) { console.log('SEL_IDS failed: ' + JSON.stringify(err)); });
}

// --- Connect handshake ---------------------------------------------------
// On every connection (and after a settings save) the phone asks the watch one
// question and gets one answer: CACHE_LIST (what it holds, and under what look),
// CURSOR_IDX (where its cursor is — the watch advances on its own now, so ITS
// cursor is the real one) and NEED_IMAGE (it is sitting on a blank backdrop and
// wants exactly one image streamed). Silence means a watch binary older than
// 1.3.0: fall back to pushing the cursor's image, the way it always worked.
var HS_TIMEOUT_MS = 2000;
// A nack means the watch app is not taking messages yet: on a big cache its
// persist load takes seconds, and everything sent meanwhile (settings,
// selection, this query) is dropped. Retry the whole connect sequence rather
// than mistaking a slow launch for an old binary.
var HS_RETRY_MS = 1500;
var HS_MAX_TRIES = 10;
var hsTimer = null;
var hsPending = false;
var hsTries = 0;

function handshake() {
  hsTries = 0;
  handshakeTry();
}

function handshakeTry() {
  if (hsTimer) { clearTimeout(hsTimer); hsTimer = null; }
  hsPending = true;
  pfStop();
  Pebble.sendAppMessage({ CACHE_QUERY: 1 },
    function () {
      console.log('CACHE_QUERY sent');
      hsTimer = setTimeout(function () {
        hsTimer = null;
        if (!hsPending) { return; }
        hsPending = false;
        console.log('No CACHE_LIST in ' + HS_TIMEOUT_MS + 'ms: pre-1.3.0 watch, pushing the cursor image');
        currentImage();
      }, HS_TIMEOUT_MS);
    },
    function (err) {
      if (++hsTries < HS_MAX_TRIES) {
        console.log('CACHE_QUERY nack (watch still starting?), retry ' + hsTries + ' in ' + HS_RETRY_MS + 'ms');
        hsTimer = setTimeout(function () {
          hsTimer = null;
          sendSettings();
          sendSelection();
          handshakeTry();
        }, HS_RETRY_MS);
      } else {
        hsPending = false;
        console.log('CACHE_QUERY failed for good: ' + JSON.stringify(err));
      }
    });
}

function rd32(b, i) {
  return ((b[i] & 0xff) | ((b[i + 1] & 0xff) << 8) |
          ((b[i + 2] & 0xff) << 16) | ((b[i + 3] & 0xff) << 24)) >>> 0;
}

// The watch's stored overrides, reconciled against the config one image at a
// time. Only images the watch actually holds are worth an OV_SET; anything it
// is about to be sent gets its look with the transfer.
function sendOvDiffs(have) {
  var refs = selRefs(), q = [];
  for (var i = 0; i < refs.length; i++) {
    var id = idForRef(refs[i]);
    if (!(id in have) || have[id] === ovWordFor(refs[i])) { continue; }
    q.push(refs[i]);
  }
  if (!q.length) { return; }
  console.log('OV_SET: ' + q.length + ' image(s) differ from the watch');
  (function send(k) {
    if (k >= q.length) { return; }
    var ref = q[k], ovm = ovMsg(ref), id = idForRef(ref);
    Pebble.sendAppMessage({ OV_SET: id | 0, OV_POS: ovm.OV_POS, OV_INK: ovm.OV_INK,
                            OV_BG: ovm.OV_BG, OV_BAR: ovm.OV_BAR },
      function () { console.log('OV_SET ' + hexId(id) + ' -> ' + ref); send(k + 1); },
      function (err) { console.log('OV_SET ' + ref + ' failed: ' + JSON.stringify(err)); send(k + 1); });
  })(0);
}

function onCacheList(bytes, cursorIdx, needImage) {
  hsPending = false;
  if (hsTimer) { clearTimeout(hsTimer); hsTimer = null; }
  var have = {}, slotsUsed = 0;
  for (var i = 0; i + 7 < bytes.length; i += 8) {
    var id = rd32(bytes, i);
    // Built-ins (id 1..255) are listed for their overrides only; they cost no
    // slot, so they must not count against the slot budget below.
    if (!(id in have) && id >= 0x80000000) { slotsUsed++; }
    have[id] = rd32(bytes, i + 4);
  }
  pfStop();
  var refs = selRefs();
  console.log('CACHE_LIST: watch holds ' + slotsUsed + ' streamed image(s), cursor ' +
              cursorIdx + ', need_image ' + (needImage ? 1 : 0));
  // The watch owns the cursor; adopt it rather than pushing ours back.
  if (cursorIdx >= 0 && setCursorFromIdx(cursorIdx)) { saveCfg(); }
  if (needImage) {
    var want = refs[cursorIdx >= 0 ? cursorIdx : 0];
    if (want) {
      console.log('Watch is holding a blank backdrop, streaming ' + want);
      transferRef(want, true);
    }
  }
  sendOvDiffs(have);
  var queued = [], seen = {};
  for (var j = 0; j < refs.length && queued.length + slotsUsed < PF_MAX_SLOTS; j++) {
    var ref = refs[j];
    if (ref.charAt(0) === 'b') { continue; }  // bundled: already in flash
    var rid = idForRef(ref);
    // seen[] also covers the (astronomically unlikely) case of two selected
    // refs hashing to the same id: only the first is cached.
    if ((rid in have) || seen[rid]) { continue; }
    seen[rid] = true;
    queued.push(ref);
  }
  pfQueue = queued;
  console.log('Prefetch queue: ' + queued.length + ' image(s)');
  if (queued.length) { pfSchedule(PF_START_DELAY_MS); }
}

// CURSOR_IDX on its own: the watch advanced locally and is telling us where it
// went, so the settings page and any later push agree with the screen.
function onCursorIdx(idx) {
  // A local display supersedes foreground fetches/chunks, even if the phone's
  // saved cursor already happens to match. The watch is authoritative.
  beginTransfer();
  clearPendingShow();
  displayBusy = false;
  if (setCursorFromIdx(idx)) {
    saveCfg();
    console.log('Watch advanced to entry ' + idx);
  }
}

// REQUEST_IDX: the watch wants an entry it doesn't hold. It has already moved
// its cursor there, so this is a plain display stream (no IMG_SHOW probe — it
// just told us the answer would be a miss).
function onRequestIdx(idx) {
  var refs = selRefs();
  if (idx < 0 || idx >= refs.length) { console.log('REQUEST_IDX ' + idx + ' out of range'); return; }
  if (setCursorFromIdx(idx)) { saveCfg(); }
  console.log('REQUEST_IDX ' + idx + ' -> ' + refs[idx]);
  transferRef(refs[idx], true);
}

// --- Playback ------------------------------------------------------------
// Shuffle bag: indices into cfg.sel, consumed without repeats.
function shufflePick() {
  if (!cfg.bag || !cfg.bag.length) {
    cfg.bag = [];
    for (var i = 0; i < cfg.sel.length; i++) { if (i !== cfg.cursor) { cfg.bag.push(i); } }
  }
  if (!cfg.bag.length) { return cfg.cursor; }
  var at = Math.floor(Math.random() * cfg.bag.length);
  var pick = cfg.bag.splice(at, 1)[0];
  return pick;
}

function nextImage() {
  if (!cfg.sel.length) { console.log('Nothing selected'); return; }
  if (cfg.cursor >= cfg.sel.length) { cfg.cursor = 0; }
  cfg.cursor = cfg.shuffle ? shufflePick() : (cfg.cursor + 1) % cfg.sel.length;
  saveCfg();
  var ref = cfg.sel[cfg.cursor];
  console.log('Next image [' + (cfg.cursor + 1) + '/' + cfg.sel.length + '] ' + ref);
  transferRef(ref);
}

function currentImage() {
  if (!cfg.sel.length) { return; }
  if (cfg.cursor >= cfg.sel.length) { cfg.cursor = 0; }
  transferRef(cfg.sel[cfg.cursor]);
}

// --- Settings + weather ----------------------------------------------------
// Push the overlay + advance settings the watch owns. The watch runs its own
// rotation timer and shake handler off these, then asks for the next image.
function sendSettings() {
  var msg = {
    S_ROTATE_MIN: cfg.rotateMin,
    S_SHAKE: cfg.shake ? 1 : 0,
    // The watch picks the next image itself now, so it needs the mode.
    S_SHUFFLE: cfg.shuffle ? 1 : 0,
    S_CLOCK_POS: cfg.clockPos,
    S_TIME_FMT: cfg.timeFmt || 0,
    S_SECONDS: cfg.seconds ? 1 : 0,
    S_FONT: cfg.font,
    S_FONT_ALL: cfg.fontAll === undefined ? 1 : cfg.fontAll,
    S_FONT_SIZE: cfg.fontSize === undefined ? 1 : cfg.fontSize,
    S_COLOR: cfg.color,
    // Explicit 0xRRGGBB ink/bar for grid-era watches; S_COLOR stays for the
    // wire's sake. Bar -1 = auto (inverse of the ink).
    S_INK_COLOR: cfg.inkHex ? parseInt(cfg.inkHex.slice(1), 16)
                            : (cfg.color === 1 ? 0x000000 : 0xffffff),
    S_BAR_COLOR: cfg.barHex ? parseInt(cfg.barHex.slice(1), 16) : -1,
    S_BG: cfg.bg
  };
  // One position key per data point: 0 = off, else placement-index*10 + cell.
  var posKeys = { date: 'S_POS_DATE', batt: 'S_POS_BATT', steps: 'S_POS_STEPS',
                  temp: 'S_POS_TEMP', hr: 'S_POS_HR', cond: 'S_POS_COND',
                  conn: 'S_POS_CONN', spin: 'S_POS_SPIN' };
  for (var k in posKeys) { msg[posKeys[k]] = 0; }
  for (var i = 0; i < cfg.grid.length; i++) {
    var e = cfg.grid[i];
    if (posKeys[e.k]) { msg[posKeys[e.k]] = i * 10 + e.pos; }
  }
  Pebble.sendAppMessage(msg, function () { console.log('Settings sent'); },
     function (err) { console.log('Settings send failed: ' + JSON.stringify(err)); });
  console.log('Settings -> rotate ' + cfg.rotateMin + 'min, grid ' + JSON.stringify(cfg.grid));
}

// Weather via Open-Meteo (keyless). Fetched only while the temperature or
// weather-condition point is placed; refreshed every 30 minutes.
var WEATHER_REFRESH_MS = 30 * 60 * 1000;
var weatherTimer = null;

function fetchWeather() {
  if (!gridHas('temp') && !gridHas('cond')) { return; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    var unit = cfg.tempUnit === 'c' ? 'celsius' : 'fahrenheit';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pos.coords.latitude.toFixed(3) +
      '&longitude=' + pos.coords.longitude.toFixed(3) +
      '&current=temperature_2m,weather_code,is_day&temperature_unit=' + unit;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
  xhr.timeout = 12000;
    xhr.onload = function () {
      try {
        var cur = JSON.parse(xhr.responseText).current;
        var t = Math.round(cur.temperature_2m);
        // WMO weather_code -> the watch's COND_* buckets:
        // 0 sun, 1 part, 2 cloud, 3 fog, 4 rain, 5 snow, 6 storm
        var wc = cur.weather_code, cond;
        if (wc === 0 || wc === 1) { cond = 0; }
        else if (wc === 2) { cond = 1; }
        else if (wc === 3) { cond = 2; }
        else if (wc === 45 || wc === 48) { cond = 3; }
        else if ((wc >= 71 && wc <= 77) || wc === 85 || wc === 86) { cond = 5; }
        else if (wc >= 95) { cond = 6; }
        else { cond = 4; }  // drizzle/rain/showers
        // Bit 3 flags night, so clear/partly-cloudy draw a moon after sunset.
        if (cur.is_day === 0) { cond |= 8; }
        console.log('Weather: ' + t + '°' + cfg.tempUnit.toUpperCase() + ', code ' + wc + ' -> ' + cond);
        Pebble.sendAppMessage({ TEMP_NOW: t, COND_NOW: cond }, function () {}, function () {});
      } catch (e) { console.log('Weather parse failed: ' + e); }
    };
    xhr.onerror = function () { console.log('Weather fetch failed'); };
    xhr.ontimeout = xhr.onerror;
  xhr.send();
  }, function (err) {
    console.log('Geolocation failed: ' + JSON.stringify(err));
  }, { maximumAge: 15 * 60 * 1000, timeout: 15000 });
}

function armWeather() {
  if (weatherTimer) { clearInterval(weatherTimer); weatherTimer = null; }
  if (gridHas('temp') || gridHas('cond')) {
    fetchWeather();
    weatherTimer = setInterval(fetchWeather, WEATHER_REFRESH_MS);
  }
}

// --- Events --------------------------------------------------------------
// A prefetch round costs a few hundred KB of Bluetooth; give the image the
// user is actually looking at the radio to itself first.
var PF_START_DELAY_MS = 5000;

Pebble.addEventListener('ready', function () {
  console.log('Ghibli Time PKJS ready');
  // Selection first, then ask the watch where it is. It is already showing the
  // right image in the normal case (it kept the whole rotation on flash), so
  // pushing one at it on every connect would only flip the picture; the
  // handshake's NEED_IMAGE says when one really is wanted.
  sendSettings();
  armWeather();
  // 'ready' fires once per connection, so a reconnect re-runs the round and
  // picks up whatever was still missing when the phone last went away.
  sendSelection();
  handshake();
});

Pebble.addEventListener('appmessage', function (e) {
  if (!e || !e.payload) { return; }
  var p = e.payload;
  // REQUEST_NEXT is the legacy path (a watch binary that never sent SEL_IDS).
  if (p.REQUEST_NEXT !== undefined) { nextImage(); }
  if (p.REQUEST_IDX !== undefined) { onRequestIdx(p.REQUEST_IDX); }
  if (p.CACHE_LIST !== undefined) {
    onCacheList(p.CACHE_LIST || [], p.CURSOR_IDX === undefined ? -1 : p.CURSOR_IDX,
                !!p.NEED_IMAGE);
  } else if (p.CURSOR_IDX !== undefined) { onCursorIdx(p.CURSOR_IDX); }
  if (p.CACHE_MISS !== undefined) {
    var missId = p.CACHE_MISS >>> 0;
    if (pendingShow && pendingShow.id === missId) {
      var ps = pendingShow;
      clearPendingShow();
      console.log('CACHE_MISS ' + hexId(missId) + ' -> streaming ' + ps.ref);
      streamRef(ps.ref, ps.gen, ps.ovm, ps.id);
    }
  }
  if (p.CACHE_ACK !== undefined) {
    var ackId = p.CACHE_ACK >>> 0;
    pfFullStreak = 0;  // the watch took an image, so it is not full after all
    if (pendingShow && pendingShow.id === ackId) {
      console.log('CACHE_ACK ' + hexId(ackId) + ': shown from the watch cache, nothing streamed');
      clearPendingShow();
    } else if (pfInflight && pfInflight.id === ackId) {
      pfFinish('cached ' + pfInflight.ref + ' on the watch');
    }
  }
  if (p.CACHE_FULL !== undefined) {
    var fullId = p.CACHE_FULL >>> 0;
    if (!pfInflight || pfInflight.id !== fullId) {
      console.log('CACHE_FULL ' + hexId(fullId) + ' matches nothing in flight, ignoring');
    } else {
      var fullRef = pfInflight.ref;
      if (pfWaitTimer) { clearTimeout(pfWaitTimer); pfWaitTimer = null; }
      pfInflight = null;
      pfFullStreak++;
      if (pfFullStreak >= PF_FULL_MAX) {
        // Three refusals across ~30 s is not a busy heap, it is a full cache.
        console.log('CACHE_FULL x' + PF_FULL_MAX + ': watch is out of quota/slots, stopping this round');
        pfStop();
      } else {
        // The refusal does NOT stop the phone's sendTransfer: the watch took
        // the IMG_TOTAL message and merely declined to act on it, so the success
        // callback would happily stream 16 KB of chunks at a watch with no
        // active transfer. pfStop() used to abandon them as a side effect of
        // bumping pfGen; do that part deliberately now, keeping the queue.
        pfGen++;
        // Front of the queue, not the back: the selection order is what the
        // offline walk follows, so keep filling it in order.
        pfQueue.unshift(fullRef);
        console.log('CACHE_FULL ' + hexId(fullId) + ' (' + pfFullStreak + '/' + PF_FULL_MAX +
                    '): requeued ' + fullRef + ', retrying in ' + PF_RETRY_MS + 'ms');
        pfSchedule(PF_RETRY_MS);
      }
    }
  }
});

Pebble.addEventListener('showConfiguration', function () {
  var forPage = {};
  for (var k in cfg) { if (cfg.hasOwnProperty(k) && k !== 'bag') { forPage[k] = cfg[k]; } }
  // Cache-bust so the webview never opens a stale settings page.
  Pebble.openURL(CONFIG_URL + '?cb=' + Date.now() + '#' + encodeURIComponent(JSON.stringify(forPage)));
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) { console.log('Config cancelled'); return; }
  var resp;
  try { resp = JSON.parse(decodeURIComponent(e.response)); }
  catch (err) { console.log('Bad config response: ' + err); return; }
  if (!resp.sel || !resp.sel.length) { console.log('Config had no selection, ignoring'); return; }

  if (resp.sel.length > SEL_MAX) { console.log('Config rejected: at most 64 images'); return; }
  cfg = resp;
  cfg.bag = null;
  if (cfg.cursor === undefined || cfg.cursor >= cfg.sel.length) { cfg.cursor = 0; }
  // Fill any setting the page didn't send, so an older themed page can't
  // blank them (its toggle-era flags migrate into grid entries).
  var d = defaultCfg();
  ['rotateMin', 'shake', 'clockPos', 'timeFmt', 'seconds', 'tempUnit', 'font', 'fontAll', 'fontSize', 'color', 'bg'].forEach(function (k) {
    if (cfg[k] === undefined) { cfg[k] = d[k]; }
  });
  if (!cfg.overrides) { cfg.overrides = {}; }
  migrateGrid(cfg);
  seedSpin(cfg);
  saveCfg();
  console.log('Saved config: ' + cfg.sel.length + ' images selected');
  sendSettings();
  armWeather();
  // No image push: the watch keeps what is on screen unless it just left the
  // selection, which SEL_IDS makes it handle itself. The new selection frees
  // the slots of anything dropped, then the handshake fills in what was added.
  sendSelection();
  handshake();
});
