"""Ray-probe the lid margin: from straight on, which surface is seen where?

Rendering an eye and guessing at pixels conflates shading with geometry. This
fires rays from the front and reports what they hit first, so the visible eye
opening and the ink line come back in millimetres.

    blender -b -P tools/blender/_lid.py
"""

import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_body
import lib_common as C
import lib_person

C.reset(samples=16)
lib_person.person("probe", kind="female", base=(0, 0, 0), hair_style="buzz")
deps = bpy.context.evaluated_depsgraph_get()
scene = bpy.context.scene


def bounds(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    low = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    high = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return low, high


balls = [o for o in bpy.data.objects if ".eye." in o.name]
lids = [o for o in bpy.data.objects if o.name.endswith("_lid0") or o.name.endswith("_lid1")]
if not balls or not lids:
    print("no eyes or no lid margins: nothing to probe")
    raise SystemExit


def centre_of(obj):
    low, high = bounds(obj)
    return (low + high) / 2


lid = lids[0]
eyes = [centre_of(o) for o in balls]
ball = min(balls, key=lambda o: (centre_of(o) - centre_of(lid)).length)
centre = centre_of(ball)
radius = (bounds(ball)[1] - bounds(ball)[0]).x / 2
print(f"ball r {radius*1000:.2f} mm at ({centre.x*1000:.2f}, {centre.y*1000:.2f}, {centre.z*1000:.2f}) body mm")


def hit(x, z):
    """First surface seen at this offset from the eyeball centre, looking from -Y."""
    origin = Vector((centre.x + x, centre.y - 0.05, centre.z + z))
    found, loc, normal, index, obj, matrix = scene.ray_cast(deps, origin, Vector((0.0, 1.0, 0.0)), distance=0.12)
    if not found:
        return "none", None
    name = obj.name
    if name == ball.name:
        tag = "ball"
    elif name.startswith(lid.name[:-1]):
        tag = "ink" if _is_ink(obj, index) else "lid"
    elif name.endswith("_body"):
        tag = "body"
    else:
        tag = name
    return tag, loc.y


def _is_ink(obj, index):
    try:
        return obj.data.polygons[index].material_index == 1
    except (IndexError, AttributeError):
        return False


# straight in at the eyeball's centre: is the ball in front of the lid plane?
tag, depth = hit(0.0, 0.0)
print(f"centre: {tag} at y {(depth - centre.y)*1000:+.2f} mm from the eye centre")

for axis, name in ((0, "across"), (2, "up")):
    for sign, side in ((1, "outboard/top"), (-1, "inboard/bottom")):
        step = 0.0001
        seen, last_ball, ink_from, ink_to = None, 0.0, None, None
        for index in range(1, 220):
            offset = sign * index * step
            point = (offset, 0.0) if axis == 0 else (0.0, offset)
            tag, depth = hit(*point)
            if tag == "ball":
                last_ball = abs(offset)
            elif ink_from is None:
                ink_from = abs(offset)
                ink_to = abs(offset)
                seen = tag
            elif tag == "ink":
                ink_to = abs(offset)
            elif seen == "ink" and abs(offset) - ink_to > 0.0006:
                break
        print(
            f"{name} {side:<16} sclera to {last_ball*1000:5.2f} mm,"
            f" ink {ink_from*1000 if ink_from else float('nan'):5.2f}"
            f"..{ink_to*1000 if ink_to else float('nan'):5.2f} mm, then {seen}"
        )

# the whole opening, and the size of the iris it has to hold
xs = [x * 0.0001 for x in range(-140, 141)]
zs = [z * 0.0001 for z in range(-90, 91)]
open_px = [(x, z) for z in zs for x in xs if hit(x, z)[0] in ("ball", "ink")]
if open_px:
    print(
        f"opening {max(p[0] for p in open_px)*1000*2:5.2f} x {max(p[1] for p in open_px)*1000*2:5.2f} mm"
        f"  (iris projects {(0.425 * radius * 2)*1000:.2f} mm across)"
    )
