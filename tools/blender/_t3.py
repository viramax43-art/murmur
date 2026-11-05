import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
bpy.ops.wm.read_factory_settings(use_empty=True)
import lib_body
coll = lib_body._append_collection("Body Female - Realistic")
bpy.context.view_layer.update()
for o in coll.all_objects:
    print("OBJ", o.name, o.type, "parent=", o.parent.name if o.parent else None, "parent_type=", o.parent_type, "loc=", tuple(round(v,2) for v in o.location), "world=", tuple(round(v,2) for v in o.matrix_world.translation), "polys=", len(o.data.polygons) if o.type=="MESH" else 0)
