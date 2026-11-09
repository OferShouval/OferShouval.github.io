import sys, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# Cuts the performer's frames out of Ofer's sprite sheets, keys out their backgrounds, evens out each move's scale, and
# finds the headstock in each frame, writing one atlas and the frames' places in it. Each move's frames keep their
# sheet's own colour. Run with Python 3, Pillow, NumPy and SciPy, from this folder:
#   python build.py ../../public/sprites/luminin-performer.png ../../src/sketches/luminin_performer_frames.json check.png
#
# The sheets: down.jpg, the jolt down (a swing down), black on white
outpng, outjson, debug = sys.argv[1:4]

TARGET = 330  # Standing height on the stage, in canvas pixels
PAD = 4
TIP_HEIGHT = 110  # How tall a standing figure is when looking for the headstock (where the neck is a few pixels wide)


def white_sheet(path):
    """A sheet of one move on white: the figures are the tall shapes, the numbers short ones, in reading order."""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    lab, _ = ndimage.label(lum < 128)
    objects = ndimage.find_objects(lab)
    tall = [(sl, i) for i, sl in enumerate(objects, 1) if sl[0].stop - sl[0].start > 150]
    rows = sorted({round(sl[0].stop / 100) for sl, _ in tall})
    tall.sort(key=lambda f: (rows.index(round(f[0][0].stop / 100)), f[0][1].start))
    alpha = np.clip((240 - lum) / (240 - 15), 0, 1)
    frames = []
    for sl, i in tall:
        y0, y1, x0, x1 = sl[0].start - PAD, sl[0].stop + PAD, sl[1].start - PAD, sl[1].stop + PAD
        crop = lab[y0:y1, x0:x1]
        # The figure, and any little bits of it (tuning pegs) close by, but not the numbers or the other figures
        keep = crop == i
        near = ndimage.binary_dilation(keep, iterations=8)
        for j in np.unique(crop[near]):
            if j and j != i and (lab[objects[j - 1]] == j).sum() < 120:
                keep |= crop == j
        keep = ndimage.binary_dilation(keep, iterations=1)
        frames.append(alpha[y0:y1, x0:x1] * keep)
    return frames


# Each move: its frames, their colour, and which frame stands up straight (to scale it by)
MOVES = {
    'down': (white_sheet('down.jpg'), (0, 0, 0), 2),
}


def height_of(a):
    ys = np.nonzero((a > 0.5).any(1))[0]
    return ys.max() - ys.min() + 1


def resize(a, scale):
    W, H = max(1, round(a.shape[1] * scale)), max(1, round(a.shape[0] * scale))
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC if scale > 1 else Image.LANCZOS)).astype(float) / 255


def tip_of(a):
    """Where the headstock is: the end of the thin part (the guitar's neck) furthest from the body."""
    m = a > 0.5
    thick = ndimage.binary_opening(m, structure=np.ones((5, 5)))
    thick = ndimage.binary_dilation(thick, iterations=1)
    thin = m & ~thick
    tl, tn = ndimage.label(thin, structure=np.ones((3, 3)))
    sizes = ndimage.sum(thin, tl, range(1, tn + 1))
    ys, xs = np.nonzero(tl == int(np.argmax(sizes)) + 1)
    bys, bxs = np.nonzero(thick)
    d = (xs - bxs.mean()) ** 2 + (ys - bys.mean()) ** 2
    j = int(np.argmax(d))
    tip = np.array([xs[j], ys[j]], float)
    # The neck's direction: from further back along it toward the tip
    dist = np.hypot(xs - tip[0], ys - tip[1])
    back = (dist > 8) & (dist < 26)
    if back.sum() < 5:
        back = dist < 26
    c = np.array([xs[back].mean(), ys[back].mean()])
    axis = (tip - c) / np.linalg.norm(tip - c)
    # ...then on out along it to the end of the headstock
    for _ in range(12):
        nxt = tip + axis * 0.5
        px, py = int(round(nxt[0])), int(round(nxt[1]))
        if not (0 <= py < m.shape[0] and 0 <= px < m.shape[1]) or not m[py, px]:
            break
        tip = nxt
    return tip, axis


out = {}
cells = []
for k, (frames, colour, standing) in MOVES.items():
    tall = height_of(frames[standing])
    scale = TARGET / tall
    out[k] = []
    for a in frames:
        big = resize(a, scale)
        if scale > 1.5:
            # Enlarged a lot: the edge pulled tight again so it stays a crisp silhouette
            big = np.clip((big - 0.5) * 2.2 + 0.5, 0, 1)
        H, W = big.shape
        m = big > 0.5
        ys, xs = np.nonzero(m)
        bottom = ys.max()
        fx = np.nonzero(m[int(bottom - 0.06 * TARGET):bottom + 1])[1]
        anchor = [float((fx.min() + fx.max()) / 2), float(bottom)]
        small = TIP_HEIGHT / tall
        tip, axis = tip_of(resize(a, small) if small < 1 else a)
        tip = tip * (1 if small >= 1 else 1 / small) * scale
        cells.append((big, colour))
        out[k].append({'w': W, 'h': H, 'anchor': anchor, 'tip': [float(tip[0]), float(tip[1])], 'neck': [float(axis[0]), float(axis[1])]})

# Pack into one atlas, a row per move
gap = 2
width = max(sum(f['w'] + gap for f in fs) for fs in out.values())
height = sum(max(f['h'] for f in fs) + gap for fs in out.values())
rgba = np.zeros((height, width, 4), np.uint8)
y = 0
ci = 0
for k, fs in out.items():
    x = 0
    for f in fs:
        big, colour = cells[ci]
        ci += 1
        rgba[y:y + f['h'], x:x + f['w'], :3] = colour
        rgba[y:y + f['h'], x:x + f['w'], 3] = (big * 255).round().astype(np.uint8)
        f['x'], f['y'] = x, y
        x += f['w'] + gap
    y += max(f['h'] for f in fs) + gap
Image.fromarray(rgba).save(outpng, optimize=True)
json.dump({'standing': TARGET, 'moves': out}, open(outjson, 'w'), separators=(',', ':'))

# A check: every frame with its feet (green) and headstock (red, with the neck's direction in yellow)
dbg = Image.new('RGB', (width, height), (235, 120, 60))
dbg.paste(Image.fromarray(rgba[..., :3]), (0, 0), Image.fromarray(rgba[..., 3]))
dr = ImageDraw.Draw(dbg)
for fs in out.values():
    for f in fs:
        ax, ay = f['x'] + f['anchor'][0], f['y'] + f['anchor'][1]
        dr.ellipse([ax - 5, ay - 5, ax + 5, ay + 5], fill=(0, 220, 0))
        tx, ty = f['x'] + f['tip'][0], f['y'] + f['tip'][1]
        dr.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], outline=(255, 0, 0), width=3)
        dr.line([tx, ty, tx - f['neck'][0] * 60, ty - f['neck'][1] * 60], fill=(255, 255, 0), width=3)
dbg.save(debug)
print(width, height)
