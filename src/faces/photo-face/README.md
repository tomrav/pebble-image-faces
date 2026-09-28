# photo-face (Photo Face)

A generic photo watchface for Pebble Time 2 (Emery): one photo full-screen with a
clock overlay, advancing on a wrist shake or a rotation timer.

It is the generic sibling of the `touch-glass` watchapp (a private project this
face was derived from). The point of it is that
**people build their own groupings** — create galleries, name them, and fill them
with the library photos or their own uploads. The ten shipped galleries (one
per library category) are only starting points; rename, disable or delete them.

## Why a face can do less than the app

`touch-glass` advances on a touchscreen double tap, switches gallery with UP/DOWN,
and toggles shuffle with a SELECT double-click. **A watchface gets none of that** —
PebbleOS blocks the touch sensor for faces and owns the buttons. So:

| touch-glass (app) | photo-face (face) |
| --- | --- |
| double tap / SELECT → next photo | wrist shake → next photo |
| UP / DOWN → switch gallery | automatic, via each gallery's `end` behaviour |
| double-click SELECT → shuffle | set on the settings page |
| status toasts | none (nowhere to draw them) |

Everything else — galleries, uploads, the chunked transfer protocol, the built-in
flash bundling — carries over unchanged.

## Layout

- `src/c/main.c` — the standalone Photo Face gallery resource table. The C
  runtime is shared with franchise faces in `src/shared/image-face/`; edit
  those source headers, then `npm run pebble:sync-runtime`. The root build
  scripts also synchronize the generated local copies automatically.
- `src/pkjs/index.js` — owns galleries, uploads, cursor and shuffle. The watch is
  a thin client: it displays what it is sent and asks for the next photo.
