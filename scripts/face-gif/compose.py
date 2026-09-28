# Re-render emulator captures over the full-colour originals.
#
#   python3 scripts/face-gif/compose.py <face> <frames-dir> <configs.json> <out-dir> [--scale 2]
#
# The watch shows a 64-colour dithered image; for web/app marketing we want
# the real photo with the real watch overlay. For each frame this learns the
# emulator's display palette (shot pixel <-> palettized bitmap pixel), masks
# the pixels that differ AND are one of the frame's overlay colours (ink,
# shadow, bar), and pastes those — at canonical colours, nearest-neighbour
# upscaled — over the original, cover-cropped like the watch does.
import argparse, json, os, sys
from collections import Counter, defaultdict
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('face', choices=['ghibli-face', 'photo-face'])
ap.add_argument('frames'); ap.add_argument('configs'); ap.add_argument('out')
ap.add_argument('--scale', type=int, default=2)
a = ap.parse_args()
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 200, 228

def key_of(cfg):
    return cfg['sel'][0] if 'sel' in cfg else cfg['galleries'][0]['items'][0]

def sources(key):
    kind, name = key.split(':', 1)
    if a.face == 'ghibli-face':
        slug = name.split('/', 1)[1]
        orig = [p for p in (f'{ROOT}/media/originals/ghibli/{slug}.{e}' for e in ('jpg', 'png', 'jpeg', 'webp')) if os.path.exists(p)]
        ref = f'{ROOT}/src/faces/ghibli-face/resources/images/builtin-{name.replace("/", "-")}.png'
        if not os.path.exists(ref): ref = f'{ROOT}/media/epaper/ghibli/{slug}.png'
        if not orig: orig = [ref]  # full-colour originals are not in this repo; fall back to the palettized image
    else:
        orig = [p for p in (f'{ROOT}/docs/photo-face/img/{name}.{e}' for e in ('jpg', 'png', 'jpeg')) if os.path.exists(p)]
        ref = f'{ROOT}/docs/photo-face/processed/{name}.png'
    if not orig: sys.exit(f'no original for {key}')
    return orig[0], ref

def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def overlay_colors(cfg):
    white = (cfg.get('color', 0) == 0)
    ink = hexrgb(cfg['inkHex']) if cfg.get('inkHex') else ((255, 255, 255) if white else (0, 0, 0))
    op = (0, 0, 0) if white else (255, 255, 255)
    bar = hexrgb(cfg['barHex']) if cfg.get('barHex') else op
    return {ink, op, bar}

def cover(im, size):
    w, h = im.size; tw, th = size
    if w * th > h * tw: cw, ch = (h * tw) // th, h
    else: cw, ch = w, (w * th) // tw
    x, y = (w - cw) // 2, (h - ch) // 2
    return im.crop((x, y, x + cw, y + ch)).resize(size, Image.LANCZOS)

cfgs = json.load(open(a.configs))
frames = [(i, Image.open(f'{a.frames}/f{i}.png').convert('RGB'), c) for i, c in enumerate(cfgs)]

# Learn shot<->palette mapping across every frame (majority vote per palette colour).
votes = defaultdict(Counter)
for i, shot, cfg in frames:
    ref = Image.open(sources(key_of(cfg))[1]).convert('RGB')
    for ps, pr in zip(shot.getdata(), ref.getdata()): votes[pr][ps] += 1
to_shot = {k: v.most_common(1)[0][0] for k, v in votes.items()}
to_canon = {v: k for k, v in to_shot.items()}
# Palette colours the images never used still need a display mapping for
# overlay inks: nearest learned entry by canonical distance is good enough.
def shot_of(canon):
    if canon in to_shot: return to_shot[canon]
    k = min(to_shot, key=lambda c: sum((c[j] - canon[j]) ** 2 for j in range(3)))
    return to_shot[k]

os.makedirs(a.out, exist_ok=True)
for i, shot, cfg in frames:
    orig_p, ref_p = sources(key_of(cfg))
    ref = Image.open(ref_p).convert('RGB')
    allowed = {shot_of(c): c for c in overlay_colors(cfg)}
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); px = ov.load()
    sd, rd = shot.getdata(), ref.getdata(); n = 0
    for idx, (ps, pr) in enumerate(zip(sd, rd)):
        if ps != to_shot.get(pr, pr) and ps in allowed:
            px[idx % W, idx // W] = allowed[ps] + (255,); n += 1
    base = cover(Image.open(orig_p).convert('RGB'), (W * a.scale, H * a.scale))
    ov = ov.resize((W * a.scale, H * a.scale), Image.NEAREST)
    base.paste(ov, (0, 0), ov)
    base.save(f'{a.out}/f{i}.png')
    print(f'f{i}: {key_of(cfg)} overlay {n}px from {os.path.relpath(orig_p, ROOT)}')
