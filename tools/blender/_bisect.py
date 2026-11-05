import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
candidates = [("factor_random",0.35),("clump_factor",0.45),("clump_shape",0.2),("roughness_1",0.0035),("roughness_1_size",0.6),("roughness_endpoint",0.004),("roughness_end_shape",0.8),("child_length_threshold",0.4),("child_radius",0.6),("radius_scale",0.0011),("root_radius",1.0),("tip_radius",0.1),("child_percent",6),("use_advanced_hair",True),("hair_step",6)]
for name, value in candidates:
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    plane = bpy.context.object
    mod = plane.modifiers.new("h", type="PARTICLE_SYSTEM")
    s = bpy.data.particles.new("s_"+name)
    mod.particle_system.settings = s
    s.type = "HAIR"
    s.count = 80
    s.hair_length = 0.035
    setattr(s, name, value)
    bpy.context.view_layer.update()
    ev = plane.evaluated_get(bpy.context.evaluated_depsgraph_get())
    ps = ev.particle_systems[0]
    ls = sorted(((p.hair_keys[-1].co - p.hair_keys[0].co).length) for p in ps.particles if len(p.hair_keys) > 1)
    med = round(ls[len(ls)//2], 4) if ls else -1
    print("TEST", name, "->", med, "hl", round(ps.settings.hair_length,4))
