# Stitch emulator screenshots into a looping showcase GIF.
#
#   python3 scripts/face-gif/stitch.py <frames-dir> <out.gif> [--scale 2] [--hold 1500] [--fade 6]
#
# Frames are <dir>/f0.png, f1.png, ... (emulator captures, or compose.py output — use --scale 1 for those).
# Output .gif or .webp (animated WebP is far smaller; use it on web pages). Each is
# held for --hold ms, then crossfades into the next over --fade steps; the
# last frame fades back into the first so the loop is seamless. Upscaled
# with nearest-neighbour so the watch pixels stay crisp.
import argparse, glob, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('frames'); ap.add_argument('out')
ap.add_argument('--scale', type=int, default=2)
ap.add_argument('--hold', type=int, default=1500)
ap.add_argument('--fade', type=int, default=4)
ap.add_argument('--fade-ms', type=int, default=40)
ap.add_argument('--size', help='WxH: resample every frame to this size before scaling (e.g. 200x228 for the appstore)')
a = ap.parse_args()

paths = sorted(glob.glob(os.path.join(a.frames, 'f*.png')),
               key=lambda p: int(os.path.basename(p)[1:-4]))
ims = [Image.open(p).convert('RGB') for p in paths]
if a.size:
    tw, th = map(int, a.size.split('x'))
    ims = [im.resize((tw, th), Image.LANCZOS) for im in ims]
w, h = ims[0].size
ims = [im.resize((w * a.scale, h * a.scale), Image.NEAREST) for im in ims]

frames, durations = [], []
for i, im in enumerate(ims):
    nxt = ims[(i + 1) % len(ims)]
    frames.append(im); durations.append(a.hold)
    for s in range(1, a.fade):
        frames.append(Image.blend(im, nxt, s / a.fade)); durations.append(a.fade_ms)

# One shared palette keeps colours stable across the crossfades.

q = [f.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE) for f in frames]
if a.out.lower().endswith('.webp'):
    # Animated WebP: true colour, a fraction of the GIF's size — preferred for web pages.
    frames[0].save(a.out, save_all=True, append_images=frames[1:], duration=durations, loop=0, quality=82, method=6)
else:
    q[0].save(a.out, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(a.out, os.path.getsize(a.out) // 1024, 'KB', len(frames), 'frames', f'{w*a.scale}x{h*a.scale}')
