# Photo Face and Ghibli Time

Two watchfaces for the Pebble Time 2 (Emery, 200×228 64-colour e-paper) that
put a full-screen image behind a configurable clock, advancing on a wrist
shake or a timer. Both are on the official Pebble Appstore.

- **Photo Face** — your own photos. Add them on the settings page, crop and
  zoom with a live preview, arrange them into galleries. Photos are converted
  on the phone and streamed to the watch; nothing leaves your devices. 23 CC0
  example photos are included.
- **Ghibli Time** — 67 Studio Ghibli characters, posters and paintings. A
  non-commercial fan project; see [media/README.md](media/README.md).

Shared by both: ten clock styles, any of the watch's 64 colours for ink and
backdrop bar, data points (date, battery, steps, heart rate, temperature and
weather, phone status) placed on a 3×3 grid, per-image overrides, and an
on-watch image cache so the whole selection keeps rotating with no phone.

## Layout

```
src/shared/image-face/      the C engine + PKJS transport (the source of truth)
src/shared/franchise-face/  templates and catalog that generate Ghibli Time
src/faces/photo-face/       standalone Pebble project
src/faces/ghibli-face/      GENERATED Pebble project (npm run pebble:gen-faces)
docs/                       hosted settings pages + streamed images
  shared/                   settings-page logic and the browser image quantizer
  photo-face/               Photo Face page, photo library (img/, library.json)
  faces/ghibli/             GENERATED Ghibli Time page, thumbnails, .b64 streams
media/epaper/               Ghibli image packs, 200×228 palettized
scripts/                    build runner, generators, publisher, store GIF tools
tests/image-face/           Node + native C regression suite for the engine
```

The engine headers are copied into each face by `npm run pebble:sync-runtime`
so every project still builds on its own with `pebble build`. Edit
`src/shared/image-face/`, never the copies.

## Prerequisites

- The Pebble SDK and `pebble` tool (https://developer.repebble.com), with the
  `emery` emulator.
- Node 18+ (no npm packages required).
- Python 3 with Pillow and numpy, for image conversion and store assets.
- A C compiler, for the native part of the test suite.

## Commands

```sh
npm run pebble:build -- photo-face        # syncs the runtime copies, builds, strips source maps
npm run pebble:emulator -- ghibli-face    # install in the Emery emulator
npm run pebble:test -- photo-face         # build + install + screenshot
npm run pebble:test-runtime               # engine regressions, no SDK needed
npm run pebble:gen-faces                  # regenerate ghibli-face + docs/faces/ghibli
npm run pebble:gen-photo-face             # regenerate Photo Face's photo library
npm run pebble:publish-config             # deploy docs/ to Cloudflare Pages
```

`pebble build` bundles a source map that embeds the build machine's home
path; the build script strips it from every `.pbw`. Build through the script
before uploading a release.

## How a face works

- Images are either bundled in the `.pbw` (`b:` refs, shown even without a
  phone), hosted and streamed by the phone in chunks (`r:` refs), or, for
  Photo Face, uploaded from the settings page (`u:` refs).
- The watch owns playback: it holds the selection, cursor and the images
  themselves in persistent storage (1 MiB on PebbleOS 4.9.171+), so a shake
  never waits for the phone. The phone is the config of record and the
  supplier of bytes.
- Settings live in PKJS `localStorage`, edited on the hosted page and pushed
  to the watch as `S_*` message keys.
- `messageKeys` are an append-only wire ABI shared between the phone JS and
  the watch binary. Never reorder them.

Details: [src/shared/image-face/README.md](src/shared/image-face/README.md),
[src/shared/franchise-face/README.md](src/shared/franchise-face/README.md),
[src/faces/photo-face/README.md](src/faces/photo-face/README.md).

## Hosting

Each face opens its settings page from a URL compiled into the `.pbw`
(`BASE` in `src/pkjs/index.js`), so the page and the streamed images must stay
reachable at that address for every installed version. `npm run
pebble:publish-config` does a Cloudflare Pages direct upload of `docs/` to the
project named by `PAGES_PROJECT`; direct upload replaces the whole site, so
give each deployment its own project.

## Licenses

Code is MIT ([LICENSE](LICENSE)). Fonts: [FONTS.md](FONTS.md). Example photos
are CC0 ([docs/photo-face/CREDITS.md](docs/photo-face/CREDITS.md)). Studio
Ghibli artwork: [media/README.md](media/README.md).
