# Ghibli Time — appstore listing

Release prepared for 2026-09-06: 1.3.4; notes in `release-1.3.4.txt`.

Previously released: 1.3.1 (faster launch: paints from the boot record, index deferred), published 2026-09-04 right after 1.3.0 (whole-selection
on-watch cache, watch-first advance, persist speedups). First submitted 2026-08-09; listed since 2026-09-06.
Store requirements: screenshots exactly 200x228, banner exactly 720x320, icons 80x80 + 144x144.
Icons are set through Edit Listing, not the submit wizard.

Assets in this directory: `app-icon-144.png`, `app-icon-80.png`,
`app-icon-48.png`, `banner-720x320.png`, `screenshots/1..5.png`, `showcase.gif` + `showcase.webp` (looping style/data-point tour, 400x456, real overlay over the full-colour originals;
regenerate with `scripts/face-gif/capture.sh` -> `compose.py` -> `stitch.py`).
Regenerate icons/banner with `python3 make-assets.py` (survives
`pebble:gen-faces` — the generator never touches store-assets/).

## Title

Ghibli Time

## Description (1.1.0)

Studio Ghibli's friends, films and paintings drift past your wrist.

The collection:
- 67 images: 44 characters, film posters, official key art
- Choose what rotates on the settings page; a new image on a timer, a wrist shake, or both
- Eight images live on the watch and show even without your phone; the rest drift over from your phone

Data points, placed anywhere on a 3x3 grid:
- Date, battery, steps, heart rate
- Temperature and a weather icon (sun, or moon after dark), from Open-Meteo.com using your phone's location while they are on
- Phone status and the loading spinner

Looks:
- Ten clock styles, from bold and pixel to typewriter, neon and LCD
- Any of the watch's 64 colors for the text and the backdrop bar
- 12h or 24h, optional seconds
- Per-image overrides: single images can have their own clock position and colors

The storybook settings page previews everything before you save.

## Release notes

- 1.3.4 — Reliable shake handling, cooperative cached-image loading, fewer storage writes, cache recovery, bounded retries, and settings validation. See `release-1.3.4.txt`.

- 1.3.1 —
  - Faster launch: the last image appears before anything else is loaded

- 1.3.0 —
  - Your whole selection now lives on the watch: shakes and rotation are instant, no phone needed
  - Works fully offline, rotating through everything you selected, not just the bundled set
  - Shuffle, per-image looks and rotation now run on the watch itself
  - Much faster launch and settings saves

- 1.2.1 —
  - Streamed images come back instantly after leaving the face: the watch keeps a copy, no phone needed

- 1.2.0 —
  - Porco Rosso joins the bundled characters (the thumbs-up cockpit still)
  - New Size setting (small, medium, large) for the clock and data points
  - Rotation can now change once a day
  - No more wrong image on launch while a streamed image reloads

- 1.1.0 — First store release. The full overlay system: data points on a
  3x3 grid, ten clock styles, 64-color ink and bar, weather with a real
  crescent moon, per-image looks, optional seconds, 12/24h. 44 characters
  including every film's leads, plus posters for Princess Kaguya, Pom Poko
  and The Cat Returns.

## Form fields

- Website URL: blank
- Source code URL: this repository, once public

## Known limitations

- Franchise imagery: characters/posters are Studio Ghibli's. This is a
  non-commercial fan project; see media/README.md for provenance and the
  takedown policy.
- The settings page needs the phone online (hosted on Cloudflare Pages);
  the watch itself keeps working offline on the 8 bundled images.
- Streamed images need the phone nearby; the offline fallback cycles the
  bundled set only (documented behavior, same as Photo Face).

## Rollback / quick-fix path

- The .pbw is generated: fix in src/shared/franchise-face/ (or
  franchises.json), `npm run pebble:gen-faces`, `pebble clean`, rebuild,
  verify appinfo version with `unzip -p`, upload as a new release.
- Settings-page fixes deploy independently via
  `npm run pebble:publish-config` (no store release needed).
- messageKeys are APPEND-ONLY (wire ABI shared with cached phone JS).

## Release mechanics (carried over from Photo Face)

- Version bumps need `pebble clean` before the build, or the .pbw keeps
  the old appinfo (verify with `unzip -p ... appinfo.json` before upload).
- Release notes are editable after the fact; the Edit Listing description
  save sometimes silently fails — reload the form to confirm it stuck.

## Open items

- Wrist check of 1.1.0 on hardware: installed 2026-08-09 via CloudPebble
  proxy; grid/styles verified in emulator, weather + overrides verified
  end-to-end on the page. HR needs a wrist reading to confirm (same code
  path as Photo Face, which was confirmed 2026-08-09).
