// Crop / zoom step for photo uploads on Pebble Time 2 settings pages.
//
// FaceCrop.open(source, opts) shows a modal with the photo behind a frame in
// the watch's 200:228 shape. Drag pans, pinch or the slider zooms (wheel on a
// desktop), and a live preview shows the real watch-side conversion of the
// current crop, so what the user sees is what the face will draw.
//
//   source  an <img> or <canvas> that is already decoded (pass a working copy
//           of ~1200px on its long side; a 48-megapixel phone photo is slow to
//           pan in a webview and the 200x228 output gains nothing from it)
//   opts    { fit: false,          start in fit (letterbox) mode
//             remaining: 0,        photos queued after this one
//             preview: fn(rect, fit) -> Promise<dataURL>   the live preview }
//   result  { action: 'add', rect: { x, y, w, h }, fit }   rect in source pixels
//           { action: 'asis' }     today's centered cover crop
//           { action: 'all' }      this and every queued photo, as is
//           { action: 'skip' }     leave this one out, continue
//           { action: 'cancel' }   stop the whole batch
//
// Self-contained: injects its own styles (Pico variables with fallbacks), no
// dependencies beyond the caller's preview function. Exposes window.FaceCrop.
(function (global) {
  'use strict';

  var RATIO = 228 / 200;      // frame height / width, the Emery screen
  var MAX_ZOOM = 4;           // relative to "just covers the frame"
  var PREVIEW_DELAY_MS = 120;

  var CSS = [
    '.fc-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px}',
    '.fc-panel{background:var(--pico-card-background-color,#1b1b1b);color:var(--pico-color,#eee);border-radius:var(--pico-border-radius,8px);padding:14px 14px 12px;width:100%;max-width:420px;max-height:100%;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.5)}',
    '.fc-head{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}',
    '.fc-head b{font-size:1rem}.fc-head small{color:var(--pico-muted-color,#999);margin-left:auto;font-size:.75rem}',
    '.fc-stage{display:flex;gap:12px;align-items:flex-start}',
    '.fc-frame{position:relative;flex:1 1 auto;overflow:hidden;background:#000;border-radius:4px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;outline:2px solid var(--pico-primary,#f0a030);outline-offset:-2px}',
    '.fc-frame.fc-fit{cursor:default}',
    '.fc-frame > *{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;max-width:none;max-height:none}',
    '.fc-side{flex:0 0 auto;width:100px;display:flex;flex-direction:column;gap:6px;align-items:center}',
    '.fc-side img{width:100px;height:114px;display:block;background:#000;border-radius:4px;image-rendering:pixelated}',
    '.fc-side small{font-size:.68rem;color:var(--pico-muted-color,#999);text-align:center;line-height:1.25}',
    '.fc-zoom{display:flex;align-items:center;gap:8px;margin:12px 0 4px}',
    '.fc-zoom input[type=range]{flex:1;margin:0}.fc-zoom span{font-size:.75rem;color:var(--pico-muted-color,#999);min-width:2.6em;text-align:right}',
    '.fc-fitrow{display:flex;align-items:center;gap:8px;margin:6px 0 10px;font-size:.85rem}',
    '.fc-fitrow input{margin:0}',
    '.fc-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.fc-actions button{margin:0;width:100%;padding:.55rem .6rem;font-size:.9rem}',
    '.fc-actions .fc-wide{grid-column:1 / -1}',
    '.fc-actions .fc-quiet{background:none;border:0;color:var(--pico-muted-color,#999);text-decoration:underline;font-size:.8rem;padding:.35rem}',
    '@media (max-width:380px){.fc-side{width:80px}.fc-side img{width:80px;height:91px}}'
  ].join('\n');

  var styled = false;
  function ensureStyle() {
    if (styled) { return; }
    var st = document.createElement('style'); st.textContent = CSS;
    document.head.appendChild(st); styled = true;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }
  function sizeOf(src) {
    return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  }

  function open(source, opts) {
    opts = opts || {};
    ensureStyle();
    var size = sizeOf(source), iw = size.w, ih = size.h;

    var overlay = el('div', 'fc-overlay');
    var panel = el('div', 'fc-panel');
    var head = el('div', 'fc-head');
    head.appendChild(el('b', null, 'Crop photo'));
    head.appendChild(el('small', null, opts.remaining ? opts.remaining + ' more after this' : 'Drag to move · pinch or slide to zoom'));
    panel.appendChild(head);

    var stage = el('div', 'fc-stage');
    var frame = el('div', 'fc-frame');
    frame.appendChild(source);
    var side = el('div', 'fc-side');
    var preview = el('img'); preview.alt = 'Watch preview';
    side.appendChild(preview);
    side.appendChild(el('small', null, 'On the watch'));
    stage.appendChild(frame); stage.appendChild(side);
    panel.appendChild(stage);

    var zoomRow = el('div', 'fc-zoom');
    var zoom = el('input'); zoom.type = 'range'; zoom.min = 0; zoom.max = 1000; zoom.value = 0;
    zoom.setAttribute('aria-label', 'Zoom');
    var zoomLabel = el('span', null, '1.0×');
    zoomRow.appendChild(el('span', null, 'Zoom')); zoomRow.appendChild(zoom); zoomRow.appendChild(zoomLabel);
    panel.appendChild(zoomRow);

    var fitRow = el('label', 'fc-fitrow');
    var fitBox = el('input'); fitBox.type = 'checkbox'; fitBox.setAttribute('role', 'switch');
    fitBox.checked = !!opts.fit;
    fitRow.appendChild(fitBox); fitRow.appendChild(document.createTextNode(' Fit the whole photo (bars at the sides)'));
    panel.appendChild(fitRow);

    var actions = el('div', 'fc-actions');
    var addBtn = el('button', 'fc-wide', 'Add this crop'); addBtn.type = 'button';
    var asIs = el('button', 'outline', 'Add as is'); asIs.type = 'button';
    var skip = el('button', 'outline secondary', opts.remaining ? 'Skip this one' : 'Don’t add'); skip.type = 'button';
    actions.appendChild(addBtn); actions.appendChild(asIs); actions.appendChild(skip);
    var allBtn = null;
    if (opts.remaining) {
      allBtn = el('button', 'fc-wide fc-quiet', 'Add this and the other ' + opts.remaining + ' as is'); allBtn.type = 'button';
      actions.appendChild(allBtn);
    }
    var cancel = el('button', 'fc-wide fc-quiet', opts.remaining ? 'Stop, add none of the rest' : 'Cancel'); cancel.type = 'button';
    actions.appendChild(cancel);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // --- Geometry -----------------------------------------------------
    // The source sits at natural size, translated by (tx, ty) and scaled by s,
    // all in frame CSS pixels. Cover mode keeps the frame full at all times.
    var FW = 0, FH = 0, s = 1, tx = 0, ty = 0, minS = 1, fit = fitBox.checked;
    source.style.width = iw + 'px'; source.style.height = ih + 'px';

    function measure() {
      FW = frame.clientWidth || Math.min(300, panel.clientWidth - 120);
      FH = Math.round(FW * RATIO);
      frame.style.height = FH + 'px';
      minS = Math.max(FW / iw, FH / ih);
    }
    function clamp() {
      s = Math.max(minS, Math.min(minS * MAX_ZOOM, s));
      tx = Math.min(0, Math.max(FW - iw * s, tx));
      ty = Math.min(0, Math.max(FH - ih * s, ty));
    }
    function apply() {
      if (fit) {
        var f = Math.min(FW / iw, FH / ih);
        source.style.transform = 'translate(' + ((FW - iw * f) / 2) + 'px,' + ((FH - ih * f) / 2) + 'px) scale(' + f + ')';
        zoom.disabled = true; zoomLabel.textContent = 'fit';
        frame.classList.add('fc-fit');
      } else {
        clamp();
        source.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
        zoom.disabled = false;
        zoom.value = Math.round((s / minS - 1) / (MAX_ZOOM - 1) * 1000);
        zoomLabel.textContent = (s / minS).toFixed(1) + '×';
        frame.classList.remove('fc-fit');
      }
      schedulePreview();
    }
    function rect() {
      if (fit) { return { x: 0, y: 0, w: iw, h: ih }; }
      return { x: -tx / s, y: -ty / s, w: FW / s, h: FH / s };
    }
    function center() { s = minS; tx = (FW - iw * s) / 2; ty = (FH - ih * s) / 2; }
    // Zoom so the frame point (px, py) stays over the same image point.
    function zoomAt(ns, px, py) {
      ns = Math.max(minS, Math.min(minS * MAX_ZOOM, ns));
      tx = px - (px - tx) * (ns / s); ty = py - (py - ty) * (ns / s); s = ns;
      apply();
    }

    // --- Live preview --------------------------------------------------
    var previewTimer = null, previewSeq = 0;
    function schedulePreview() {
      if (!opts.preview) { return; }
      clearTimeout(previewTimer);
      previewTimer = setTimeout(function () {
        var seq = ++previewSeq;
        Promise.resolve(opts.preview(rect(), fit)).then(function (url) {
          if (seq === previewSeq && url) { preview.src = url; }
        }, function () { /* preview is best effort */ });
      }, PREVIEW_DELAY_MS);
    }

    // --- Input -----------------------------------------------------------
    var pointers = {};
    function pts() { return Object.keys(pointers).map(function (k) { return pointers[k]; }); }
    frame.addEventListener('pointerdown', function (e) {
      if (fit) { return; }
      frame.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      frame.style.cursor = 'grabbing';
      e.preventDefault();
    });
    frame.addEventListener('pointermove', function (e) {
      if (fit || !pointers[e.pointerId]) { return; }
      var prev = pts();
      var was = { x: pointers[e.pointerId].x, y: pointers[e.pointerId].y };
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var now = pts();
      var box = frame.getBoundingClientRect();
      if (now.length === 1) {
        tx += e.clientX - was.x; ty += e.clientY - was.y;
        apply();
      } else if (now.length >= 2) {
        // Two fingers: scale by the change in their distance, about their midpoint.
        var a = prev[0], b = prev[1], c = now[0], d = now[1];
        var d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1, d1 = Math.hypot(c.x - d.x, c.y - d.y) || 1;
        var mx = (c.x + d.x) / 2 - box.left, my = (c.y + d.y) / 2 - box.top;
        var pmx = (a.x + b.x) / 2 - box.left, pmy = (a.y + b.y) / 2 - box.top;
        tx += mx - pmx; ty += my - pmy;
        zoomAt(s * (d1 / d0), mx, my);
      }
      e.preventDefault();
    });
    function release(e) {
      delete pointers[e.pointerId];
      if (!pts().length) { frame.style.cursor = 'grab'; }
    }
    frame.addEventListener('pointerup', release);
    frame.addEventListener('pointercancel', release);
    frame.addEventListener('wheel', function (e) {
      if (fit) { return; }
      var box = frame.getBoundingClientRect();
      zoomAt(s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - box.left, e.clientY - box.top);
      e.preventDefault();
    }, { passive: false });
    zoom.addEventListener('input', function () {
      var ns = minS * (1 + (MAX_ZOOM - 1) * (zoom.value / 1000));
      zoomAt(ns, FW / 2, FH / 2);
    });
    fitBox.addEventListener('change', function () { fit = fitBox.checked; if (!fit) { center(); } apply(); });

    // --- Resolution -------------------------------------------------------
    var settled = false;
    return new Promise(function (resolve) {
      function finish(result) {
        if (settled) { return; }
        settled = true;
        clearTimeout(previewTimer); previewSeq++;   // no preview work after close
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') { finish({ action: 'cancel' }); } }
      document.addEventListener('keydown', onKey);
      addBtn.addEventListener('click', function () { finish({ action: 'add', rect: rect(), fit: fit }); });
      asIs.addEventListener('click', function () { finish({ action: 'asis' }); });
      skip.addEventListener('click', function () { finish({ action: 'skip' }); });
      cancel.addEventListener('click', function () { finish({ action: 'cancel' }); });
      if (allBtn) { allBtn.addEventListener('click', function () { finish({ action: 'all' }); }); }
      overlay.addEventListener('click', function (e) { if (e.target === overlay) { finish({ action: 'cancel' }); } });

      // Lay out once attached (the frame's width comes from the panel).
      measure(); center(); apply();
      // Test hook: drive the geometry without synthesizing pointer events.
      overlay.__fc = { zoomAt: zoomAt, pan: function (dx, dy) { tx += dx; ty += dy; apply(); }, rect: rect, state: function () { return { s: s, tx: tx, ty: ty, minS: minS, FW: FW, FH: FH, fit: fit }; } };
    });
  }

  global.FaceCrop = { open: open, RATIO: RATIO, MAX_ZOOM: MAX_ZOOM };
})(window);
