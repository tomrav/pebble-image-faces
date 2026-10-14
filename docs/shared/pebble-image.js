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

  function snap(v) { v = v < 0 ? 0 : (v > 255 ? 255 : v); return Math.round(v / 85) * 85; } // -> Emery 4 levels

  // Quantize to Emery's 64 colors with Floyd–Steinberg error diffusion, so
  // near-neutral tones don't become false saturated colors.
  //
  // Two departures from textbook FS, both aimed at PHOTOGRAPHS, and both
  // mirroring scripts/gen-photo-face.mjs so an uploaded photo and a bundled one
  // land on the same look:
  //   - DAMP: textbook FS conserves all error, which is right for accuracy and
  //     wrong for appearance at 2 bits per channel. Slightly under-diffusing
  //     trades a little accuracy for markedly less speckle.
  //   - DEADZONE: error below ~12/255 is dropped instead of spread. Tiny errors
  //     are exactly what turns a near-flat sky into confetti.
  // Plus a serpentine scan, which breaks up the diagonal "worm" artifacts a
  // uniform left-to-right pass produces.
  //
  // Illustrations never showed this (their flat areas are already exact palette
  // colors, so there is no error to spread) which is why plain FS looked fine
  // until real photos went through it.
  var DAMP = 0.82, DEADZONE = 12;

  function quantize(ctx, w, h) {
    var src = ctx.getImageData(0, 0, w, h).data;
    var buf = new Float32Array(w * h * 3);
    for (var i = 0; i < w * h; i++) { buf[i * 3] = src[i * 4]; buf[i * 3 + 1] = src[i * 4 + 1]; buf[i * 3 + 2] = src[i * 4 + 2]; }
    function diffuse(idx, er, eg, eb, f) { buf[idx] += er * f; buf[idx + 1] += eg * f; buf[idx + 2] += eb * f; }
    function damp(e) { return Math.abs(e) < DEADZONE ? 0 : e * DAMP; }
    var map = {}, palette = [], indices = new Array(w * h);
    for (var y = 0; y < h; y++) {
      var l2r = (y % 2 === 0), d = l2r ? 1 : -1;
      for (var k = 0; k < w; k++) {
        var x = l2r ? k : (w - 1 - k);
        var o = (y * w + x) * 3;
        var nr = snap(buf[o]), ng = snap(buf[o + 1]), nb = snap(buf[o + 2]);
        var er = damp(buf[o] - nr), eg = damp(buf[o + 1] - ng), eb = damp(buf[o + 2] - nb);
        if (x + d >= 0 && x + d < w) { diffuse((y * w + (x + d)) * 3, er, eg, eb, 7 / 16); }
        if (y + 1 < h) {
          if (x - d >= 0 && x - d < w) { diffuse(((y + 1) * w + (x - d)) * 3, er, eg, eb, 3 / 16); }
          diffuse(((y + 1) * w + x) * 3, er, eg, eb, 5 / 16);
          if (x + d >= 0 && x + d < w) { diffuse(((y + 1) * w + (x + d)) * 3, er, eg, eb, 1 / 16); }
        }
        var key = nr + ',' + ng + ',' + nb, idx = map[key];
        if (idx === undefined) { idx = palette.length; map[key] = idx; palette.push([nr, ng, nb]); }
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

  // Black outside the circle inscribed in the w x h canvas: the same pixel-centre
  // test as round_mask() in emery-image.py and the watch's canvas rows.
  function maskRound(ctx, w, h) {
    var im = ctx.getImageData(0, 0, w, h), d = im.data, r2 = Math.min(w, h) * Math.min(w, h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = 2 * x + 1 - w, dy = 2 * y + 1 - h;
        if (dx * dx + dy * dy > r2) { var o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = 0; }
      }
    }
    ctx.putImageData(im, 0, 0);
  }

  // The dither pushes error across the circle's edge; set those pixels back to
  // black, as emery-image.py does.
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
    if (ROUND) { maskRound(ctx, w, h); }
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
