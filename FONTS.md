# Bundled fonts

The clock styles ship these fonts inside each watchface (`resources/fonts/`,
copied by the generator from `src/shared/franchise-face/fonts/`). None are
modified. License texts: https://openfontlicense.org (SIL OFL 1.1) and
https://www.apache.org/licenses/LICENSE-2.0 (Apache 2.0).

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