- `docs/photo-face/config.html` — the hosted settings page (gallery manager plus
  the face's overlay settings). Served from Cloudflare Pages.

## Overlay data points — 3x3 grid placement

Date, battery, steps, temperature (+°F/°C), heart rate, the weather
condition, phone status and the photo loading spinner each place **anywhere
on a 3x3 grid** (cells 1–9, row-major). The clock stays row-only (top/middle/
bottom, full width), with Hours (auto/12h/24h) and optional Seconds controls —
with seconds on, the clock left-anchors at the origin the current minute's
centered time occupies (+3px optical shift), so HH:MM stays pixel-stable
while the seconds repaint in place. Items sharing a cell stack in placement order. On the
settings page the watch preview is the editor: tap a chip, tap a cell; tap a
placed item to move or remove it (tap-tap, not drag — the phone webview gets no
gesture benefit of the doubt).

Config shape: `grid: [{k, pos}]`, array order = placement order. Wire: one
`S_POS_*` key per data point, `0` = off, else `index*10 + cell`. The C mirrors
this: side columns align left/right, the clock-row center cell stacks under the
clock (which is exactly the old fixed layout, so toggle-era configs migrate to
it), and side cells in the clock's row center on the digits.

Cells are custom layers that paint a horizontal run of segments — text and
drawn glyphs mixed, joined with `·` — so a glyph can sit anywhere in the flow.
Three points are glyphs, not text: the weather condition (sun/moon/cloud/fog/
rain/snow/storm primitives + crescent-moon GPaths; Open-Meteo `weather_code`
with `is_day` on bit 3 of `COND_NOW`), phone status (phone-with-slash, shown
only while disconnected), and the loading spinner. The spinner is the odd one
out: it renders as an OVERLAY at its cell's alignment, never inside the run,
so popping in during a fetch can't move the clock or reflow a stack.

## On-watch image cache (1.0.12)

PebbleOS 4.9.171 raised the per-app persist quota to 1 MiB (records still 256
bytes). After a streamed photo is displayed its PNG is written to persist as a
run of records (`img_slot_*`: header zeroed first, records in 8-per-tick
batches, header with length + FNV-1a hash last). On relaunch the face decodes
it straight from flash, so the user's own photo is up before the phone script
has even started; the phone's re-send then refreshes it. The 1.0.11 blank hold
remains the fallback on old firmware, a hash mismatch, or a failed decode.
`persist_get_max_size()` is only called when the firmware version is >= 4.9.171
(it is a syscall older firmware lacks). Showing a built-in invalidates the cache.

## Size steps, cover crop, launch hold (1.0.11)

Field feedback drove all three:

- **Stretched library photos.** The shared converter used to squeeze any
  source straight to 200x228; the library's 2:3 portraits came out ~30% wide.
  `scripts/lib/emery-image.py` now cover-crops to the screen aspect first
  (optional per-image `focus: [x, y]` in `library.json`, preserved across
  re-imports). Uploads already cropped this way in the browser twin.
- **Wrong photo on launch.** Streamed photos have no flash copy, so a relaunch
  drew the last built-in (the lion) until the phone re-streamed. The watch now
  persists whether the on-screen image was streamed; if so and the phone is
  reachable it holds the black backdrop under the clock and lets the stream
  land (`restore_builtin()` shows the saved built-in after 8s if nothing
  comes). The PKJS also starts the image before re-sending settings on
  `ready`.
- **Size** (`S_FONT_SIZE`, 0 small / 1 medium / 2 large) scales the clock and
  the paired data points together. Bundled styles carry real cuts per step;
  Bold/Light/Digital use the nearest system fonts and top out at Medium.
  Large + seconds measures `88:88:88` once per style and drops to Medium if
  it would clip. Clock block height follows: 38/48/60.

## Looks: styles, colors, per-image overrides (1.0.10)

Ten clock **styles**: Bold, Light, Digital (system fonts) plus Pixel (VT323),
Script (Permanent Marker), Typewriter (Special Elite), Neon (Monoton), Poster
(Abril Fatface), Stencil (Black Ops One) and LCD (DSEG7 Classic) as custom
font resources — clock faces subset to digits+colon, data-point variants to
printable ASCII. Fonts load LAZILY (one clock + one info handle, swapped on
style change). Neon and LCD pair their data points with system fonts: Monoton
text is unreadable and 7-segment has no letters. The Style row's **Features**
switch (`S_FONT_ALL`) controls whether the style fonts the data points at all.

**Ink and bar colors** (`S_INK_COLOR`/`S_BAR_COLOR`, 0xRRGGBB ints, bar -1 =
auto): any of Emery's 64 palette colors, picked on the settings page from a
hue-sorted 8x8 grid. The op (shadow / auto-bar) color is black or white by
the ink's luminance. Legacy `S_COLOR` 0/1 stays on the wire for mixed-version
halves.

**Per-image overrides** (`OV_POS`/`OV_INK`/`OV_BG`/`OV_BAR`) ride each image
push — inside the `IMG_BUILTIN` message for bundled photos, inside `IMG_TOTAL`
for streamed/uploads — so the look changes atomically with the photo; -1
clears to globals. On the watch they're current-image state (persisted for
offline launch, cleared by the offline fallback advance), applied through
`eff_*` accessors. The page edits them via the pencil badge on any gallery
thumbnail (`cfg.overrides[ref] = {pos, ink, bg, bar}`).

With the clock at the TOP, the clock-row stack hugs the top edge and the
clock sits below it — the mirror of the bottom arrangement.

