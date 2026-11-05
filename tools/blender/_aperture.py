"""Temp: ray-cast a depth map across the eye and the mouth.

Vertices and crease angles were inconclusive, so ask the surface directly: fire
rays at the face from in front and print where they land. A socket that is a
recess answers every ray; a socket that is a hole answers none.

    blender -b -P tools/blender/_aperture.py
"""

import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import lib_body
import lib_common as C

C.reset(samples=16, gpu=False)
body, eyes, height, _low = lib_body.load_body("female", name="probe")
bpy.context.view_layer.update()
info = lib_body.eye_centres(eyes)
to_body = body.matrix_world.inverted()
matrix = body.matrix_world.copy()
print("HEIGHT", round(height, 4), "BODY scale", tuple(round(v, 4) for v in matrix.to_scale()))

origin_y = -0.30


def probe(x, z, y=origin_y):
    """First hit walking +Y, in body space."""
    ok, location, normal, _index = body.ray_cast(Vector((x, y, z)), Vector((0, 1, 0)))
    if not ok:
        return None, None
    local = matrix.inverted() @ location
    return local, normal


_eye, centre, radius = info[0]
local = to_body @ centre
print("\nEYE centre (body)", tuple(round(v, 4) for v in local), "radius", round(radius, 4))

print("\nDEPTH MAP of one eye: '.' = no surface (hole), digit = mm behind the eye centre / 2")
rows = []
for iz in range(12, -13, -1):
    line = ""
    for ix in range(-18, 19):
        x = local.x + ix * 0.001
        z = local.z + iz * 0.001
        hit, _n = probe(x, z)
        if hit is None:
            line += "."
        else:
            depth = (hit.y - local.y) * 1000
            line += "0123456789ABCDEF"[max(0, min(15, int(depth / 2)))]
    rows.append(line)
print("      x from -18 to +18 mm, 1 mm per column; z from +12 down to -12 mm")
for iz, line in zip(range(12, -13, -1), rows):
    print(f"  {iz:+03d} {line}")

print("\nMIDLINE row (z = eye centre): x offset, depth in mm behind the centre")
for ix in range(-18, 19, 2):
    x = local.x + ix * 0.001
    hit, _n = probe(x, local.z)
    depth = "hole" if hit is None else round((hit.y - local.y) * 1000, 2)
    print(f"  x {ix:+03d} mm  y {depth}")

print("\nLIP profile down the midline: z, depth in mm")
for step in range(30):
    z = 1.418 + step * 0.002
    hit, _n = probe(0.0, z)
    depth = "hole" if hit is None else round(hit.y * 1000, 1)
    print(f"  z {round(z, 4)}  y {depth}")
