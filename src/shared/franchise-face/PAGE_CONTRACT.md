# Settings-page contract (per-franchise overrides)

A file at `pages/<id>.html` fully replaces the generic `config.tmpl.html` for
that face. Design is free; **functionality must be identical**. The generator
does three things to your file, and everything else is yours:

1. Replaces `__FACE_ID__` and `__FACE_TITLE__` everywhere.
2. Injects `var CATALOG = [ { key, name, group, img }, ... ];` between these
   exact marker lines, which MUST appear verbatim inside a `<script>`:

   ```
   // >>>GEN:CATALOG>>>
   // <<<GEN:CATALOG<<<
   ```

   `key` is `'b:<group>/<slug>'` (bundled in the .pbw) or `'r:<group>/<slug>'`
   (streamed from the phone); `group` is one of `Characters`,
   `Posters & box art`, `Artwork`; `img` is a relative thumbnail path.
3. Writes the result to `docs/faces/<id>/config.html`.

## Functional requirements (all of them)

- **Config in**: read from `location.hash` (URI-encoded JSON), merge with
  defaults for any missing field. Fields and types (do not rename or drop):
  - `sel` (array of CATALOG keys, default = all `b:` keys), `shuffle` (bool),
    `rotateMin` (int: 1|5|15|30|60|180|1440|0), `shake` (bool), `cursor` (int,
    pass through untouched).
  - `clockPos` (0 top / 1 middle / 2 bottom), `timeFmt` (0 auto / 1 12h /
    2 24h), `seconds` (0|1).
  - `grid`: ordered array `[{ k, pos }]` of placed data points — `k` one of
    `date|batt|steps|temp|hr|cond|conn|spin`, `pos` 1..9 on a 3x3 grid
    (row-major, 1 = top-left); array order is placement order (items sharing
    a cell stack in that order); absent from the array = off. A config
    WITHOUT `grid` is toggle-era (old `showDate`/`showBatt`/`showSteps`/
    `showTemp`/`showHr` bools): migrate enabled toggles to the cell under the
    clock in that order, then delete the toggle fields. Pass `spinSeeded`
    through untouched.
  - `tempUnit` ('f'|'c').
  - `font` (0 Bold / 1 Light / 2 Digital / 3 Pixel / 4 Script / 5 Typewriter /
    6 Neon / 7 Poster / 8 Stencil / 9 LCD), `fontAll` (1 = the style also
    fonts the data points, 0 = they stay Gothic bold), `fontSize` (0 small /
    1 medium / 2 large — clock and data points together; pages without a
    Size control must still pass it through untouched).
  - `color` (legacy 0 white / 1 black — keep in sync with the ink: white-ish
    inks store 0, dark inks 1), `inkHex` (`'#rrggbb'` from the 64-color
    Pebble palette; ABSENT means pure white/black per `color`), `barHex`
    (`'#rrggbb'` solid-bar color; ABSENT = auto, the inverse of the ink),
    `bg` (0 drop shadow / 1 solid bar / 2 none).
  - `overrides`: `{ '<CATALOG key>': { pos?, ink?, bg?, bar? } }` per-image
    look overrides (same types as the globals; a key absent from the object
    = no override). Prune entries for keys no longer in the CATALOG.
- **Config out**: Save runs `delete cfg.bag; PebbleImage.closeConfig(cfg);`
  with `<script src="../../shared/pebble-image.js?v=..."></script>` loaded.
- **A control for every field** above with exactly those values, initialized
  from cfg and writing back on change. Use `FaceConfig.attachGrid` from
  `../../shared/face-config.js` for the grid placement UI + live preview
  (the page provides `#watch > img#pimg + #ovl > .clk + .inf`, a container
  for the data-point list, and styles everything itself); the 64-color
  palette + ink/bar wells and the per-image override sheet follow the
  reference implementations (see below).
- **Image picker**: every CATALOG entry rendered (thumbnail `img` attribute,
  lazy-loaded), grouped by `group`, tap toggles membership in `cfg.sel`,
  selected state visibly distinct, all/none per group, bundled entries
  distinguishable (they work without the phone; the rest stream), and a
  per-image override affordance on selected entries.
- Keep the no-cache meta tags (`Cache-Control`, `Pragma`, `Expires`) and
  `<meta name="viewport" content="width=device-width,initial-scale=1">`.
- Keep every asset reference **relative** (`img/...`, `../../shared/...`) or
  https. The page runs inside the rePebble phone app's webview.

Pages written before the grid era (toggle fields, 3 fonts, no overrides)
still work — the PKJS migrates their output — but they don't expose the new
controls and should be brought up to this contract when touched.

## Design constraints

- Target a ~390px-wide mobile webview first; must remain usable in both
  `prefers-color-scheme` light and dark (committing to one styled scheme is
  fine if it's deliberate and legible regardless of OS setting).
- External webfonts (Google Fonts etc.) and official franchise imagery are
  allowed. **No assets created by private individuals** (no fan art, no
  DeviantArt/wallpaper-site rips). The face's own thumbnails under `img/`
  are always safe decoration.
- The style chips should preview their real faces: load the Google-Fonts
  twins (VT323, Permanent Marker, Special Elite, Monoton, Abril Fatface,
  Black Ops One) plus the DSEG7 CDN css, like the reference pages do.
- No JS frameworks; plain HTML/CSS/JS like the reference page. Pico CSS is
  optional — drop it if your design doesn't want it.

## Reference

`config.tmpl.html` is the working generic implementation of this contract —
start from its `<script>` if in doubt. `docs/photo-face/config.html` is the
richer original (galleries + uploads instead of a fixed catalog) that the
overlay controls were ported from. `docs/faces/<id>/config.html` is the
current generated output with a real CATALOG you can borrow for local
previews.
