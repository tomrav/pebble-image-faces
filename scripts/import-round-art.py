# Cuts the franchise image packs for Pebble Round 2 (gabbro): 260x260, black
# outside the circle, dithered by the shared converter (scripts/lib/emery-image.py).
#
#   npm run pebble:import-round-art            every pack in media/sources.csv
#   npm run pebble:import-round-art -- ghibli  just the packs starting "ghibli"
#
# media/epaper/<pack>/ holds 200x228 cuts that are already dithered, too small
# to become a sharp 260px circle. So this goes back to each ORIGINAL listed in
# media/sources.csv:
#   1. download it once into media/.originals/<pack>/<slug>/ (gitignored; one
#      directory per file, since these are untrusted downloads)
#   2. find where the existing 200x228 cut sits in it, so the round cut keeps
#      the framing someone already chose by hand: first as a plain cover crop
#      (one free axis), then, if that fits badly, zoomed in (FFT search over
#      scale and position)
#   3. take the square around that centre (the largest one for a cover crop;
#      as tall as the old cut for a zoomed one) and convert it, writing
#      media/epaper-round/<pack>/<slug>.png for scripts/gen-franchise-faces.mjs
# Prints one line per image with the match error; a high one means no framing
# fitted and the square fell back to the centre — check those by eye.
import csv, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, 'media')
CACHE = os.path.join(MEDIA, '.originals')
OUT = os.path.join(MEDIA, 'epaper-round')
CONVERTER = os.path.join(ROOT, 'scripts', 'lib', 'emery-image.py')
RECT = (200, 228)
UA = 'pebble-image-faces-import/1.0'
POOR_MATCH = 900  # mean squared error (0-255 RGB, blurred) above which the centre is used
# Crop centre (x, y fractions) for originals no framing search can place: the
# old cut came from a different image.
FOCUS = {('ghibli', 'porco-rosso-character'): (0.36, 0.5)}


def download(url, folder):
    os.makedirs(folder, exist_ok=True)
    for name in os.listdir(folder):
        if name.startswith('original.'):
            return os.path.join(folder, name)
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or '.img'
    dest = os.path.join(folder, 'original' + ext)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    # Fandom and Wikimedia rate-limit bursts: pace every fetch, and back off on
    # 429 for as long as the host asks.
    for attempt in range(6):
        time.sleep(2)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            wait = int(e.headers.get('Retry-After') or 0) or 15 * (attempt + 1)
            print('429 from %s; waiting %ds' % (urllib.parse.urlparse(url).netloc, wait), file=sys.stderr)
            time.sleep(wait)
    with open(dest + '.part', 'wb') as f:
        f.write(data)
    os.replace(dest + '.part', dest)
    return dest


def blurred(im):
    return np.asarray(im.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)


def find_centre(orig, cut):
    """Centre (x, y) in original pixels of the 200x228 cover crop that best
    matches `cut`, plus its error. The cover crop spans the original's full
    width (portrait) or full height (landscape), so only one offset is free."""
    w, h = orig.size
    tw, th = RECT
    if w * th > h * tw:   # wider than 200:228: full height, x free
        s = th / h
    else:                 # taller: full width, y free
        s = tw / w
    sw, sh = max(tw, round(w * s)), max(th, round(h * s))
    small = blurred(orig.resize((sw, sh), Image.LANCZOS))
    ref = blurred(cut)
    best = None
    for off in range(0, max(sw - tw, sh - th) + 1):
        x, y = (off, 0) if sw - tw > sh - th else (0, off)
        err = float(((small[y:y + th, x:x + tw] - ref) ** 2).mean())
        if best is None or err < best[0]:
            best = (err, x, y)
    err, x, y = best
    return ((x + tw / 2) / s, (y + th / 2) / s), err


def window_sums(a, h, w):
    c = np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return c[h:, w:] - c[:-h, w:] - c[h:, :-w] + c[:-h, :-w]


def ssd_map(img, tpl):
    """Sum of squared differences of tpl at every position inside img."""
    H, W = img.shape
    h, w = tpl.shape
    corr = np.fft.irfft2(np.fft.rfft2(img) * np.fft.rfft2(tpl[::-1, ::-1], s=(H, W)), s=(H, W))
    return window_sums(img * img, h, w) - 2 * corr[h - 1:H, w - 1:W] + float((tpl * tpl).sum())


