import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0,0,0))
plane = bpy.context.object
for length in (0.035, 0.1, 0.5):
    mod = plane.modifiers.new(f"h{length}", type="PARTICLE_SYSTEM")
    s = bpy.data.particles.new(f"s{length}")
    s.type = "HAIR"
    s.count = 200
    s.use_advanced_hair = True
    s.hair_length = length
    s.hair_step = 6
    mod.particle_system.settings = s
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = plane.evaluated_get(dg)
for ps in ev.particle_systems:
    ls = []
    for p in ps.particles:
        k = p.hair_keys
        if len(k) > 1:
            ls.append((k[-1].co - k[0].co).length)
    ls.sort()
    print("MEAS", ps.settings.hair_length, "median", round(ls[len(ls)//2], 4), "max", round(ls[-1], 4))
