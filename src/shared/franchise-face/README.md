# Franchise faces

The C engine in `src/shared/image-face/` is shared with Photo Face. This directory
owns franchise catalogs, PKJS configuration, and page templates. Together they publish as **multiple appstore entries — one
face per franchise**, each with its own UUID, bundled images, and hosted settings
page. Image packs live in
[`media/epaper/`](../../../media/README.md) (200×228, dithered to the Pebble
64-color palette); `PEBBLE_MEDIA` points the generator elsewhere.

Derived from the `touch-glass` watchapp (private), minus what a watchface can't have:
no touch (PebbleOS blocks the touch sensor for faces), no buttons (the OS owns
them), and no photo uploads.

## Layout

```
src/shared/franchise-face/       THE SOURCE OF TRUTH (this dir)
  main.c                         C wrapper (GEN:GALLERY region per face)
  pkjs.tmpl.js                   PKJS template (__FACE_ID__/__FACE_TITLE__, BUILTINS region)
  config.tmpl.html               settings-page template (CATALOG region)
  wscript                        standard Pebble wscript
  franchises.json                the face list: id, project, displayName, uuid, bundled refs
src/faces/<franchise>-face/      GENERATED projects — do not hand-edit
docs/faces/<id>/                 GENERATED hosted side — do not hand-edit
  config.html                    settings page (GitHub Pages via pebble:publish-config)
  img/<group>/<slug>.png         thumbnails
  processed/<group>/<slug>.b64   watch-ready PNGs the phone streams
```

Regenerate after editing the template, `franchises.json`, or an image pack:

```sh
npm run pebble:gen-faces
npm run pebble:build -- pokemon-face
```

## How a face works

- **Hybrid image delivery.** ~8 images per face are bundled in the `.pbw`
  (`b:<group>/<slug>` refs; IMG_BUILTIN index over AppMessage, no bytes on the
  wire, works with no phone). The rest of the 40-image catalog is hosted on
  Pages; PKJS fetches `processed/<group>/<slug>.b64` and streams it chunked
  (IMG_TOTAL + IMG_CHUNK, same protocol and limits as touch-glass, 32KB cap).
- **Rotation is watch-driven**: every `rotate` minutes and/or on a wrist shake
  (accel tap) the watch sends REQUEST_NEXT; PKJS advances its cursor (or
  shuffle bag) over the selected refs and answers. If the phone doesn't answer
  within 8s — or Bluetooth is down — the watch advances through the **bundled**
  images locally, so the face keeps rotating offline.
- **On-watch image cache** (1.2.1): the PNG of the streamed image on screen
  is written to persist storage as 256-byte records after display (header
  zeroed first, written last, FNV-1a hash), so a relaunch decodes the user's
  own image from flash before the phone re-sends it. Needs the 1 MiB quota
  (PebbleOS 4.9.171+, checked via firmware version + `persist_get_max_size()`);
  older firmware falls back to holding a blank backdrop until the stream lands.
- **Overlay**: clock (top/middle/bottom; bold/light/digital; white/black;
  drop-shadow/bar/none) plus an optional info line — date, battery, steps
  (Health API), temperature (Open-Meteo via PKJS geolocation, refreshed every
  30 min, only when enabled).
- **Settings** live in PKJS `localStorage` and are edited on the hosted page
  (`docs/faces/<id>/config.html`); on save they're pushed to the watch as S_*
  keys and persisted there too.

## Adding a franchise

1. Put the image pack in `media/epaper/<id>`, `<id>_media`, `<id>_artwork`
   (200×228 PNGs, ~40 images) and record provenance in `media/sources.csv`.
2. Add an entry to `franchises.json`: new `uuid` (`uuidgen`, lowercase), ~8
   `bundled` refs (`char/...`, `media/...`, `art/...`). Prefer flat, saturated
   art for bundled defaults — it survives the 64-color palette best.
3. `npm run pebble:gen-faces`, build, test, then `npm run pebble:publish-config`
   to push the settings page + hosted images to Pages.

UUIDs are permanent once published — never regenerate one.

## Emulator gotchas (2026-07)

- Only the **first watchface install per emulator session** reliably launches.
  Later installs report success but the old face keeps the screen, sometimes
  with a "<Face> is not responding" watchdog dialog — this happens with the
  trivial hello-time2-face too, so it's the tool/QEMU, not the face. Fix:
  `npm run pebble:reset`, then install. Verify face switching on hardware.
- The emulator can't inject touch, but can inject shake: `pebble emu-tap
  --emulator emery` exercises the shake-to-advance path end to end.
- Streaming (`r:` refs) needs the hosted `.b64` files, i.e. a published
  `glass-config`; until then only bundled images work in rotation.

## Shared runtime and reliability (1.3.2)

Edit `src/shared/image-face/face-*.h` for C behavior and `image-transfer.js` for
ordered phone transfers. `npm run pebble:gen-faces` copies them into each generated
project; `npm run pebble:sync-runtime` refreshes runtime copies without converting
images. Photo Face has its own resource wrapper and remains a standalone project.

The shared engine debounces shakes, retries busy requests, rejects obsolete
images/overlays, and journals allocated cache records. Legacy orphan records are
reclaimed in bounded background steps; failed cache commits are never acknowledged
as successful. Photo selection is limited to 64 entries (including Ghibli's larger
catalog), with up to 48 streamed images cached offline subject to available bytes.
Phone prefetch and HTTP requests have finite retries/timeouts. Settings callbacks
accept only Pebble's close URL or the SDK's exact loopback /close? endpoint.

Run `npm run pebble:test-runtime`; then build and visually test Ghibli on Emery.
