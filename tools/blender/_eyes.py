import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
bpy.ops.wm.read_factory_settings(use_empty=True)
import lib_body
body, eyes, height, low = lib_body.load_body("female", name="probe_body")
bpy.context.view_layer.update()
for e in eyes:
    print("A", e.name, tuple(round(v,3) for v in e.matrix_world.translation))
info = lib_body.eye_centres(eyes)
bpy.context.view_layer.update()
for eye, centre, radius in info:
    print("B", eye.name, tuple(round(v,3) for v in eye.matrix_world.translation), "centre", tuple(round(v,3) for v in centre), "r", round(radius,4))
print("head top z", round(height,3))
