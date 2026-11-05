"""Debug: is the eye shader reading the object space it expects?

`eye_material` builds pupil, iris and limbal ring from the distance to the look
axis *in object space*, divided by a radius that `lib_person` derives from the
eyeball's world bounds and its object scale. Two things can disagree and leave
the ramp parked at the sclera end -- a plain grey ball with fibre streaks that
looks like a lighting problem and is not one:

* the radius (`-> shader radius` vs the object-space bounds it normalises), or
* the axes. A bundle can ship the same sphere with its local Y pointing up
  instead of forward; the world silhouette is identical, the shader's frontal
  plane is not, so check `rotation` reads 0, 0, 0 for every kind.

    blender -b -P tools/blender/_eyeinfo.py
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


def report(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    C.reset(samples=1)
    lib_person.person("probe", kind=kind, base=(0, 0, 0), hair_style="buzz")
    body = bpy.data.objects["probe_body"]
    eyes = [obj for obj in bpy.data.objects if ".eye." in obj.name]
    print(f"[{kind}] {len(eyes)} eye objects, body scale {body.matrix_world.to_scale().x:.4f}")
    info = lib_body.eye_centres(eyes)
    body_scale = body.matrix_world.to_scale().x
    for eye, centre, radius in info:
        scale = eye.matrix_world.to_scale()
        local = [v.co for v in eye.data.vertices]
        low = Vector((min(v.x for v in local), min(v.y for v in local), min(v.z for v in local)))
        high = Vector((max(v.x for v in local), max(v.y for v in local), max(v.z for v in local)))
        print(
            f"[{kind}] {eye.name}: world centre ({centre.x * 1000:7.2f}, {centre.y * 1000:7.2f},"
            f" {centre.z * 1000:7.2f}) mm, world r {radius * 1000:6.2f} mm,"
            f" object scale ({scale.x:.4f}, {scale.y:.4f}, {scale.z:.4f})"
        )
        euler = eye.matrix_world.to_euler()
        print(
            f"[{kind}]   rotation ({euler.x * 57.2958:6.1f}, {euler.y * 57.2958:6.1f},"
            f" {euler.z * 57.2958:6.1f}) deg, det {eye.matrix_world.determinant():+.5f}"
        )
        print(
            f"[{kind}]   object-space bounds x {low.x * 1000:7.2f}..{high.x * 1000:7.2f}"
            f"  y {low.y * 1000:7.2f}..{high.y * 1000:7.2f}"
            f"  z {low.z * 1000:7.2f}..{high.z * 1000:7.2f} mm"
        )
        print(
            f"[{kind}]   -> shader radius {radius / max(scale.x, 1e-9) * 1000:.2f} mm,"
            f" socket radius {radius / max(body_scale, 1e-9) * 1000:.2f} mm body units"
        )


for each in ("female", "male"):
    report(each)
