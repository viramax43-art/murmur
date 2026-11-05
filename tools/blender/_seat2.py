"""Temp: measure the socket, so the eye seating is decided by numbers.

Ray-casts the head and the eyeball from the front on a half-millimetre grid and
reports where the eyeball wins, plus how far back it has to move for the skin to
take the silhouette over again.

    blender -b -P tools/blender/_seat2.py
"""

import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import lib_body

body, eyes, height, _low = lib_body.load_body("female", name="probe")
bpy.context.view_layer.update()
info = lib_body.eye_centres(eyes)
eye, centre, radius = info[0]
print(f"height {height:.4f}")
print(f"eye centre world {tuple(round(v, 5) for v in centre)}  radius {radius:.5f}")
print(f"eye scale {tuple(round(v, 4) for v in eye.matrix_world.to_scale())}")

inv = body.matrix_world.inverted()
local = inv @ centre
print(f"eye centre body-local {tuple(round(v, 5) for v in local)}")
forward = (body.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()


def skin_y(x, z):
    """Distance in front of the eye centre at which the head's surface sits."""
    origin = Vector((x, local.y - 0.09, z))
    hit, point, normal, _face = body.ray_cast(origin, Vector((0.0, 1.0, 0.0)))
    return None if not hit else point.y - local.y


def eye_y(x, z, back=0.0):
    """Same for the eyeball, as a sphere of the reported radius about its centre."""
    dx, dz = x - local.x, z - local.z
    reach = radius * radius - dx * dx - dz * dz
    if reach <= 0.0:
        return None
    return -reach**0.5 + back  # -Y is forward, so the near surface is negative


def visible(back, step=0.0005, span=0.020, inset=0.0):
    """Where the ball is in front of the skin: extent and centre."""
    xs, zs = [], []
    n = int(span / step)
    for i in range(-n, n + 1):
        for j in range(-n // 2, n // 2 + 1):
            x = local.x + i * step
            z = local.z + j * step
            sy = skin_y(x, z)
            ey = eye_y(x, z, back)
            if sy is None or ey is None:
                continue
            if ey + inset < sy:
                xs.append(x)
                zs.append(z)
    if not xs:
        return None
    return (max(xs) - min(xs)) * 1000, (max(zs) - min(zs)) * 1000, (min(zs) + max(zs)) / 2, (min(xs) + max(xs)) / 2


print("\nskin profile, vertical through the eye centre (mm from centre -> y in mm):")
row = []
for j in range(28, -29, -2):
    z = local.z + j * 0.0005
    sy = skin_y(local.x, z)
    ey = eye_y(local.x, z)
    row.append(f"{j * 0.5:+.1f}:{'--' if sy is None else f'{sy * 1000:+.2f}'}{'' if ey is None else f'/{ey * 1000:+.2f}'}")
print("  " + "  ".join(row))

print("\nskin profile, horizontal through the eye centre:")
row = []
for i in range(-30, 31, 3):
    x = local.x + i * 0.0005
    sy = skin_y(x, local.z)
    ey = eye_y(x, local.z)
    row.append(f"{i * 0.5:+.1f}:{'--' if sy is None else f'{sy * 1000:+.2f}'}{'' if ey is None else f'/{ey * 1000:+.2f}'}")
print("  " + "  ".join(row))

print("\nvisible eyeball against the seat offset (skin fixed, ball moved back):")
for back in (0.0, 0.0008, 0.0018, 0.0028, 0.004, 0.005, 0.006):
    got = visible(back)
    if got is None:
        print(f"  back {back * 1000:4.1f} mm -> no eyeball visible")
        continue
    w, h, zc, xc = got
    print(
        f"  back {back * 1000:4.1f} mm -> visible {w:5.2f} x {h:5.2f} mm"
        f"  centre x {(xc - local.x) * 1000:+5.2f} z {(zc - local.z) * 1000:+5.2f}"
    )

print("\nthe modelled lid opening, from the lash paint: 20 x 10 mm, 0.5 mm above centre")
