# Generates Ghibli Time's store icons and marketing banner in the face's
# storybook-meadow identity (matching the settings page): watercolour sky,
# rolling hills, warm cream paper, forest-green ink.
#
#   python3 src/faces/ghibli-face/store-assets/make-assets.py
#
# Writes app-icon-144.png, app-icon-80.png, app-icon-48.png and
# banner-720x320.png next to this script. Screenshots are captured
# separately from the emulator (screenshots/1..5.png).
#
# NOT touched by gen-faces: store-assets/ directories survive regeneration.
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'screenshots')

CREAM = (253, 245, 226)
SKY_HI = (87, 174, 219)
SKY_LO = (198, 231, 243)
SUN = (249, 214, 137)
SUN_CORE = (255, 243, 210)
HILLS = [(211, 232, 201), (165, 204, 144), (118, 171, 96), (69, 123, 62)]
FOREST = (27, 54, 32)
WOOD = (154, 114, 72)
WOOD_D = (109, 77, 47)


def sky(d, w, y0, y1):
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0)
        c = tuple(int(SKY_HI[i] + (SKY_LO[i] - SKY_HI[i]) * t) for i in range(3))
        d.line([0, y, w, y], fill=c)


def soft_sun(im, cx, cy, r):
    # a watercolour sun: wide translucent halo fading out, warm core
    glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(24, 0, -1):
        rr = r * (0.9 + i * 0.09)
        a = int(120 * (1 - i / 24) ** 2)
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=SUN + (a,))
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=SUN_CORE + (235,))
    im.paste(Image.alpha_composite(im.convert('RGBA'), glow).convert('RGB'), (0, 0))


def soot_sprite(d, cx, cy, r):
    # a fuzzy susuwatari: spiky halo, round body, two bright eyes
    import math
    for k in range(14):
        a = k * math.tau / 14 + 0.2
        d.line([cx + r * 0.7 * math.cos(a), cy + r * 0.7 * math.sin(a),
                cx + r * 1.45 * math.cos(a), cy + r * 1.45 * math.sin(a)],
               fill=(36, 46, 28), width=max(2, r // 5))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(36, 46, 28))
    er = max(2, int(r * 0.34))
    for ex in (cx - int(r * 0.38), cx + int(r * 0.38)):
        d.ellipse([ex - er, cy - int(r * 0.2) - er, ex + er, cy - int(r * 0.2) + er], fill=CREAM)
        pr = max(1, er // 2)
        d.ellipse([ex - pr, cy - int(r * 0.2) - pr, ex + pr, cy - int(r * 0.2) + pr], fill=(20, 26, 16))


def hills(d, w, h, base_frac=0.52):
    # four layered ridges, each a run of overlapping discs
    for layer, color in enumerate(HILLS):
        base = int(h * (base_frac + layer * (1 - base_frac - 0.02) / len(HILLS)))
        r = int(h * 0.22) - layer * 2
        step = max(8, w // 7)
        off = (layer * step) // 2
        d.rectangle([0, base + r // 2, w, h], fill=color)
        for cx in range(-off, w + step, step):
            d.ellipse([cx - r, base - r // 2, cx + r, base + r + r // 2], fill=color)


def icon(size, out):
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    sky(d, size, 0, int(size * 0.62))
    # sun, upper right
    soft_sun(im, int(size * 0.72), int(size * 0.26), int(size * 0.13))
    d = ImageDraw.Draw(im)
    hills(d, size, size)
    # the lone ridge tree (three stacked canopies), like the hero scenery
    tx, ty = int(size * 0.24), int(size * 0.56)
    tw = max(2, size // 36)
    d.rectangle([tx - tw // 2, ty, tx + tw // 2, ty + int(size * 0.16)], fill=(47, 75, 44))
    for i, (rw, rh, c) in enumerate([(0.16, 0.10, (60, 110, 54)), (0.12, 0.08, (72, 127, 63)), (0.09, 0.06, (84, 145, 71))]):
        w2, h2 = int(size * rw), int(size * rh)
        d.ellipse([tx - w2, ty - h2 - i * int(size * 0.055), tx + w2, ty + h2 - i * int(size * 0.055)], fill=c)
    im.save(os.path.join(HERE, out))


def banner(out):
    W, H = 720, 320
    im = Image.new('RGB', (W, H), CREAM)
    d = ImageDraw.Draw(im)
    sky(d, W, 0, 190)
    soft_sun(im, 320, 44, 24)  # clear of both the title and the watch frames
    d = ImageDraw.Draw(im)
    hills(d, W, H, base_frac=0.50)
    # three soot sprites hopping along the near meadow, between the tagline
    # and the watch frames
    soot_sprite(d, 330, 276, 13)
    soot_sprite(d, 356, 293, 9)
    soot_sprite(d, 310, 300, 7)

    # Right: two watch frames in wooden casings, showing real screenshots.
    frames = ['1-classic.png', '2-script.png']
    fw, fh = 132, 150  # 200x228 aspect
    fx = W - len(frames) * (fw + 26) - 30
    fy = (H - fh) // 2 + 14
    for i, name in enumerate(frames):
        x = fx + i * (fw + 26)
        d.rounded_rectangle([x - 9, fy - 9, x + fw + 9, fy + fh + 9], radius=12, fill=WOOD,
                            outline=WOOD_D, width=2)
        shot = Image.open(os.path.join(SHOTS, name)).convert('RGB').resize((fw, fh), Image.LANCZOS)
        im.paste(shot, (x, fy))

    # Left: title lockup on the meadow.
    def font(size, bold=True):
        for cand in ['/System/Library/Fonts/HelveticaNeue.ttc', '/System/Library/Fonts/Helvetica.ttc']:
            try:
                return ImageFont.truetype(cand, size, index=1 if bold else 0)
            except OSError:
                continue
        return ImageFont.load_default()

    tx = 40
    d.text((tx + 2, 92), 'GHIBLI', font=font(62), fill=CREAM)     # paper offset
    d.text((tx, 90), 'GHIBLI', font=font(62), fill=FOREST)
    d.text((tx + 2, 156), 'TIME', font=font(62), fill=CREAM)
    d.text((tx, 154), 'TIME', font=font(62), fill=(78, 127, 66))
    d.text((tx, 236), 'FRIENDS, FILMS AND PAINTINGS', font=font(17), fill=FOREST)
    d.text((tx, 258), 'DRIFTING PAST YOUR WRIST', font=font(17), fill=FOREST)
    im.save(os.path.join(HERE, out))


icon(144, 'app-icon-144.png')
icon(80, 'app-icon-80.png')
icon(48, 'app-icon-48.png')
banner('banner-720x320.png')
print('wrote app-icon-144.png, app-icon-80.png, app-icon-48.png, banner-720x320.png')
