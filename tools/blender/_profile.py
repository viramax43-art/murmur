import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import lib_body
from mathutils import Vector
for kind in ("female", "male"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, eyes, height, low = lib_body.load_body(kind, name="pb")
    bpy.context.view_layer.update()
    inv = body.matrix_world.inverted()
    def profile(x, z):
        origin = inv @ Vector((x, -0.6, z))
        direction = (inv.to_3x3() @ Vector((0, 1, 0))).normalized()
        hit, loc, nor, idx = body.ray_cast(origin, direction)
        if not hit:
            return None
        return body.matrix_world @ loc, (body.matrix_world.to_3x3() @ nor).normalized()
    h = height
    print("==", kind, round(h,3))
    z = h * 0.995
    while z > h * 0.80:
        out = profile(0.0, z)
        if out:
            p, n = out
            print("  z %.3f (%.4f h)  y %.4f  nz %.2f ny %.2f" % (z, z/h, p.y, n.z, n.y))
        else:
            print("  z %.3f (%.4f h)  MISS" % (z, z/h))
        z -= 0.01
