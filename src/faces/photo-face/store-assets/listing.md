# Photo Face — appstore listing

Release prepared for 2026-09-28: 1.1.8; notes in `release-1.1.8.txt`.

Previously released: 1.1.1 (faster launch: paints from the boot record, index deferred), published 2026-09-04 right after 1.1.0 (whole-selection
on-watch cache, watch-first advance, persist speedups, multi-file upload on the
settings page; settings page deployed the same day).

Listed on the official Pebble Appstore since 2026-08-07 (first submitted 2026-08-06).
Store requirements: screenshots exactly 200x228, banner exactly 720x320, icons 80x80 + 144x144.

Assets in this directory: `app-icon-144.png`, `app-icon-80.png`,
`app-icon-48.png`, `banner-720x320.png`, `screenshots/1..5.png`, `showcase.gif` + `showcase.webp` (looping style/data-point tour, 400x456, real overlay over the full-colour originals;
regenerate with `scripts/face-gif/capture.sh` -> `compose.py` -> `stitch.py`).
Regenerate icons/banner with `python3 make-assets.py`.

## Title

Photo Face

## Description (live since 1.0.10; bulleted rewrite 2026-08-09; user-photos framing + cropper + on-watch selection 2026-09-18)

Photo Face turns your Pebble Time 2 into a photo frame with a clock, filled with your own photos.

Your photos:
- Add as many as you like from the settings page and arrange them into galleries you create
- Crop and zoom each one with a live preview of how it will look on the watch, and re-crop any photo later
- Your photos never leave your devices: converted on your phone, sent straight to the watch
- 23 example photos included to start from

Playback:
- Flick your wrist for the next photo, or let a timer change it
- Your selection is stored on the watch, so it keeps rotating without your phone

Data points, placed anywhere on a 3x3 grid:
- Date, battery, steps, heart rate
- Temperature and a weather icon (sun, or moon after dark), from Open-Meteo.com using your phone's location while they are on
- Phone status and the loading spinner

Looks:
- Ten clock styles, from bold and pixel to typewriter, neon and LCD
- Any of the watch's 64 colors for the text and the backdrop bar
- 12h or 24h, optional seconds
- Per-photo overrides: single photos can have their own clock position and colors

The settings page previews everything before you save.

## Release notes history (latest first; 1.0.2's note was reworded 2026-08-08)

- 1.1.8 — Failed phone saves are reported on the settings page instead of silently reverting. See `release-1.1.8.txt`.
- 1.1.7 — Settings page moved to image-faces-config.pages.dev (the repo is public); weather credit and location note. See `release-1.1.7.txt`.
- 1.1.6 — Top clock seated under the top-row data points by measured per-style ink insets (LCD/Neon overlapped). See `release-1.1.6.txt`.
- 1.1.5 — Upload bytes travel once (thumbnails on the phone, send-only-new saves with a per-visit budget); Android picker one photo per tap; crop/zoom step with live watch preview and a ✂ re-crop badge (page-only, published 2026-09-17 after the store release). See `release-1.1.5.txt`.
- 1.1.4 — Reliable shake handling, cooperative cached-image loading, fewer storage writes, cache recovery, bounded retries, and settings validation. See `release-1.1.4.txt`.

- 1.1.1 —
  - Faster launch: the last photo appears before anything else is loaded

- 1.1.0 —
  - Your whole selection now lives on the watch: shakes and rotation are instant, no phone needed
  - Works fully offline, rotating through every photo you selected, including uploads
  - Shuffle, gallery loop/advance rules and per-photo looks now run on the watch itself
  - Settings page: picking several photos at once adds all of them
  - Much faster launch and settings saves

- 1.0.12 —
  - Your photo now comes back instantly after leaving the face: the watch keeps a copy of the streamed photo, no phone needed

- 1.0.11 —
  - Library photos are no longer stretched: built-in pictures are cropped to the screen instead of squeezed
  - No more wrong photo on launch: the face waits for your streamed photo instead of flashing the default lion
  - New Size setting (small, medium, large) for the clock and data points
  - Rotation can now change once a day

- 1.0.10 — Ten clock styles: pixel, handwritten, typewriter, neon, poster, stencil, LCD / any of the watch's 64 colors for text and backdrop bar / per-photo looks (clock position, colors, backdrop) / redesigned settings page with one-tap controls / clock at the top now sits below the top-row data points.

- 1.0.9 — Fixes the loading spinner ignoring its grid placement: it now renders wherever you put it on the settings page.
- 1.0.8 — The seconds clock sits truly centered now.
- 1.0.7 — The clock stays centered and stops shifting as the seconds tick, and the photo loading spinner is now a data point you can place anywhere on the grid (or remove).
- 1.0.6 — Optional seconds on the clock (Hours and Seconds controls on the settings page), and a proper crescent moon for clear or partly cloudy nights.
- 1.0.5 — Fixes settings landing on the wrong data point (a date that could not be turned off, battery appearing on its own). If your overlay looked scrambled, open the settings page and save once after updating.
- 1.0.4 — The weather condition now renders inline with other data points in the same cell, shows a moon instead of a sun after sunset, and phone status is a drawn glyph. New Hours control for the clock: follow the watch setting, 12h, or 24h.
- 1.0.3 — Two new data points for the 3x3 grid: the weather condition and phone connection status.
- 1.0.2 — Fixes the photo library curation from 1.0.1, which kept the wrong five categories. The library is Animals, Space, Architecture, Transportation, Flora.
- 1.0.1 — Curated the photo library to five categories (the wrong five; fixed in 1.0.2).
- 1.0.0 — Initial release.

## Form fields

- Website URL: blank
- Source code URL: https://github.com/tomrav/pebble-image-faces

## Open items

(none — heart rate, temperature and the phone-status glyph were all confirmed
on the wrist 2026-08-09, and the crescent banner is uploaded)

## Release mechanics learned the hard way

- Version bumps need `pebble clean` before the build, or the .pbw keeps the
  old appinfo (verify with `unzip -p ... appinfo.json` before uploading).
- messageKeys are APPEND-ONLY (see the README and the 1.0.5 notes).
- Release notes are editable after the fact (Edit buttons in Release History);
  the Edit Listing description save sometimes silently fails — reload the form
  to confirm it stuck.
