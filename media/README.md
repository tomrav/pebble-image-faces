# Image packs

`epaper/<pack>/` holds 200×228 PNGs already dithered to the Pebble Time 2
64-colour palette. `scripts/gen-franchise-faces.mjs` reads them to produce a
face's bundled resources, settings-page thumbnails and the streamed `.b64`
copies. `sources.csv` records where every image came from.

Pack naming, per franchise id in `src/shared/franchise-face/franchises.json`:

| directory | catalog group | ref prefix |
| --- | --- | --- |
| `<id>/` | Characters | `char/<slug>` |
| `<id>_media/` | Posters & box art | `media/<slug>` |
| `<id>_artwork/` | Artwork | `art/<slug>` |

Set `PEBBLE_MEDIA=/path/to/epaper` to generate from packs kept elsewhere.

## Round 2 cuts (and Time 2 recuts)

Since 2026-10-14 the same importer also recuts `epaper/<pack>/` for Time 2
from the originals, at each existing cut's framing, with the current
converter. Porco Rosso (character) and The Cat Returns keep their old Time 2
cuts: their originals are not known (see below).

`epaper-round/<pack>/` holds the same images for Pebble Round 2: 260×260,
black outside the circle, dithered to the same palette. The 200×228 cuts are
too small to make a sharp circle, so `npm run pebble:import-round-art`
(`scripts/import-round-art.py`) goes back to each original in `sources.csv`:
it downloads it once into `.originals/` (gitignored), finds where the 200×228
cut sits in it so the round cut keeps the same framing, and converts the
square around it. Set `PEBBLE_MEDIA_ROUND` to generate from cuts kept
elsewhere.

When this was first run (2026-10-13), five records turned out not to be the
source of their cut. Baron, Kamaji and Zeniba were corrected to the real
originals. Porco Rosso (character) has no recoverable original; its round cut
comes from a different, smaller still of the same scene (upscaled from 172px).
The Cat Returns keeps its recorded poster, so its round cut shows the poster
rather than the 200×228 cut's grass scene. The four film posters without a
record were added from English Wikipedia.

## Studio Ghibli artwork (Ghibli Time)

Ghibli Time is a non-commercial fan project. It is not affiliated with,
endorsed by or sponsored by Studio Ghibli, Toho, GKIDS or any rights holder.
All characters, film stills, posters and artwork are © Studio Ghibli and the
respective rights holders, used here for a free hobby watchface.

Studio Ghibli publishes scene stills from its films on its own site with the
note 「常識の範囲でご自由にお使いください」 ("please use freely within the bounds
of common sense"): https://www.ghibli.jp/info/013344/ (announcement) and the
作品静止画 section of each film page under https://www.ghibli.jp/works/ . Ten of
the images here were taken directly from ghibli.jp; the rest were collected
from fan-wiki and Wikipedia mirrors of official material (see `sources.csv`).
Re-sourcing them from the official stills is welcome. Posters and key art are
not part of that programme.

If you hold rights to any of these images and want them removed, open an
issue or contact the maintainer and they will be taken down promptly.
