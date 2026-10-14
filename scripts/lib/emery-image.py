# Shared Pebble image converter (Time 2 / emery, Round 2 / gabbro) — THE single place watch images
# are quantized. Used by scripts/gen-franchise-faces.mjs and
# scripts/gen-photo-face.mjs; its browser twin is docs/shared/pebble-image.js
# (uploads must land on the same look as bundled images — keep them in sync).
#
# Reads a JSON job list on stdin:
#   [{ "src": "path/in.jpg",
#      "focus": [0.5, 0.35],        # optional: crop centre as x,y fractions
#                                   #   (default 0.5, 0.5); see cover_crop()
#      "shape": "round",            # optional: "rect" (emery 200x228, default)
#                                   #   or "round" (gabbro 260x260, see SHAPES)
#      "png":   "out.png",          # optional: watch-ready PNG
#      "b64":   "out.b64",          # optional: base64 PNG for streaming (32KB cap)
#      "thumb": "out.png",          # optional: settings-page thumbnail
#      "dests": ["a.png", "b.png"]  # optional: extra watch-ready copies (PNG; strip pack for round)
#   }, ...]
#
# stdout contract (parsed by the generators — do not add chatter):
#   DROP <src>                      un-streamable even at 16 colors
#   DONE <n> images converted, <m> dropped as un-streamable
# Everything informational goes to stderr.
#
# Both platforms share the palette, and it is FIXED: 2 bits/channel, so every channel is 0/85/170/255.
# Quantizing to an adaptive palette makes the watch remap a second time with no
# dithering — that double quantization shifts colors and bands gradients.
#
# Sources already on the fixed palette (pre-dithered packs) pass through
# untouched. Everything else is dithered against what the panel SHOWS, not the
# nominal palette (2026-10-14, A/B tested on a Time 2):
#   - DISPLAY holds the colour the e-paper panel actually shows for each of the
#     64 palette entries, measured from the SDK emulators (which model the real
#     panel; emery and gabbro agree). Saturated colours come out far duller
#     than nominal, so dithering against nominal colours aimed every mix at the
#     wrong target: pinkish lions, grey skies, flat skin.
#   - the nearest colour is chosen in OKLab (perceptual); the error is measured
#     and diffused in LINEAR light, where mixing pixels averages physically.
#   - serpentine Floyd-Steinberg, damped (0.9) and with each error component
#     clamped (0.12), so colours the panel cannot reach don't smear.
#   - a light unsharp mask after the downscale: dither noise eats fine detail.
# Downscaling happens in LINEAR light — averaging gamma-encoded pixels darkens
# edges before the dither ever sees them.
#
# Sources are COVER-CROPPED to the screen's aspect (200:228, or square) before scaling, never
# stretched: the first photo library shipped 2:3 portraits squeezed straight to
# 200x228 and users saw them ~30% wider than life ("the photos look stretched
# horizontally"). The browser twin (uploads) crops the same way in its default
# mode, so bundled, streamed and uploaded images all agree.
#
# Round images are painted black outside the inscribed circle: gabbro never
# shows those pixels, and flat black there costs almost nothing in the PNG, which
# keeps 260x260 under the same 32KB stream cap as 200x228.
#
# Round images go to the watch (b64, dests) as a STRIP PACK: one PNG per band
# of STRIP_ROWS rows, back to back. Gabbro can't hold a whole 260x260 bitmap
# next to its PNG, so it decodes one strip at a time into a 6-bit canvas (see
# src/shared/image-face/face-image.h). Each strip keeps its exact colours; the
# settings-page previews (png, thumb) stay ordinary PNGs.
import sys, json, base64, io
import numpy as np
from PIL import Image, ImageFilter, ImageOps

