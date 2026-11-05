import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import scenes
bpy.ops.wm.read_factory_settings(use_empty=True)
scenes.SCENES["ch1-in"]()
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
obj = bpy.data.objects["mama_body_hair"]
ev = obj.evaluated_get(dg)
ps = ev.particle_systems[0]
lengths = []
for p in ps.particles:
    keys = p.hair_keys
    if len(keys) < 2:
        lengths.append(-1)
        continue
    lengths.append((keys[-1].co - keys[0].co).length)
lengths.sort()
import statistics
print("N", len(lengths), "min", round(lengths[0],4), "median", round(lengths[len(lengths)//2],4), "max", round(lengths[-1],4))
buckets = {}
for L in lengths:
    b = round(L, 2)
    buckets[b] = buckets.get(b, 0) + 1
print("BUCKETS", sorted(buckets.items())[:12])
print("TAIL", [(round(L,2)) for L in lengths[-6:]])
mesh = ev.data
areas = [f.area for f in mesh.polygons]
print("faces", len(areas), "tiny", sum(1 for a in areas if a < 1e-8))
