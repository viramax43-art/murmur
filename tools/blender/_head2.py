import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import lib_body
from mathutils import Vector
for kind in ("female", "male"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, eyes, height, low = lib_body.load_body(kind, name="pb")
    bpy.context.view_layer.update()
    print("==", kind, "height", round(height,3))
    for eye in eyes:
        corners = [eye.matrix_world @ Vector(c) for c in eye.bound_box]
        lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
        mid = (lo + hi) / 2
        print("  eye", eye.name, "mid", tuple(round(v,4) for v in mid), "size", tuple(round(v,4) for v in (hi-lo)))
    vs = [body.matrix_world @ v.co for v in body.data.vertices]
    head = [v for v in vs if v.z > 0.93 * height]
    print("  head verts", len(head))
    print("  head x", round(min(v.x for v in head),4), round(max(v.x for v in head),4))
    print("  head y", round(min(v.y for v in head),4), round(max(v.y for v in head),4))
    print("  head z", round(min(v.z for v in head),4), round(max(v.z for v in head),4))
    print("  head centroid", tuple(round(v,4) for v in (sum(head, Vector())/len(head))))
    for frac in (0.88, 0.90, 0.92, 0.94):
        band = [v for v in vs if frac*height < v.z < (frac+0.01)*height]
        print("   band", frac, "y", round(min(v.y for v in band),4), round(max(v.y for v in band),4), "x", round(min(v.x for v in band),4), round(max(v.x for v in band),4))
