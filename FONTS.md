# Bundled fonts

The clock styles ship these fonts inside each watchface (`resources/fonts/`,
copied by the generator from `src/shared/franchise-face/fonts/`). None are
modified. The full license texts and each font's copyright notice and Reserved
Font Names ship next to the TTFs as `OFL.txt` and `LICENSE-Apache-2.0.txt`, in
the shared directory and in every face's `resources/fonts/`.

| Font | Designer / source | License |
| --- | --- | --- |
| Abril Fatface | TypeTogether, via Google Fonts | SIL OFL 1.1 |
| Black Ops One | James Grieshaber (Sorkin Type), via Google Fonts | SIL OFL 1.1 |
| DSEG7 Classic | Keshikan (https://www.keshikan.net/fonts-e.html) | SIL OFL 1.1 |
| Monoton | Vernon Adams, via Google Fonts | SIL OFL 1.1 |
| Permanent Marker | Font Diner, via Google Fonts | Apache 2.0 |
| Special Elite | Astigmatic, via Google Fonts | Apache 2.0 |
| VT323 | Peter Hull, via Google Fonts | SIL OFL 1.1 |

The settings pages load the same families from Google Fonts and the `dseg`
npm package over CDN; nothing is served from this repository's own domain.