def find_zoomed(orig, cut):
    """Like find_centre(), for a cut that is a zoomed-in part of the original:
    search zoom 1x-6x and every position at quarter resolution, then score the
    winner at full resolution. Returns (centre, cut height in original px, error)."""
    w, h = orig.size
    tw, th = RECT
    cover = max(tw / w, th / h)
    grey = lambda im: np.asarray(im.convert('L'), dtype=np.float32)
    q = 4
    tpl = grey(cut.resize((tw // q, th // q), Image.BOX).filter(ImageFilter.GaussianBlur(1)))
    best = None
    z = 1.0
    while z <= 6.0:
        s = cover * z / q
        sw, sh = round(w * s), round(h * s)
        if sw >= tpl.shape[1] and sh >= tpl.shape[0]:
            img = grey(orig.resize((sw, sh), Image.BOX).filter(ImageFilter.GaussianBlur(1)))
            m = ssd_map(img, tpl)
            y, x = np.unravel_index(int(np.argmin(m)), m.shape)
            err = float(m[y, x]) / tpl.size
            if best is None or err < best[0]:
                best = (err, z, x * q / (cover * z), y * q / (cover * z))
        z *= 1.03
    _, z, x0, y0 = best
    s = cover * z
    bw, bh = min(tw / s, w), min(th / s, h)
    x0, y0 = max(0.0, min(w - bw, x0)), max(0.0, min(h - bh, y0))
    box = (x0, y0, x0 + bw, y0 + bh)
    err = float(((blurred(orig.resize((tw, th), Image.LANCZOS, box=box)) - blurred(cut)) ** 2).mean())
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), th / s, err


def square_around(orig, centre, side=None):
    w, h = orig.size
    side = int(round(min(side or min(w, h), w, h)))
    x = int(round(centre[0] - side / 2))
    y = int(round(centre[1] - side / 2))
    x = max(0, min(w - side, x))
    y = max(0, min(h - side, y))
    return orig.crop((x, y, x + side, y + side))


def main():
    only = sys.argv[1:]
    rows = list(csv.DictReader(open(os.path.join(MEDIA, 'sources.csv'), newline='', encoding='utf-8')))
    jobs, report = [], []
    for row in rows:
        pack, slug, url = row['franchise'], row['slug'], row['image_url']
        if only and not any(pack.startswith(p) for p in only):
            continue
        cut_path = os.path.join(MEDIA, 'epaper', pack, slug + '.png')
        if not os.path.exists(cut_path):
            print('SKIP %s/%s: no epaper cut' % (pack, slug))
            continue
        folder = os.path.join(CACHE, pack, slug)
        orig = ImageOps.exif_transpose(Image.open(download(url, folder))).convert('RGB')
        cut = Image.open(cut_path).convert('RGB')
        centre, err = find_centre(orig, cut)
        side, note = None, ''
        if err > POOR_MATCH:
            zc, zside, zerr = find_zoomed(orig, cut)
            if zerr < err:
                centre, side, err, note = zc, zside, zerr, ' (zoomed cut)'
        if (pack, slug) in FOCUS:
            fx, fy = FOCUS[(pack, slug)]
            centre, side, note = (orig.size[0] * fx, orig.size[1] * fy), None, ' (manual focus)'
        elif err > POOR_MATCH:
            centre, side, note = (orig.size[0] / 2, orig.size[1] / 2), None, ' (poor match: centred)'
        sq = square_around(orig, centre, side)
        src = os.path.join(folder, 'square.png')
        sq.save(src)
        os.makedirs(os.path.join(OUT, pack), exist_ok=True)
        jobs.append({'src': src, 'shape': 'round', 'png': os.path.join(OUT, pack, slug + '.png')})
        soft = ' (upscaled from %dpx)' % sq.size[0] if sq.size[0] < 260 else ''
        report.append('%-14s %-40s %4dx%-4d err %6.0f%s%s' % (pack, slug, orig.size[0], orig.size[1], err, note, soft))
    out = subprocess.run([sys.executable, '-I', CONVERTER], input=json.dumps(jobs),
                         capture_output=True, text=True, check=True)
    print('\n'.join(report))
    print(out.stdout.strip().splitlines()[-1] if out.stdout.strip() else '')


if __name__ == '__main__':
    main()
