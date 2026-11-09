# Ofer's Fender Mustang silhouette (mustang-source.png) with the Luminin controller clipped to the end of its headstock,
# its 8 x 4 LED grid lit, as a transparent PNG at three times the source's size. Run with Python 3, Pillow, NumPy and
# SciPy, from this folder:
#   python mustang.py ../../public/sprites/mustang-luminin.png ../../src/sketches/luminin_mustang.json [--dark]
#   (the JSON says where things are in it, for the simulation; --dark: the LEDs unlit, all black)
# The simulation uses the dark one (public/sprites/mustang-luminin-dark.png) and lights the LEDs itself:
#   python mustang.py ../../public/sprites/mustang-luminin-dark.png ../../src/sketches/luminin_mustang.json --dark
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

out = sys.argv[1]
lit = '--dark' not in sys.argv
SCALE = 3
LED_COLOUR = (159, 230, 255)

src = np.asarray(Image.open('mustang-source.png').convert('RGBA')).astype(float)
lum = 0.299 * src[..., 0] + 0.587 * src[..., 1] + 0.114 * src[..., 2]
# The guitar is the one big dark shape; the faint guide lines and specks around it are left out
lab, _ = ndimage.label((lum < 200) & (src[..., 3] > 40), structure=np.ones((3, 3)))
sizes = ndimage.sum(np.ones_like(lum), lab, range(1, lab.max() + 1))
guitar = ndimage.binary_dilation(lab == int(np.argmax(sizes)) + 1, iterations=2)
alpha = np.clip((235 - lum) / (235 - 20), 0, 1) * (src[..., 3] / 255) * guitar

# The guitar's scale: about 95 cm long
ys, xs = np.nonzero(alpha > 0.5)
per_cm = (xs.max() - xs.min()) / 95

# The Luminin: a stack of boards (a Feather under a NeoPixel FeatherWing, 5.1 x 2.3 cm) along the headstock's tip,
# hanging a little past its rounded end, turned to follow the headstock (which tips down about 14 degrees toward its end)
CONTROLLER = {'centre': (1066, 470), 'size': (5.1, 2.3), 'angle': 14}

margin = 12
x0, y0, x1, y1 = xs.min() - margin, ys.min() - margin, xs.max() + margin, ys.max() + margin
crop = alpha[y0:y1, x0:x1]
W, H = crop.shape[1] * SCALE, crop.shape[0] * SCALE
big = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(float) / 255
big = np.clip((big - 0.5) * 2.2 + 0.5, 0, 1)  # The edge pulled tight again, so it stays a crisp silhouette

# Drawn four times over and scaled down, for smooth edges
SS = 4
body = Image.fromarray((big * 255).astype(np.uint8)).resize((W * SS, H * SS), Image.BICUBIC)
draw = ImageDraw.Draw(body)
cx, cy = ((CONTROLLER['centre'][0] - x0) * SCALE * SS, (CONTROLLER['centre'][1] - y0) * SCALE * SS)
a = np.radians(CONTROLLER['angle'])
along, across = np.array([np.cos(a), np.sin(a)]), np.array([-np.sin(a), np.cos(a)])
unit = per_cm * SCALE * SS
def at(u, v):
    p = np.array([cx, cy]) + along * u * unit + across * v * unit
    return (float(p[0]), float(p[1]))
# Where an LED is on the board (cm from its middle): 8 along it and 4 across, on a 5.7 mm pitch
led = lambda i, j: ((i - 3.5) * 0.57, (j - 1.5) * 0.48)
w, h = CONTROLLER['size']
draw.polygon([at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)], fill=255)
mask = body.resize((W, H), Image.LANCZOS)

rgba = Image.new('RGBA', (W, H), (0, 0, 0, 0))
rgba.paste(Image.new('RGBA', (W, H), (0, 0, 0, 255)), (0, 0), mask)
if lit:
    # 8 along the board and 4 across, on a 5.7 mm pitch, glowing
    leds = Image.new('L', (W * SS, H * SS), 0)
    d = ImageDraw.Draw(leds)
    r = 0.16 * unit
    for i in range(8):
        for j in range(4):
            x, y = at(*led(i, j))
            d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    leds = leds.resize((W, H), Image.LANCZOS)
    glow = leds.filter(ImageFilter.GaussianBlur(2.5 * SCALE / 3))
    light = np.clip(np.asarray(leds, float) + np.asarray(glow, float) * 1.6, 0, 255).astype(np.uint8)
    rgba.alpha_composite(Image.merge('RGBA', [Image.new('L', (W, H), c) for c in LED_COLOUR] + [Image.fromarray(light)]))
rgba.save(out, optimize=True)
print(out, rgba.size)

# For the simulation: where the controller is in the image, where the guitar's held (its middle, on the neck's line),
# where its bridge is, how many pixels make a cm, and where the LEDs are
if len(sys.argv) > 2 and sys.argv[2].endswith('.json'):
    import json
    PIVOT = (440, 448)
    # The bridge: a 24" (61 cm) scale back from the nut, which is where the headstock starts (x 925), on the neck's line
    BRIDGE = (925 - 61 * per_cm, 448)
    json.dump({
        'width': int(W), 'height': int(H),
        'controller': [float((CONTROLLER['centre'][0] - x0) * SCALE), float((CONTROLLER['centre'][1] - y0) * SCALE)],
        'pivot': [float((PIVOT[0] - x0) * SCALE), float((PIVOT[1] - y0) * SCALE)],
        'bridge': [float((BRIDGE[0] - x0) * SCALE), float((BRIDGE[1] - y0) * SCALE)],
        'perCm': round(float(per_cm * SCALE), 2),
        # The LEDs, in the firmware's order (indexCalc: y * 8 + x, x along the board, y across it), and their size
        'leds': [[round(c / SS, 1) for c in at(*led(x, y))] for y in range(4) for x in range(8)],
        'ledRadius': round(float(0.16 * per_cm * SCALE), 2),
    }, open(sys.argv[2], 'w'))
    print(sys.argv[2])