SHAPES = {'rect': (200, 228), 'round': (260, 260)}
STRIP_ROWS = 26
STREAM_CAP = 32768
LEVELS = (0, 85, 170, 255)
DAMP = 0.9
CLAMP = 0.12
SHARPEN = dict(radius=1.0, percent=70, threshold=2)
# What the panel shows for each palette entry, in palette order (red-major,
# then green, then blue; levels 0/85/170/255). Twin: DISPLAY in pebble-image.js.
DISPLAY = [
    '000000', '001e41', '004387', '0068ca', '2b4a2c', '27514f', '16638d', '007dce',
    '5e9860', '5c9b72', '57a5a2', '4cb4db', '8ee391', '8ee69e', '8aebc0', '84f5f1',
    '4a161b', '482748', '40488a', '2f6bcc', '564e36', '545454', '4f6790', '4180d0',
    '759a64', '759d76', '71a6a4', '69b5dd', '9ee594', '9de7a0', '9becc2', '95f6f2',
    '99353f', '983e5a', '955694', '8f74d2', '9d5b4d', '9d6064', '9a7099', '9587d5',
    'afa072', 'aea382', 'ababab', 'a7bae2', 'c9e89d', 'c9eaa7', 'c7f0c8', 'c3f9f7',
    'e35462', 'e25874', 'e16aa3', 'de83dc', 'e66e6b', 'e6727c', 'e37fa7', 'e194df',
    'f1aa86', 'f1ad93', 'efb5b8', 'ecc3eb', 'ffeeab', 'fff1b5', 'fff6d3', 'ffffff',
]


def srgb_to_lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    s = np.where(a <= 0.0031308, a * 12.92, 1.055 * np.clip(a, 0, None) ** (1 / 2.4) - 0.055)
    return np.clip(s * 255.0, 0, 255)


def resize_linear(im, size):
    lin = srgb_to_lin(np.asarray(im, dtype=np.float32))
    chans = [np.asarray(Image.fromarray(lin[:, :, c], mode='F').resize(size, Image.LANCZOS),
                        dtype=np.float32) for c in range(3)]
    return lin_to_srgb(np.stack(chans, axis=2))


def cover_crop(im, focus, target):
    """Largest target-aspect window of im, centred on focus=(fx, fy) fractions
    and clamped inside the image. Same result as CSS object-fit: cover with
    object-position fx fy — the settings-page thumbnails use exactly that, so
    what the page previews is what the watch gets."""
    w, h = im.size
    tw, th = target
    if w * th > h * tw:      # wider than the screen: trim the sides
        cw, ch = (h * tw) // th, h
    else:                    # taller: trim top/bottom
        cw, ch = w, (w * th) // tw
    fx, fy = focus
    x = int(round(fx * w - cw / 2.0))
    y = int(round(fy * h - ch / 2.0))
    x = max(0, min(w - cw, x))
    y = max(0, min(h - ch, y))
    return im.crop((x, y, x + cw, y + ch))


def round_mask(size):
    """True for pixels outside the circle inscribed in a size[0] x size[1] screen."""
    w, h = size
    ys, xs = np.mgrid[0:h, 0:w]
    r = min(w, h) / 2.0
    return (xs + 0.5 - w / 2.0) ** 2 + (ys + 0.5 - h / 2.0) ** 2 > r * r


def on_palette(arr):
    return bool(np.isin(arr, LEVELS).all())


NOMINAL = np.array([(r, g, b) for r in LEVELS for g in LEVELS for b in LEVELS], np.float32)


def oklab(lin):
    """Linear sRGB (..., 3) -> OKLab."""
    m1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    m2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    return np.cbrt(np.clip(lin @ m1.T, 0, None)) @ m2.T


DISPLAY_LIN = srgb_to_lin(np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in DISPLAY], np.float32))
DISPLAY_OK = oklab(DISPLAY_LIN)
# Nearest display colour for every 7-bit-per-channel linear colour, filled on
# demand (a full table is 2M entries; an image touches a few thousand).
_NEAREST = np.full(128 ** 3, 255, np.uint8)


def nearest(lin):
    q = np.clip(np.round(lin * 127), 0, 127).astype(np.int32)
    key = (q[0] * 128 + q[1]) * 128 + q[2]
    k = _NEAREST[key]
    if k == 255:
        k = _NEAREST[key] = int(np.argmin(((DISPLAY_OK - oklab(q / 127.0)) ** 2).sum(1)))
    return k


