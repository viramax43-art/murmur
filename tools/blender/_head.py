import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import lib_body
bpy.ops.wm.read_factory_settings(use_empty=True)
body, eyes, height, low = lib_body.load_body("female", name="pb")
bpy.context.view_layer.update()
d = body.dimensions
print("DIM world", tuple(round(v,3) for v in d), "height ret", round(height,3), "scale", tuple(round(v,4) for v in body.scale))
xs = [v.co for v in body.data.vertices]
print("local z", round(min(v.z for v in xs),3), round(max(v.z for v in xs),3))
print("local x", round(min(v.x for v in xs),3), round(max(v.x for v in xs),3))
print("local y", round(min(v.y for v in xs),3), round(max(v.y for v in xs),3))
head = [v for v in xs if v.z > 1.45]
print("head verts", len(head), "y", round(min(v.y for v in head),3), round(max(v.y for v in head),3), "x", round(min(v.x for v in head),3), round(max(v.x for v in head),3), "z", round(min(v.z for v in head),3), round(max(v.z for v in head),3))
