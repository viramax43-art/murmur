import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
for name, value in (["length_random",0.3], ["child_length",0.8], ["use_even_distribution",True], ["display_percentage",12]):
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    plane = bpy.context.object
    mod = plane.modifiers.new("h", type="PARTICLE_SYSTEM")
    s = bpy.data.particles.new("s_"+name)
    mod.particle_system.settings = s
    s.type = "HAIR"
    s.count = 80
    s.hair_length = 0.035
    try:
        setattr(s, name, value)
    except Exception as exc:
        print("TEST", name, "FAILED", exc)
    bpy.context.view_layer.update()
    ev = plane.evaluated_get(bpy.context.evaluated_depsgraph_get())
    ps = ev.particle_systems[0]
    ls = sorted(((p.hair_keys[-1].co - p.hair_keys[0].co).length) for p in ps.particles if len(p.hair_keys) > 1)
    med = round(ls[len(ls)//2], 4) if ls else -1
    print("TEST", name, "->", med, "hl", round(ps.settings.hair_length, 4))
