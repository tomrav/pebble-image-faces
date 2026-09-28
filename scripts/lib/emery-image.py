# Shared Emery (Pebble Time 2) image converter — THE single place watch images
# are quantized. Used by scripts/gen-franchise-faces.mjs and
# scripts/gen-photo-face.mjs; its browser twin is docs/shared/pebble-image.js
# (uploads must land on the same look as bundled images — keep them in sync).
#
# Reads a JSON job list on stdin:
#   [{ "src": "path/in.jpg",
#      "focus": [0.5, 0.35],        # optional: crop centre as x,y fractions
#                                   #   (default 0.5, 0.5); see cover_crop()
#      "png":   "out.png",          # optional: watch-ready PNG
#      "b64":   "out.b64",          # optional: base64 PNG for streaming (32KB cap)
#      "thumb": "out.png",          # optional: settings-page thumbnail
#      "dests": ["a.png", "b.png"]  # optional: extra PNG copies
#   }, ...]
#
# stdout contract (parsed by the generators — do not add chatter):
#   DROP <src>                      un-streamable even at 16 colors
#   DONE <n> images converted, <m> dropped as un-streamable
# Everything informational goes to stderr.
#
# Emery's palette is FIXED: 2 bits/channel, so every channel is 0/85/170/255.
# Quantizing to an adaptive palette makes the watch remap a second time with no
# dithering — that double quantization shifts colors and bands gradients.
#
# Sources already on the fixed palette (the pre-dithered epaper packs) pass
# through untouched. Everything else — photographs — gets a damped serpentine
# Floyd-Steinberg against the real palette:
#   - serpentine scan: breaks up directional "worm" artifacts
#   - damping (0.82): full error conservation is accurate but speckly at 2 bits
#   - deadzone (12/255): tiny errors are what turn a near-flat sky into confetti
# Pushed further (0.7 / 18) gradients band; these are the conservative end.
# Downscaling happens in LINEAR light — averaging gamma-encoded pixels darkens
# edges before the dither ever sees them.
#
# Sources are COVER-CROPPED to the screen's 200:228 aspect before scaling, never
# stretched: the first photo library shipped 2:3 portraits squeezed straight to
# 200x228 and users saw them ~30% wider than life ("the photos look stretched
# horizontally"). The browser twin (uploads) crops the same way in its default
# mode, so bundled, streamed and uploaded images all agree.
import sys, json, base64, io
import numpy as np
from PIL import Image, ImageOps

TARGET = (200, 228)
STREAM_CAP = 32768
DAMP = 0.82
DEADZONE = 12.0
LEVELS = (0, 85, 170, 255)


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


def cover_crop(im, focus):
    """Largest TARGET-aspect window of im, centred on focus=(fx, fy) fractions
    and clamped inside the image. Same result as CSS object-fit: cover with
    object-position fx fy — the settings-page thumbnails use exactly that, so
    what the page previews is what the watch gets."""
    w, h = im.size
    tw, th = TARGET
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


def on_palette(arr):
    return bool(np.isin(arr, LEVELS).all())


def dither(rgb):
    h, w, _ = rgb.shape
    buf = rgb.astype(np.float32).copy()
    out = np.empty((h, w, 3), dtype=np.uint8)
    for y in range(h):
        l2r = (y % 2 == 0)
        xs = range(w) if l2r else range(w - 1, -1, -1)
        d = 1 if l2r else -1
        for x in xs:
            old = buf[y, x]
            new = np.round(np.clip(old, 0, 255) / 85.0) * 85.0
            err = old - new
            err = np.where(np.abs(err) < DEADZONE, 0.0, err) * DAMP
            out[y, x] = new
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


jobs = json.load(sys.stdin)
dropped = 0
for j in jobs:
    im = ImageOps.exif_transpose(Image.open(j['src']).convert('RGB'))
    if im.size == TARGET:
        arr = np.asarray(im, dtype=np.uint8)
    else:
        focus = j.get('focus') or (0.5, 0.5)
        im = cover_crop(im, (float(focus[0]), float(focus[1])))
        arr = resize_linear(im, TARGET)
    if not on_palette(arr):
        arr = dither(arr)
    else:
        arr = arr.astype(np.uint8)

    data = encode(arr)
    for dest in [j.get('png')] + list(j.get('dests', [])) + [j.get('thumb')]:
        if dest:
            with open(dest, 'wb') as f:
                f.write(data)

    if 'b64' in j:
        b64_data = data
        # Streamed copies must fit the watch's transfer cap. Reduce the palette
        # (no re-dither — dither noise is what defeats PNG compression) before
        # giving up; bundled flash copies above are exempt and stay full-quality.
        for colors in (32, 16):
            if len(b64_data) <= STREAM_CAP:
                break
            b64_data = encode(arr, colors=colors)
            print('NOTE: %s requantized to %d colors for streaming (%d bytes)'
                  % (j['src'], colors, len(b64_data)), file=sys.stderr)
        if len(b64_data) > STREAM_CAP:
            print('DROP %s' % j['src'])
            dropped += 1
        else:
            with open(j['b64'], 'w') as f:
                f.write(base64.b64encode(b64_data).decode())

print('DONE %d images converted, %d dropped as un-streamable' % (len(jobs), dropped))
