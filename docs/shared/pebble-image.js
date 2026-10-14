// Shared image pipeline for Pebble Time 2 (Emery) and Round 2 (gabbro)
// settings pages.
//
// Converts an <img> to a palettized PNG — 64 colors (2 bits/channel),
// Floyd–Steinberg dithering — sized to FIT (contain) or FILL (cover) the
// screen, returned as base64 for chunked transfer to the watch.
//
// The phone opens the page with ?platform=<name>. On gabbro the screen is a
// 260x260 circle: images are cut square, painted black outside the circle and
// sent as a STRIP PACK (one PNG per STRIP_ROWS rows, back to back), which the
// watch decodes strip by strip (src/shared/image-face/face-image.h). The twin
// of scripts/lib/emery-image.py; keep the two in step.
//
// Hosted on GitHub Pages and shared by every app/face config page, so the
// conversion lives in exactly one place. Exposes window.PebbleImage.
(function (global) {
  'use strict';

  var PLATFORM = (location.search.match(/[?&]platform=([a-z]+)/) || [])[1] || 'emery';
  var ROUND = PLATFORM === 'gabbro';
  var MAX_W = ROUND ? 260 : 200, MAX_H = ROUND ? 260 : 228;
  var STRIP_ROWS = 26;
  // Pages style the round preview off this class (face-ui.css, theme.css).
  if (ROUND) { document.documentElement.classList.add('pebble-round'); }

  // MUST match MAX_IMAGE_BYTES in the watchapp C code: the watch rejects any
  // transfer whose declared total exceeds it, so a larger PNG never displays.
  var MAX_IMAGE_BYTES = 32768;

  // Ceiling for the encoded config returned through the pebblejs://close# URL.
  // A URL the phone app can't deliver fails silently (no error, no save), so
  // pages must refuse to navigate past this. The old 250,000 assumed the
  // Android app relayed the URL through an intent (binder-limited); the current
  // app (1.12+) intercepts it inside the webview and hands it straight to the
  // PKJS runtime, and Chromium itself allows 2 MB URLs. 1.2M chars is under
  // test on device (2026-09-17); drop back to 250000 if a save vanishes.
  var MAX_CONFIG_URL_CHARS = 1200000;

  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) { c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function chunk(type, data) {
    var t = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
    var crc = crc32(t.concat(data));
    return u32(data.length).concat(t, data, u32(crc));
  }
  async function deflate(bytes) {
    var cs = new CompressionStream('deflate'); // zlib (RFC1950), as PNG IDAT needs
    var writer = cs.writable.getWriter();
    writer.write(new Uint8Array(bytes));
    writer.close();
    var out = [], reader = cs.readable.getReader();
    while (true) {
      var r = await reader.read();
      if (r.done) { break; }
      for (var i = 0; i < r.value.length; i++) { out.push(r.value[i]); }
    }
    return out;
  }
  async function buildPNG(w, h, indices, palette) {
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];
    var ihdr = u32(w).concat(u32(h), [8, 3, 0, 0, 0]); // 8-bit, color type 3 (palette)
    var plte = [];
    for (var i = 0; i < palette.length; i++) { plte.push(palette[i][0], palette[i][1], palette[i][2]); }
    var raw = [];
    for (var y = 0; y < h; y++) { raw.push(0); for (var x = 0; x < w; x++) { raw.push(indices[y * w + x]); } }
    var idat = await deflate(raw);
    return sig.concat(chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', idat), chunk('IEND', []));
  }

  // Dither against what the panel SHOWS, not the nominal palette — the twin of
  // dither() in scripts/lib/emery-image.py (keep them in step; A/B tested on a
  // Time 2, 2026-10-14):
  //   - DISPLAY is the colour the e-paper panel shows for each of the 64
  //     palette entries (measured from the SDK emulators, which model the
  //     panel). Saturated colours are far duller than nominal.
  //   - nearest colour by OKLab distance; error measured and diffused in
  //     linear light; serpentine Floyd–Steinberg, damped and clamped so
  //     colours the panel can't reach don't smear.
  //   - a light unsharp mask first: dither noise eats fine detail.
  var LEVELS = [0, 85, 170, 255];
  var DAMP = 0.9, CLAMP = 0.12;
  var SHARPEN = { sigma: 1, amount: 0.7, threshold: 2 };
  // Palette order: red-major, then green, then blue (levels 0/85/170/255).
  var DISPLAY = [
    '000000', '001e41', '004387', '0068ca', '2b4a2c', '27514f', '16638d', '007dce',
    '5e9860', '5c9b72', '57a5a2', '4cb4db', '8ee391', '8ee69e', '8aebc0', '84f5f1',
    '4a161b', '482748', '40488a', '2f6bcc', '564e36', '545454', '4f6790', '4180d0',
    '759a64', '759d76', '71a6a4', '69b5dd', '9ee594', '9de7a0', '9becc2', '95f6f2',
    '99353f', '983e5a', '955694', '8f74d2', '9d5b4d', '9d6064', '9a7099', '9587d5',
    'afa072', 'aea382', 'ababab', 'a7bae2', 'c9e89d', 'c9eaa7', 'c7f0c8', 'c3f9f7',
    'e35462', 'e25874', 'e16aa3', 'de83dc', 'e66e6b', 'e6727c', 'e37fa7', 'e194df',
    'f1aa86', 'f1ad93', 'efb5b8', 'ecc3eb', 'ffeeab', 'fff1b5', 'fff6d3', 'ffffff',
  ];
  function toLin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function oklab(r, g, b) {
    var l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
    var m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
    var s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  var NOMINAL = [], DISP_LIN = [], DISP_OK = [];
  for (var di = 0; di < 64; di++) {
    NOMINAL.push([LEVELS[di >> 4], LEVELS[(di >> 2) & 3], LEVELS[di & 3]]);
    var hx = DISPLAY[di], lin = [toLin(parseInt(hx.slice(0, 2), 16)), toLin(parseInt(hx.slice(2, 4), 16)), toLin(parseInt(hx.slice(4, 6), 16))];
    DISP_LIN.push(lin); DISP_OK.push(oklab(lin[0], lin[1], lin[2]));
  }
  // Nearest display colour per 7-bit linear colour, filled on demand.
  var NEAREST = new Uint8Array(128 * 128 * 128).fill(255);
  function nearest(r, g, b) {
    var qr = Math.max(0, Math.min(127, Math.round(r * 127))), qg = Math.max(0, Math.min(127, Math.round(g * 127))),
        qb = Math.max(0, Math.min(127, Math.round(b * 127)));
    var key = (qr * 128 + qg) * 128 + qb, k = NEAREST[key];
    if (k !== 255) { return k; }
    var o = oklab(qr / 127, qg / 127, qb / 127), best = 0, bd = Infinity;
    for (var i = 0; i < 64; i++) {
      var p = DISP_OK[i], dl = p[0] - o[0], da = p[1] - o[1], db = p[2] - o[2], dd = dl * dl + da * da + db * db;
      if (dd < bd) { bd = dd; best = i; }
    }
    NEAREST[key] = best;
    return best;
  }

  // Unsharp mask (gaussian sigma 1, separable), skipping differences at or
  // below the threshold — Pillow's UnsharpMask(1, 70, 2) on the Python side.
  function sharpen(src, w, h) {
    var k = [], ks = 0, R = 3;
    for (var t = -R; t <= R; t++) { var v = Math.exp(-t * t / (2 * SHARPEN.sigma * SHARPEN.sigma)); k.push(v); ks += v; }
    for (var t2 = 0; t2 < k.length; t2++) { k[t2] /= ks; }
    var tmp = new Float32Array(w * h * 3), blur = new Float32Array(w * h * 3), out = new Float32Array(w * h * 3);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        for (var c = 0; c < 3; c++) {
          var acc = 0;
          for (var t3 = -R; t3 <= R; t3++) { var xx = Math.max(0, Math.min(w - 1, x + t3)); acc += src[(y * w + xx) * 4 + c] * k[t3 + R]; }
          tmp[(y * w + x) * 3 + c] = acc;
        }
      }
    }
    for (var y2 = 0; y2 < h; y2++) {
      for (var x2 = 0; x2 < w; x2++) {
        for (var c2 = 0; c2 < 3; c2++) {
          var acc2 = 0;
          for (var t4 = -R; t4 <= R; t4++) { var yy = Math.max(0, Math.min(h - 1, y2 + t4)); acc2 += tmp[(yy * w + x2) * 3 + c2] * k[t4 + R]; }
          var o2 = src[(y2 * w + x2) * 4 + c2], diff = o2 - acc2;
          out[(y2 * w + x2) * 3 + c2] = Math.abs(diff) > SHARPEN.threshold ? Math.max(0, Math.min(255, o2 + diff * SHARPEN.amount)) : o2;
        }
      }
    }
    return out;
  }

  function quantize(ctx, w, h) {
    var sharp = sharpen(ctx.getImageData(0, 0, w, h).data, w, h);
    var buf = new Float32Array(w * h * 3);
    for (var i = 0; i < w * h * 3; i++) { buf[i] = toLin(sharp[i]); }
    function diffuse(idx, er, eg, eb, f) { buf[idx] += er * f; buf[idx + 1] += eg * f; buf[idx + 2] += eb * f; }
    function clampErr(e) { e *= DAMP; return e > CLAMP ? CLAMP : (e < -CLAMP ? -CLAMP : e); }
    var map = {}, palette = [], indices = new Array(w * h);
    for (var y = 0; y < h; y++) {
      var l2r = (y % 2 === 0), d = l2r ? 1 : -1;
      for (var q = 0; q < w; q++) {
        var x = l2r ? q : (w - 1 - q);
        var o = (y * w + x) * 3;
        var kk = nearest(buf[o], buf[o + 1], buf[o + 2]), dl = DISP_LIN[kk];
        var er = clampErr(buf[o] - dl[0]), eg = clampErr(buf[o + 1] - dl[1]), eb = clampErr(buf[o + 2] - dl[2]);
        if (x + d >= 0 && x + d < w) { diffuse((y * w + (x + d)) * 3, er, eg, eb, 7 / 16); }
        if (y + 1 < h) {
          if (x - d >= 0 && x - d < w) { diffuse(((y + 1) * w + (x - d)) * 3, er, eg, eb, 3 / 16); }
          diffuse(((y + 1) * w + x) * 3, er, eg, eb, 5 / 16);
          if (x + d >= 0 && x + d < w) { diffuse(((y + 1) * w + (x + d)) * 3, er, eg, eb, 1 / 16); }
        }
        var idx = map[kk];
        if (idx === undefined) { idx = palette.length; map[kk] = idx; palette.push(NOMINAL[kk]); }
        indices[y * w + x] = idx;
      }
    }
    return { palette: palette, indices: indices };
  }

  // Clamp a requested source rectangle to the image; whole image by default.
  function sourceRect(img, rect) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!rect) { return { x: 0, y: 0, w: iw, h: ih }; }
    var x = Math.max(0, Math.min(iw - 1, rect.x || 0)), y = Math.max(0, Math.min(ih - 1, rect.y || 0));
    var w = Math.max(1, Math.min(iw - x, rect.w || iw)), h = Math.max(1, Math.min(ih - y, rect.h || ih));
    return { x: x, y: y, w: w, h: h };
  }

  function bytesToBase64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) { s += String.fromCharCode(u8[i]); }
    return btoa(s);
  }

  // Round: paint everything outside the circle black after the dither, as
  // emery-image.py does (the watch never shows it; flat black costs nothing).
  function scrubRound(q, w, h) {
    var black = -1, r2 = Math.min(w, h) * Math.min(w, h);
    for (var i = 0; i < q.palette.length; i++) {
      if (!q.palette[i][0] && !q.palette[i][1] && !q.palette[i][2]) { black = i; }
    }
    if (black < 0) { black = q.palette.length; q.palette.push([0, 0, 0]); }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = 2 * x + 1 - w, dy = 2 * y + 1 - h;
        if (dx * dx + dy * dy > r2) { q.indices[y * w + x] = black; }
      }
    }
  }

  // One PNG per band of rows, each with only the colours it uses.
  async function buildStripPack(w, h, q) {
    var out = [];
    for (var y0 = 0; y0 < h; y0 += STRIP_ROWS) {
      var rows = Math.min(STRIP_ROWS, h - y0), map = {}, pal = [], idx = new Array(rows * w);
      for (var i = 0; i < rows * w; i++) {
        var c = q.indices[y0 * w + i], k = map[c];
        if (k === undefined) { k = pal.length; map[c] = k; pal.push(q.palette[c]); }
        idx[i] = k;
      }
      out = out.concat(await buildPNG(w, rows, idx, pal));
    }
    return out;
  }

  // Render an Image (or canvas) to a palettized PNG for the watch. opts.crop = fill
  // (cover) vs fit (contain). opts.rect = { x, y, w, h } picks a region of the
  // source, in source pixels, to treat as the whole picture (the cropper's
  // output); absent, the whole source is used. On round both modes fill the
  // whole 260x260 square (fit letterboxes on black) so the watch always gets a
  // strip pack. Returns { b64, preview, w, h, colors, bytes }: b64 is what the
  // watch receives, preview an ordinary PNG of the same pixels for the page.
  async function processImage(img, opts) {
    opts = opts || {};
    var r = sourceRect(img, opts.rect);
    var cv = document.createElement('canvas'), w, h, ctx;
    if (opts.crop) {
      var s = Math.max(MAX_W / r.w, MAX_H / r.h);
      var dw = Math.round(r.w * s), dh = Math.round(r.h * s);
      w = MAX_W; h = MAX_H;
      cv.width = w; cv.height = h;
      ctx = cv.getContext('2d');
      ctx.drawImage(img, r.x, r.y, r.w, r.h, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    } else if (ROUND) {
      var fr = Math.min(MAX_W / r.w, MAX_H / r.h);
      var fw = Math.round(r.w * fr), fh = Math.round(r.h * fr);
      w = MAX_W; h = MAX_H;
      cv.width = w; cv.height = h;
      ctx = cv.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, r.x, r.y, r.w, r.h, Math.round((w - fw) / 2), Math.round((h - fh) / 2), fw, fh);
    } else {
      var f = Math.min(MAX_W / r.w, MAX_H / r.h, 1);
      w = Math.max(1, Math.round(r.w * f));
      h = Math.max(1, Math.round(r.h * f));
      cv.width = w; cv.height = h;
      ctx = cv.getContext('2d');
      ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w, h);
    }
    // Round: the outside goes black after the dither (scrubRound), so the
    // sharpening sees the image run on past the edge, as emery-image.py does.
    var q = quantize(ctx, w, h);
    if (ROUND) { scrubRound(q, w, h); }
    var png = new Uint8Array(await buildPNG(w, h, q.indices, q.palette));
    var watch = ROUND ? new Uint8Array(await buildStripPack(w, h, q)) : png;
    var preview = bytesToBase64(png);
    return { b64: ROUND ? bytesToBase64(watch) : preview, preview: preview,
             w: w, h: h, colors: q.palette.length, bytes: watch.length };
  }

  // Where to send the result: the host (Pebble app / pypkjs) passes ?return_to=…;
  // fall back to pebblejs://close# for the phone app.
  function getReturnTo() {
    var m = location.search.match(/[?&]return_to=([^&]*)/);
    if (!m) { return 'pebblejs://close#'; }
    var target = decodeURIComponent(m[1]);
    // The SDK's local config server uses exactly /close? on a loopback port.
    // No arbitrary web destinations or executable URL schemes are callbacks.
    if (target === 'pebblejs://close#' ||
        /^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]{1,5}\/close\?$/.test(target)) {
      return target;
    }
    throw new Error('Unrecognized settings callback. Open settings from the Pebble app.');
  }
  function configError(cfg) {
    var count = Array.isArray(cfg.sel) ? cfg.sel.length : (cfg.galleries || []).reduce(function (n, g) {
      return n + (g.enabled && Array.isArray(g.items) ? g.items.length : 0);
    }, 0);
    // The phone ignores a franchise config with nothing selected, which would
    // silently drop every other change made on the page.
    if (Array.isArray(cfg.sel) && count === 0) { return 'Choose at least one image before saving.'; }
    if (count > 64) { return 'Choose at most 64 images across enabled galleries before saving.'; }
    if (encodeURIComponent(JSON.stringify(cfg)).length > MAX_CONFIG_URL_CHARS) {
      return 'Settings are too large to save. Remove some uploaded photos.';
    }
    return '';
  }
  function closeConfig(cfg) {
    try {
      var error = configError(cfg);
      if (error) { throw new Error(error); }
      document.location = getReturnTo() + encodeURIComponent(JSON.stringify(cfg));
      return true;
    } catch (err) {
      // Every themed page uses this shared boundary, so validation is visible
      // even on a page with no dedicated status element.
      var notice = document.getElementById('config-error');
      if (!notice) {
        notice = document.createElement('p'); notice.id = 'config-error';
        notice.setAttribute('role', 'alert');
        var save = document.getElementById('save');
        (save ? save.parentNode : document.body).appendChild(notice);
      }
      notice.textContent = err.message;
      return false;
    }
  }

  // The phone sets cfg.saveFailed when its last attempt to store the settings
  // failed (usually its storage quota): the previous settings survived, the new
  // ones may not outlive a restart of the Pebble app. Say so, up front, once.
  function noticeSaveFailed(cfg, hint) {
    if (!cfg || !cfg.saveFailed) { return false; }
    delete cfg.saveFailed;
    var notice = document.createElement('p');
    notice.id = 'save-failed';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'margin:0;padding:12px 16px;background:#b3261e;color:#fff;font:14px/1.4 system-ui,sans-serif';
    notice.textContent = 'Your last save could not be stored on the phone, so it may not survive a restart of the Pebble app. ' +
      'Check your settings and save again.' + (hint ? ' ' + hint : '');
    document.body.insertBefore(notice, document.body.firstChild);
    return true;
  }

  global.PebbleImage = {
    PLATFORM: PLATFORM, ROUND: ROUND,
    MAX_W: MAX_W, MAX_H: MAX_H, MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
    MAX_CONFIG_URL_CHARS: MAX_CONFIG_URL_CHARS,
    MAX_SELECTION: 64,
    MAX_CACHED_IMAGES: 48,
    processImage: processImage,
    sourceRect: sourceRect,
    getReturnTo: getReturnTo,
    configError: configError,
    closeConfig: closeConfig,
    noticeSaveFailed: noticeSaveFailed
  };
})(window);