The settings page is chip-based (no native selects except rotate/temp-unit):
hidden `<select>`s stay as the binding contract and chips proxy them, so
`bindSelect` and the wire code never changed. `docs/photo-face/_mobiletest.html`
frames the page in an exact 360px iframe for phone-layout checks (the desktop
Chrome window can't shrink that far).

**Adding a data point** is one row per layer, no structural change: the
`DATA_POINTS` registry in `docs/shared/face-config.js` (label + sample), the
`DP_*` enum + `dp_text()` case in the C, the `DATA_POINTS`/`posKeys` rows in the
PKJS, and an `S_POS_*` message key — **appended at the END of `messageKeys`**.
The array order assigns the numeric IDs, and those are a wire ABI: the phone
app can transiently run one version's JS against another version's watch
binary (store/sideload duality), and an inserted key shifts every ID after it,
landing every setting one slot over (the 1.0.3/1.0.4 date-vs-battery bug).

Heart rate needs the `health` capability and is peeked once a minute alongside
the rest of the overlay rather than held as a subscription — a face is only
glanced at. Renders `-- bpm` with no recent reading. Temperature rides the
Open-Meteo fetch in the PKJS (30-min refresh, geolocated, `location`
capability), fetched only while temp is placed.

## Workflow

```bash
npm run pebble:import-photo-library -- <library.html>   # replace the photo library
npm run pebble:gen-photo-face            # convert + sync the consistency points
npm run pebble:build -- photo-face
npm run pebble:test -- photo-face        # build + emulator install + screenshot
npm run pebble:publish-config            # push docs/ to Cloudflare Pages
```

`gen-photo-face` is the source of truth for the built-in set. The **order is the
wire protocol** — the phone sends `IMG_BUILTIN` as an index into the watch's
`s_builtin_resources[]` — so one run maintains all four places that order
appears: the config page's `GALLERY`, the PKJS `BUILTINS`, the C table, and
`package.json`'s `resources.media`. Never hand-edit those regions.

## Photo library

47 CC0/public-domain images in 10 categories, imported from a saved library
page by `scripts/import-photo-library.mjs` (attribution-required entries are
skipped — the face cannot display attribution on a 200x228 panel). Provenance
for every image is in `docs/photo-face/CREDITS.md`; `docs/photo-face/library.json`
is the manifest `gen-photo-face` builds from.

The library is larger than the watch's flash budget, so it splits — the same
hybrid the franchise faces use: the **first image of each category is bundled**
in the .pbw (`b:` refs — offline fallback, instant), and the rest are **hosted
and streamed** (`r:` refs — the phone fetches `processed/<name>.b64` from Pages
and chunk-streams it). Streaming therefore requires a published `docs/`.

## Image conversion

Emery's palette is **fixed**: 2 bits per channel, so every channel is 0/85/170/255
— 64 colors. Quantize to an *adaptive* 64-color palette instead (PIL's default,
`quantize(colors=64)`) and the watch has to remap onto the hardware palette a
second time with no dithering. That double quantization is what shifts colors and
bands gradients. Dither once, against the real palette.

Textbook Floyd–Steinberg is still not enough for photographs. The franchise faces
get away with it because their sources are illustrations: large flat areas of
exact palette colors produce no error to diffuse. Photos carry error in every
pixel, and a dark sky sitting between levels 0 and 85 speckles about a quarter of
its pixels up to 85. Three changes fix it, all content-independent constants —
no per-image tuning, no branching on brightness:

| change | why |
| --- | --- |
| serpentine scan | breaks up the diagonal "worm" artifacts of a uniform L-to-R pass |
| error damping (0.82) | full error conservation is accurate but noisy at 2 bits/channel |
| deadzone (12/255) | tiny errors are what turn a near-flat sky into confetti |

Pushed further (damp 0.7 / deadzone 18) gradients start to band, so these are the
conservative end of what looked clean. The downscale also runs in **linear light**;
averaging gamma-encoded pixels darkens edges before the dither ever sees them.

The converter lives in `scripts/lib/emery-image.py` and is **shared with the
franchise faces** (their pre-dithered sources take a no-op fast path).
`docs/shared/pebble-image.js` carries the same three changes for uploads, so an
uploaded photo and a bundled one land on the same look. Keep the pair in sync —
and bump the `?v=` on every page that loads shared JS, or the browser serves a
stale copy. The settings-page preview and control binding are shared too
(`docs/shared/face-config.js` + `face-ui.css`).

## Status

Built and verified in the Emery emulator (165KB of 256KB resources), including
hosted streaming end to end (shake -> r: fetch from Pages -> chunked transfer ->
decode). Heart rate, temperature (geolocation prompt) and the phone-status
glyph's disconnect trigger still need hardware verification.

Listed on the official Pebble Appstore: see `store-assets/listing.md` for the
listing text and release notes history. Store assets regenerate with
`store-assets/make-assets.py`; the banner on the store still embeds the old
full-moon space photo (regenerate + re-upload pending).

## Reliability changes (1.1.2)

Shake callbacks within 900 ms are coalesced. A pending remote advance stays one
request; a busy outbox retries without consuming another photo. Displayed state
commits after the image lands, and obsolete image responses cannot change its
picture or overlays. Sequence/offset fields are appended to the message ABI;
older ordered transfers are accepted when they have no sequence field.

The editor allows at most 64 photos across enabled galleries. Up to 48 streamed
photos can be cached, subject to byte capacity. Cache allocation is journaled
before writing and reclaimed in background record deletions, including leftovers
from earlier versions. The first repair may take longer on a large existing
cache; display remains available and prefetch resumes when repair completes.

Run `npm run pebble:test-runtime` for native C storage/playback and phone/browser
regressions. `npm run pebble:test -- photo-face` builds and captures the emulator.
Settings-page changes require publishing `docs/` separately.
