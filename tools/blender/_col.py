"""Debug: read a render back as runs of colour along the eye's centre lines.

A render answers "what does it look like" but not "where": a dark ring is the ink
line plus its own shadow, and no amount of squinting separates them. This walks
the pixels of a probe render along the vertical and horizontal through the eye
centre and collapses them into runs, so each of sclera, iris, ink line, lid
margin and skin comes back as a span in millimetres.

    blender -b -P tools/blender/_col.py -- out/face/face-female-front_lid6.png 4.0

The second argument is the frame width in metres, which is what `probe_face`'s
`--zoom` divides 0.22 by, so pixel counts become millimetres at the depth of the
aim point.
"""

import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGE_WIDTH = 0.22  # probe_face frames 0.22 m across at zoom 1


def to_srgb(value):
    """Blender stores scene-linear floats; the numbers people read are sRGB."""
    value = max(0.0, min(1.0, float(value)))
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1.0 / 2.4) - 0.055


def hexed(pixel):
    return "#" + "".join(f"{round(to_srgb(channel) * 255):02x}" for channel in pixel[:3])


def runs(values):
    """Collapse a line of pixels into runs of near-identical colour."""
    out = []
    start, colour = 0, values[0]
    for index in range(1, len(values)):
        if np.abs(values[index] - colour).max() > 0.02:
            out.append((start, index, colour))
            start, colour = index, values[index]
    out.append((start, len(values), colour))
    return [(lo, hi, colour) for lo, hi, colour in out if hi - lo > 1]


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    path = argv[0] if argv else os.path.join(HERE, "out", "face", "face-female-front_lid6.png")
    zoom = float(argv[1]) if len(argv) > 1 else 4.0
    if not os.path.isabs(path):
        path = os.path.join(HERE, path)
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    pixels = pixels[::-1]  # Blender's first row is the bottom of the image
    mm = IMAGE_WIDTH / zoom / width * 1000.0  # millimetres per pixel at the aim point
    mid_x, mid_y = width // 2, height // 2
    print(f"[image] {os.path.basename(path)} {width}x{height}, {mm:.4f} mm per pixel, centre at ({mid_x}, {mid_y})")

    for label, line, mid in (
        ("down the eye (z)", pixels[:, mid_x], mid_y),
        ("across the eye (x)", pixels[mid_y], mid_x),
    ):
        print(f"[{label}]")
        for lo, hi, colour in runs(line):
            print(
                f"  {(lo - mid) * mm:+7.2f} .. {(hi - mid) * mm:+7.2f} mm  "
                f"({hi - lo:3d} px, {(hi - lo) * mm:5.2f} mm)  {hexed(colour)}"
            )


if __name__ == "__main__":
    main()
