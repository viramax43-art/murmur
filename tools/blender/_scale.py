import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, lib_body
bpy.ops.wm.read_factory_settings(use_empty=True)
body, eyes, height, low = lib_body.load_body("female")
print("BODYSCALE", body.matrix_world.to_scale(), "EYE", [e.matrix_world.to_scale() for e in eyes][:1])
