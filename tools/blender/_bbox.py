import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import scenes
bpy.ops.wm.read_factory_settings(use_empty=True)
scenes.SCENES["ch1-in"]()
bpy.context.view_layer.update()
from mathutils import Vector
rows = []
for o in bpy.context.scene.objects:
    if o.type != "MESH":
        continue
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
    hi = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
    size = hi - lo
    rows.append((max(size), o.name, tuple(round(v,2) for v in lo), tuple(round(v,2) for v in hi)))
for r in sorted(rows, reverse=True)[:14]:
    print("BIG", round(r[0],2), r[1], r[2], r[3])
