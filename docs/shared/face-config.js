// Shared settings-page LOGIC for the photo/franchise watchfaces: the live
// watch preview and the control-binding helpers. Behavior only — every page
// keeps its own design and styles the #watch / #ovl elements itself, so the
// themed franchise pages stay visually distinct while rendering settings
// identically.
//
// Expected DOM: #watch > img#pimg + #ovl > .clk + .inf. Optional: #unitrow
// (temperature unit row, shown only while showTemp is on).
//
// Usage:
//   var ui = FaceConfig.attach(cfg, opts?);
//   ui.bindSelect('clockpos', 'clockPos');   // <select> -> cfg[prop] (+ preview)
//   ui.bindSwitch('showdate', 'showDate');   // checkbox -> cfg[prop] (+ preview)
//   ui.updatePreview();                       // re-render overlay from cfg
//   ui.setPreviewImage(catalogEntry|url);     // set the photo behind the overlay
//
// opts.screen overrides the preview geometry for pages that scale the watch
// frame (mtg renders it at 216x246): { h, clockH, infoH, pad }.
(function () {
  'use strict';

  var DEFAULT_SCREEN = { h: 228, clockH: 44, infoH: 16, pad: 4 };

  function attach(cfg, opts) {
    opts = opts || {};
    var screen = opts.screen || DEFAULT_SCREEN;
    var $ = function (id) { return document.getElementById(id); };

    function setPreviewImage(entry) {
      if (!entry) { return; }
      $('pimg').src = typeof entry === 'string' ? entry : entry.img;
    }

    function updatePreview() {
      var ovl = $('ovl');
      ovl.className = 'f' + (cfg.font || 0);
      var white = (cfg.color || 0) === 0;
      var fg = white ? '#fff' : '#000';
      var op = white ? '#000' : '#fff';
      ovl.style.color = fg;
      ovl.style.textShadow = (cfg.bg || 0) === 0 ? ('2px 2px 0 ' + op) : 'none';
      ovl.style.background = (cfg.bg || 0) === 1 ? op : 'transparent';

      // Sample values for every data point the face knows about; a page only
      // shows the toggles its face supports, so absent flags just stay falsy.
      var parts = [];
      if (cfg.showDate) { parts.push('WED 30'); }
      if (cfg.showBatt) { parts.push('87%'); }
      if (cfg.showSteps) { parts.push('5432'); }
      if (cfg.showTemp) { parts.push(cfg.tempUnit === 'c' ? '22°' : '72°'); }
      if (cfg.showHr) { parts.push('72 bpm'); }
      ovl.querySelector('.inf').textContent = parts.join(' · ');

      var block = screen.clockH + (parts.length ? screen.infoH : 0);
      var y = cfg.clockPos === 0 ? 2
            : cfg.clockPos === 1 ? (screen.h - block) / 2
            : screen.h - block - screen.pad;
      ovl.style.top = y + 'px';

      var unitrow = $('unitrow');
      if (unitrow) { unitrow.style.display = cfg.showTemp ? '' : 'none'; }
    }

    function bindSelect(id, prop) {
      var el = $(id);
      el.value = String(cfg[prop]);
      el.addEventListener('change', function () {
        // Numeric options parse; string options (e.g. tempUnit 'c'/'f') don't.
        var n = parseInt(el.value, 10);
        cfg[prop] = String(n) === el.value ? n : el.value;
        updatePreview();
      });
    }

    function bindSwitch(id, prop) {
      var el = $(id);
      el.checked = !!cfg[prop];
      el.addEventListener('change', function () { cfg[prop] = el.checked; updatePreview(); });
    }

    return {
      bindSelect: bindSelect,
      bindSwitch: bindSwitch,
      updatePreview: updatePreview,
      setPreviewImage: setPreviewImage,
    };
  }

  // --- Grid placement (tap chip, tap cell) ---------------------------------
  // For faces whose data points are freely placeable on a 3x3 grid instead of
  // toggles. cfg.grid is an ordered array [{k, pos}] — pos 1..9 row-major,
  // array order = placement order (items sharing a cell stack in that order),
  // absent = off. The registry below is the single list of known data points;
  // a future data point is one row here (plus its C/PKJS rows).
  var DATA_POINTS = [
    { k: 'date',  label: 'Date',        sample: function ()    { return 'WED 30'; } },
    { k: 'batt',  label: 'Battery',     sample: function ()    { return '87%'; } },
    { k: 'steps', label: 'Steps',       sample: function ()    { return '5432'; } },
    { k: 'temp',  label: 'Temperature', sample: function (cfg) { return cfg.tempUnit === 'c' ? '22°' : '72°'; } },
    { k: 'hr',    label: 'Heart rate',  sample: function ()    { return '72 bpm'; } },
    { k: 'cond',  label: 'Weather',     sample: function ()    { return '\u26c5'; } },
    { k: 'conn',  label: 'Phone status', sample: function ()   { return '\ud83d\udcf5'; } },
    { k: 'spin',  label: 'Loading spinner', sample: function () { return '\u21bb'; } },
  ];

  // Cell names for the list rows, cells 1..9 row-major.
  var CELL_NAMES = ['Top left', 'Top center', 'Top right',
                    'Middle left', 'Center', 'Middle right',
                    'Bottom left', 'Bottom center', 'Bottom right'];

  // attachGrid(cfg, { list, onChange? }): builds the 9-cell overlay inside
  // #watch and fills `list` with one persistent row per data point — every
  // point always appears, placed or not. Tap a row's position button, then a
  // cell on the preview, to (re)place it; the x turns it off. The preview
  // itself is display-only: managing items by tapping tiny text on the watch
  // proved unclear.
  // Returns { bindSelect, bindSwitch, updatePreview, setPreviewImage } like
  // attach().
  function attachGrid(cfg, opts) {
    var $ = function (id) { return document.getElementById(id); };
    var watch = $('watch');
    var list = opts.list || opts.tray;  // opts.tray accepted for compatibility
    var onChange = opts.onChange || function () {};
    if (!cfg.grid) { cfg.grid = []; }

    var byKey = {};
    DATA_POINTS.forEach(function (d) { byKey[d.k] = d; });

    // 9 cell hit/render targets over the photo, under the clock overlay in
    // z-order so the clock stays visible.
    var cellEls = [];
    // Solid-bar underlay: full-width bands behind the clock and every
    // occupied cell, touching bands merged into one (mirrors the C's
    // s_bars_layer). Sits under #ovl and the cells in z-order.
    var bars = document.createElement('div');
    bars.className = 'bars';
    bars.style.position = 'absolute';
    bars.style.inset = '0';
    bars.style.pointerEvents = 'none';
    watch.insertBefore(bars, $('ovl'));
    var cells = document.createElement('div');
    cells.className = 'cells';
    for (var i = 0; i < 9; i++) {
      var c = document.createElement('div');
      c.className = 'cell c' + i;
      c.setAttribute('data-cell', String(i + 1));
      var stack = document.createElement('div');
      stack.className = 'stack';
      c.appendChild(stack);
      cells.appendChild(c);
      cellEls.push(c);
    }
    watch.appendChild(cells);

    var arming = null;    // data-point key waiting for a cell tap

    function entry(k) {
      for (var i = 0; i < cfg.grid.length; i++) { if (cfg.grid[i].k === k) { return cfg.grid[i]; } }
      return null;
    }

    function place(k, pos) {
      var e = entry(k);
      if (e) { e.pos = pos; }
      else { cfg.grid.push({ k: k, pos: pos }); }
    }

    function remove(k) {
      cfg.grid = cfg.grid.filter(function (e) { return e.k !== k; });
    }

    function render() {
      // The list: one persistent row per data point. The position button shows
      // where it lives ("Off" when unplaced) and arms a cell pick when tapped.
      list.innerHTML = '';
      DATA_POINTS.forEach(function (d) {
        var e = entry(d.k);
        var row = document.createElement('div');
        row.className = 'dprow' + (e ? ' on' : '') + (arming === d.k ? ' arming' : '');

        var label = document.createElement('span');
        label.className = 'lbl';
        label.textContent = d.label;
        row.appendChild(label);

        var pos = document.createElement('button');
        pos.type = 'button';
        pos.className = 'pos';
        pos.textContent = arming === d.k ? 'Tap a spot on the watch…'
                        : e ? CELL_NAMES[e.pos - 1] : 'Off';
        pos.addEventListener('click', function () {
          arming = (arming === d.k) ? null : d.k;
          render();
        });
        row.appendChild(pos);

        var off = document.createElement('button');
        off.type = 'button';
        off.className = 'off';
        off.textContent = '×';
        off.setAttribute('aria-label', 'Remove ' + d.label);
        off.disabled = !e;
        off.addEventListener('click', function () {
          if (arming === d.k) { arming = null; }
          remove(d.k);
          render();
        });
        row.appendChild(off);

        list.appendChild(row);
      });

      cellEls.forEach(function (c, i) {
        // Items sharing a cell flow horizontally from that spot, joined with
        // '·' like the classic info line (mirrors the C exactly). Display-only.
        var stack = c.firstChild;
        stack.innerHTML = '';
        cfg.grid.forEach(function (e) {
          if (e.pos !== i + 1) { return; }
          if (stack.children.length) {
            var sep = document.createElement('span');
            sep.className = 'sep';
            sep.textContent = ' · ';
            stack.appendChild(sep);
          }
          var line = document.createElement('span');
          line.className = 'item';
          line.textContent = byKey[e.k] ? byKey[e.k].sample(cfg) : e.k;
          stack.appendChild(line);
        });
        c.classList.toggle('armed', !!arming);
      });

      updatePreview();
      onChange();
    }

    cells.addEventListener('click', function (ev) {
      var cell = ev.target.closest ? ev.target.closest('.cell') : null;
      if (cell && arming) {
        place(arming, parseInt(cell.getAttribute('data-cell'), 10));
        arming = null;
        render();
      }
    });

    // --- Preview: clock (row-only) + per-cell stacks, mirroring the C ------
    var H = 228, CLOCK_H = 48;
    // Size steps (cfg.fontSize 0/1/2) mirror the C: clock block 38/48/60px,
    // fonts scaled ~0.8x / 1x / 1.25x. Zoom (not font-size) so every page's
    // own per-style px rules keep working untouched.
    var CLOCK_HS = [38, 48, 60], FS = [0.8, 1, 1.25];
    function sizeStep() { var v = cfg.fontSize; return (v === 0 || v === 1 || v === 2) ? v : 1; }

    // Measured, not assumed: the single-line height varies with the info
    // font (true-size fonts in face-ui.css); overflow shows the same ellipsis
    // the watch renders.
    function stackHeight(cellIdx) {
      var stack = cellEls[cellIdx].firstChild;
      return stack.textContent ? Math.round(stack.offsetHeight * FS[sizeStep()]) : 0;
    }

    function updatePreview() {
      var ovl = $('ovl');
      var size = sizeStep();
      CLOCK_H = CLOCK_HS[size];
      ovl.className = 'f' + (cfg.font || 0) + ' s' + size;
      // Sample clock mirrors the Hours/Seconds controls: 24h shows an
      // unmistakably-24h time, seconds append to it.
      var clk = ovl.querySelector('.clk');
      if (clk) {
        clk.textContent = (cfg.timeFmt === 2 ? '22:08' : '10:08') +
                          (cfg.seconds ? ':42' : '');
        clk.style.zoom = FS[size];
      }
      // Style pairs the data-point font with the clock font (mirrors the C):
      // bold/heavy -> bold info, light/serif -> light, digital -> condensed.
      var INFO_PAIR = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 0, 7: 7, 8: 8, 9: 2 };
      var pair = cfg.fontAll === 0 ? 0 : (INFO_PAIR[cfg.font || 0] || 0);
      cells.className = 'cells if' + pair + ' s' + size;
      var white = (cfg.color || 0) === 0;
      var fg = white ? '#fff' : '#000';
      var op = white ? '#000' : '#fff';
      ovl.style.color = fg;
      ovl.style.textShadow = (cfg.bg || 0) === 0 ? ('2px 2px 0 ' + op) : 'none';
      // The solid bar lives in the .bars underlay (full-width, merged bands
      // — see below), never on the text elements themselves.
      ovl.style.background = 'transparent';
      var inf = ovl.querySelector('.inf');
      if (inf) { inf.style.display = 'none'; }  // grid stacks replace the info line

      // Clock block reserves room for the stack under it (mirrors apply_layout).
      var underCell = (cfg.clockPos || 0) * 3 + 2;
      var blockH = CLOCK_H + stackHeight(underCell - 1);
      var EDGE_PAD = 6;  // mirrors the C: rows breathe off the panel edge
      var clockY = cfg.clockPos === 0
                   ? (blockH > CLOCK_H ? EDGE_PAD + (blockH - CLOCK_H) : 2)  // C: + TOP_GAP, no tuck
                 : cfg.clockPos === 1 ? (H - blockH) / 2
                 : H - blockH - EDGE_PAD;
      ovl.style.top = clockY + 'px';

      var bands = [[clockY, clockY + CLOCK_H]];
      cellEls.forEach(function (c, i) {
        var row = Math.floor(i / 3), col = i % 3;
        var textH = stackHeight(i);
        var y;
        if (row === (cfg.clockPos || 0)) {
          y = (col === 1) ? (cfg.clockPos === 0 ? EDGE_PAD : clockY + CLOCK_H - 6)
                          : clockY + (CLOCK_H - textH) / 2 + 4;
        } else if (row === 0) { y = EDGE_PAD; }
        else if (row === 1) { y = (H - textH) / 2; }
        else { y = H - textH - EDGE_PAD; }
        c.style.top = y + 'px';
        var stack = c.firstChild;
        stack.style.zoom = FS[size];
        stack.style.textAlign = col === 0 ? 'left' : col === 2 ? 'right' : 'center';
        stack.style.color = fg;
        stack.style.textShadow = (cfg.bg || 0) === 0 ? ('1px 1px 0 ' + op) : 'none';
        stack.style.background = 'transparent';
        if (textH) { bands.push([y, y + textH + 2]); }
      });

      // Rebuild the bar underlay: sort the bands, merge any that overlap or
      // touch (≤2px) — the clock and the stack on its line become one bar
      // with no seam — then draw each merged band full-width.
      bars.innerHTML = '';
      if ((cfg.bg || 0) === 1) {
        bands.sort(function (a, b) { return a[0] - b[0]; });
        var merged = [];
        bands.forEach(function (r) {
          var last = merged[merged.length - 1];
          if (last && r[0] <= last[1] + 2) { last[1] = Math.max(last[1], r[1]); }
          else { merged.push(r.slice()); }
        });
        merged.forEach(function (r) {
          var d = document.createElement('div');
          d.style.position = 'absolute';
          d.style.left = '0';
          d.style.right = '0';
          d.style.top = r[0] + 'px';
          d.style.height = (r[1] - r[0]) + 'px';
          d.style.background = op;
          bars.appendChild(d);
        });
      }
    }

    function setPreviewImage(entry2) {
      if (!entry2) { return; }
      $('pimg').src = typeof entry2 === 'string' ? entry2 : entry2.img;
    }

    function bindSelect(id, prop) {
      var el = $(id);
      el.value = String(cfg[prop]);
      el.addEventListener('change', function () {
        var n = parseInt(el.value, 10);
        cfg[prop] = String(n) === el.value ? n : el.value;
        render();
      });
    }

    function bindSwitch(id, prop) {
      var el = $(id);
      el.checked = !!cfg[prop];
      el.addEventListener('change', function () { cfg[prop] = el.checked; render(); });
    }

    render();

    return {
      bindSelect: bindSelect,
      bindSwitch: bindSwitch,
      updatePreview: updatePreview,
      setPreviewImage: setPreviewImage,
      render: render,
      has: function (k) { return !!entry(k); },
    };
  }

  window.FaceConfig = { attach: attach, attachGrid: attachGrid, DATA_POINTS: DATA_POINTS };
})();
