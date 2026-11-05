import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import lib_body, lib_common as C
bpy.ops.wm.read_factory_settings(use_empty=True)
body, eyes, height, low = lib_body.load_body("female", name="pb")
cap = lib_body.hair(body, C.hair_material("h", (0.08,0.05,0.04)), height=height)
def bbox(mesh):
    vs = [v.co for v in mesh.vertices]
    return tuple(round(min(v[i] for v in vs),3) for i in range(3)) + tuple(round(max(v[i] for v in vs),3) for i in range(3))
print("CAP faces", len(cap.data.polygons), "bbox", bbox(cap.data))
bpy.context.view_layer.update()
ev = cap.evaluated_get(bpy.context.evaluated_depsgraph_get())
print("EVAL faces", len(ev.data.polygons), "bbox", bbox(ev.data))
