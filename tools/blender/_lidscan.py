import sys

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1 :]
path, width_m = args[0], float(args[1])
# the probe aims at the eye, so the image centre is the eyeball's centre
cx = int(args[2]) if len(args) > 2 else None
cy = int(args[3]) if len(args) > 3 else None

img = bpy.data.images.load(path)
img.colorspace_settings.name = "Non-Color"  # keep the 0..1 values as drawn
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3][::-1]
pxmm = w / (width_m * 1000.0)
cx = w // 2 if cx is None else cx
cy = h // 2 if cy is None else cy


def label(p):
    r, g, b = p
    lo, hi = p.min(), p.max()
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = 0.0 if hi <= 1e-6 else (hi - lo) / hi
    if lum < 0.10:
        return "ink"
    if r > g * 1.35 and r > b * 1.5 and lum < 0.55:
        return "iris"
    if lum > 0.55 and sat < 0.20:
        return "white"
    return "skin"


def runs(line, axis, origin):
    out, start, current = [], 0, label(line[0])
    for index in range(1, len(line)):
        name = label(line[index])
        if name != current:
            out.append((current, start, index - 1))
            current, start = name, index
    out.append((current, start, len(line) - 1))
    # keep only runs wide enough to be a feature, not an antialiased edge
    return [
        (name, (a - origin) / pxmm, (b + 1 - origin) / pxmm)
        for name, a, b in out
        if (b + 1 - a) >= 2
    ]


print(f"size {w} x {h}  {pxmm:.3f} px/mm  frame {width_m*1000:.0f} mm  centre {cx},{cy}")
for axis, line, origin in (
    ("row", px[cy, :, :], cx),
    ("col", px[:, cx, :], cy),
):
    print(f"{axis}:")
    for name, a, b in runs(line, axis, origin):
        print(f"  {name:<6} {a:+7.2f} .. {b:+7.2f} mm  ({b-a:5.2f} wide)")

