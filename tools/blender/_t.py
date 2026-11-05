import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import lib_common as C
bpy.ops.wm.read_factory_settings(use_empty=True)
import lib_body
body, eyes, height, low = lib_body.load_body("female", name="t")
mat = C.hair_material("h", (0.08,0.05,0.04))
cap = lib_body.hair(body, mat, height=height, thickness=0.006, length=0.035, count=2000, fall=0.012)
sys.stdout.flush()
for m in cap.modifiers:
    if m.type == "PARTICLE_SYSTEM":
        print("RESULT hair_length", m.particle_system.settings.hair_length, "count", m.particle_system.settings.count)