def dither(rgb):
    """sRGB float image -> nominal palette image, dithered against DISPLAY."""
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(**SHARPEN))
    buf = srgb_to_lin(np.asarray(im, np.float32))
    h, w, _ = buf.shape
    out = np.empty((h, w, 3), dtype=np.uint8)
    for y in range(h):
        l2r = (y % 2 == 0)
        xs = range(w) if l2r else range(w - 1, -1, -1)
        d = 1 if l2r else -1
        for x in xs:
            k = nearest(buf[y, x])
            err = np.clip((buf[y, x] - DISPLAY_LIN[k]) * DAMP, -CLAMP, CLAMP)
            out[y, x] = NOMINAL[k]
            if 0 <= x + d < w:
                buf[y, x + d] += err * 0.4375
            if y + 1 < h:
                if 0 <= x - d < w:
                    buf[y + 1, x - d] += err * 0.1875
                buf[y + 1, x] += err * 0.3125
                if 0 <= x + d < w:
                    buf[y + 1, x + d] += err * 0.0625
    return out


def encode(arr, colors=64):
    # dither=NONE is load-bearing: arr already holds only exact palette colors,
    # and letting convert() dither again would undo the work above.
    p = Image.fromarray(arr).convert('P', dither=Image.Dither.NONE,
                                     palette=Image.Palette.ADAPTIVE, colors=colors)
    buf = io.BytesIO()
    p.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def reduce_colors(arr, colors):
    """arr limited to `colors` of its own colours, as a plain RGB array."""
    p = Image.fromarray(arr).convert('P', dither=Image.Dither.NONE,
                                     palette=Image.Palette.ADAPTIVE, colors=colors)
    return np.asarray(p.convert('RGB'), dtype=np.uint8)


def encode_pack(arr, colors=64):
    if colors < 64:
        arr = reduce_colors(arr, colors)
    return b''.join(encode(arr[y:y + STRIP_ROWS]) for y in range(0, arr.shape[0], STRIP_ROWS))


jobs = json.load(sys.stdin)
dropped = 0
for j in jobs:
    shape = j.get('shape', 'rect')
    target = SHAPES[shape]
    im = ImageOps.exif_transpose(Image.open(j['src']).convert('RGB'))
    if im.size == target:
        arr = np.asarray(im, dtype=np.uint8)
    else:
        focus = j.get('focus') or (0.5, 0.5)
        im = cover_crop(im, (float(focus[0]), float(focus[1])), target)
        arr = resize_linear(im, target)
    # Round: the outside of the circle is painted black AFTER the dither, so
    # the sharpening sees the image run on past the edge (masking first would
    # put a bright halo just inside the circle).
    outside = round_mask(target) if shape == 'round' else None
    if not on_palette(arr):
        arr = dither(arr)
    else:
        arr = arr.astype(np.uint8)
    if outside is not None:
        arr = arr.copy()
        arr[outside] = 0

    data = encode(arr)
    watch = encode_pack if shape == 'round' else encode
    watch_data = encode_pack(arr) if shape == 'round' else data
    for dest in [j.get('png'), j.get('thumb')]:
        if dest:
            with open(dest, 'wb') as f:
                f.write(data)
    for dest in j.get('dests', []):
        with open(dest, 'wb') as f:
            f.write(watch_data)

    if 'b64' in j:
        b64_data = watch_data
        # Streamed copies must fit the watch's transfer cap. Reduce the palette
        # (no re-dither — dither noise is what defeats PNG compression) before
        # giving up; bundled flash copies above are exempt and stay full-quality.
        for colors in (32, 16):
            if len(b64_data) <= STREAM_CAP:
                break
            b64_data = watch(arr, colors=colors)
            print('NOTE: %s requantized to %d colors for streaming (%d bytes)'
                  % (j['src'], colors, len(b64_data)), file=sys.stderr)
        if len(b64_data) > STREAM_CAP:
            print('DROP %s' % j['src'])
            dropped += 1
        else:
            with open(j['b64'], 'w') as f:
                f.write(base64.b64encode(b64_data).decode())

print('DONE %d images converted, %d dropped as un-streamable' % (len(jobs), dropped))
