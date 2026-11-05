import os, sys, bpy
sys.path.insert(0, os.path.abspath("tools/blender"))
import scenes
bpy.ops.wm.read_factory_settings(use_empty=True)
scenes.SCENES["ch1-in"]()
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
for obj in bpy.context.scene.objects:
    if not obj.name.endswith("_hair"):
        continue
    ev = obj.evaluated_get(dg)
    for ps in ev.particle_systems:
        particles = ps.particles
        print("HAIR", obj.name, "count", len(particles), "sys", ps.settings.hair_length)
        if len(particles):
            p = particles[0]
            print("  keys", len(p.hair_keys))
            co = [obj.matrix_world @ k.co for k in p.hair_keys]
            if co:
                zs = [c.z for c in co]
                print("  first strand z", round(min(zs),3), round(max(zs),3), "root", tuple(round(v,2) for v in co[0]))
        zmin = 1e9; zmax = -1e9
        for p in particles:
            for k in p.hair_keys:
                w = obj.matrix_world @ k.co
                zmin = min(zmin, w.z); zmax = max(zmax, w.z)
        print("  ALL z", round(zmin,3), round(zmax,3))
