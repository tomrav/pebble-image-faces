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

## Studio Ghibli artwork (Ghibli Time)

Ghibli Time is a non-commercial fan project. It is not affiliated with,
endorsed by or sponsored by Studio Ghibli, Toho, GKIDS or any rights holder.
All characters, film stills, posters and artwork are © Studio Ghibli and the
respective rights holders, used here for a free hobby watchface.

Studio Ghibli publishes scene stills from its films on its own site with the
note 「常識の範囲でご自由にお使いください」 ("please use freely within the bounds
of common sense"): https://www.ghibli.jp/info/013344/ (announcement) and the
作品静止画 section of each film page under https://www.ghibli.jp/works/ . The
character images here were collected from fan-wiki mirrors of official
material (see `sources.csv`); re-sourcing them from the official stills is
welcome. Posters and key art are not part of that programme.

If you hold rights to any of these images and want them removed, open an
issue or contact the maintainer and they will be taken down promptly.
