# Generates Photo Face's store icons and marketing banner from the photo
# library, in the face's retro film-strip identity (matching the settings
# page): charcoal frame, cream sprocket holes, the four-color stripe band.
#
#   python3 src/faces/photo-face/store-assets/make-assets.py
#
# Writes app-icon-144.png, app-icon-48.png and banner-720x320.png next to
# this script. Screenshots are captured separately from the emulator.
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
IMG = os.path.join(ROOT, 'docs', 'photo-face', 'img')

CHARCOAL = (23, 19, 15)
CREAM = (244, 236, 219)
AMBER = (232, 134, 45)
STRIPES = [(200, 16, 46), (232, 119, 34), (242, 169, 0), (106, 112, 41)]


def stripe_band(draw, x0, y0, x1, y1):
    h = (y1 - y0) / len(STRIPES)
    for i, c in enumerate(STRIPES):
        draw.rectangle([x0, y0 + i * h, x1, y0 + (i + 1) * h], fill=c)


def film_icon(size, photo, out):
    s = size / 144.0  # design at 144, scale down for 48
    im = Image.new('RGB', (size, size), CHARCOAL)
    d = ImageDraw.Draw(im)

    rail = max(3, int(14 * s))          # sprocket rail width
    stripe_h = max(3, int(12 * s))      # stripe band height
    pad = max(1, int(6 * s))

    # Photo window between the rails, above the stripe band.
    win = [rail + pad, pad, size - rail - pad, size - stripe_h - 2 * pad]
    ph = Image.open(photo).convert('RGB')
    ww, wh = win[2] - win[0], win[3] - win[1]
    # cover-crop
    scale = max(ww / ph.width, wh / ph.height)
    ph = ph.resize((int(ph.width * scale) + 1, int(ph.height * scale) + 1), Image.LANCZOS)
    ox, oy = (ph.width - ww) // 2, (ph.height - wh) // 2
    im.paste(ph.crop((ox, oy, ox + ww, oy + wh)), (win[0], win[1]))

    # Sprocket holes down both rails (skipped at small sizes — noise at 48px).
    hole_w = max(2, int(7 * s))
    if size < 96:
        stripe_band(d, 0, size - stripe_h, size, size)
        return im.save(os.path.join(HERE, out))
    hole_h = max(2, int(9 * s))
    step = int(20 * s)
    y = int(8 * s)
    while y + hole_h < size - stripe_h - pad:
        for cx in (rail // 2, size - rail // 2):
            d.rounded_rectangle([cx - hole_w // 2, y, cx + hole_w // 2, y + hole_h],
                                radius=max(1, int(2 * s)), fill=CREAM)
        y += step

    # Stripe band along the bottom.
    stripe_band(d, 0, size - stripe_h, size, size)
    return im.save(os.path.join(HERE, out))


def banner(out):
    W, H = 720, 320
    im = Image.new('RGB', (W, H), CHARCOAL)
    d = ImageDraw.Draw(im)

    # Right half: a photo strip of two frames, clear of the title lockup.
    frames = ['transport-1.jpg', 'space-1.jpg']
    fw, fh = 150, 171  # 200x228 aspect
    fx = W - len(frames) * (fw + 14) - 26
    fy = (H - fh) // 2
    for i, name in enumerate(frames):
        ph = Image.open(os.path.join(IMG, name)).convert('RGB')
        scale = max(fw / ph.width, fh / ph.height)
        ph = ph.resize((int(ph.width * scale) + 1, int(ph.height * scale) + 1), Image.LANCZOS)
        ox, oy = (ph.width - fw) // 2, (ph.height - fh) // 2
        x = fx + i * (fw + 14)
        im.paste(ph.crop((ox, oy, ox + fw, oy + fh)), (x, fy))
        # sprocket holes above and below each frame, like a strip of negatives
        for yy in (fy - 16, fy + fh + 7):
            for hx in range(x + 6, x + fw - 6, 22):
                d.rounded_rectangle([hx, yy, hx + 10, yy + 9], radius=2, fill=CREAM)

    # Left: title lockup.
    def font(size, bold=True):
        for cand in ['/System/Library/Fonts/HelveticaNeue.ttc', '/System/Library/Fonts/Helvetica.ttc']:
            try:
                return ImageFont.truetype(cand, size, index=1 if bold else 0)
            except OSError:
                continue
        return ImageFont.load_default()

    tx = 42
    d.text((tx, 96), 'PHOTO', font=font(64), fill=CREAM)
    d.text((tx, 160), 'FACE', font=font(64), fill=AMBER)
    stripe_band(d, tx, 238, tx + 190, 250)
    d.text((tx, 262), 'YOUR PHOTOS ON YOUR WRIST', font=font(17), fill=(168, 145, 111))

    im.save(os.path.join(HERE, out))


# Icon photo = the fox (animals-5), same as the hero screenshot.
film_icon(144, os.path.join(IMG, 'animals-5.jpg'), 'app-icon-144.png')
# The dashboard asks for 80x80 small + 144x144 large.
film_icon(80, os.path.join(IMG, 'animals-5.jpg'), 'app-icon-80.png')
film_icon(48, os.path.join(IMG, 'animals-5.jpg'), 'app-icon-48.png')
banner('banner-720x320.png')
print('wrote app-icon-144.png, app-icon-48.png, banner-720x320.png')
