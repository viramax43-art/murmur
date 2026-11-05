"""Temp: does the new hair/face rig actually build? Prints numbers, no render."""

import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import lib_body
import lib_person

bpy.ops.wm.read_factory_settings(use_empty=True)
lib_person.person("t", kind="female", hair_style="short")
bpy.context.view_layer.update()

body = bpy.data.objects["t_body"]
loc, rot, scale = body.matrix_world.decompose()
print("BODY scale", tuple(round(v, 4) for v in scale), "loc", tuple(round(v, 4) for v in loc))
corners = [body.matrix_world @ Vector(c) for c in body.bound_box]
world_h = max(c.z for c in corners) - min(c.z for c in corners)
print("HEIGHT world", round(world_h, 4))

marks = lib_body._head_landmarks(body, world_h)
print("LANDMARKS", {k: round(v, 4) for k, v in marks.items()})

for obj in bpy.context.scene.objects:
    if obj.type != "MESH" or len(obj.data.polygons) > 700:
        continue
    mw = obj.matrix_world
    loc, rot, scl = mw.decompose()
    local = [v.co for v in obj.data.vertices]
    centre_local = sum(local, Vector()) / len(local)
    dists = sorted((v - centre_local).length for v in local)
    print(
        "SMALL",
        obj.name,
        "polys",
        len(obj.data.polygons),
        "loc",
        tuple(round(v, 4) for v in loc),
        "rot",
        tuple(round(v, 1) for v in [a * 57.2958 for a in rot.to_euler()]),
        "scale",
        tuple(round(v, 3) for v in scl),
        "mean_r",
        round(dists[len(dists) // 2], 4),
        "max_r",
        round(dists[-1], 4),
    )

for obj in bpy.context.scene.objects:
    if obj.type == "CURVES":
        print("CURVES", obj.name, "curves", len(obj.data.curves), "points", len(obj.data.points))

for obj in bpy.context.scene.objects:
    if obj.type == "CURVES":
        print("CURVES", obj.name, "curves", len(obj.data.curves), "points", len(obj.data.points))

for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and obj.data.materials:
        names = [m.name for m in obj.data.materials]
        counts = {}
        for poly in obj.data.polygons:
            counts[names[poly.material_index] if poly.material_index < len(names) else "?"] = (
                counts.get(names[poly.material_index] if poly.material_index < len(names) else "?", 0) + 1
            )
        print("MESH", obj.name, counts)
