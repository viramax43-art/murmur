import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_plane_add(size=1.0)
plane = bpy.context.object
def build(**over):
    mod = plane.modifiers.new("h", type="PARTICLE_SYSTEM")
    s = bpy.data.particles.new("s")
    mod.particle_system.settings = s
    s.type = "HAIR"
    s.count = 120
    s.emit_from = "FACE"
    s.distribution = "RAND"
    s.use_even_distribution = True
    s.use_advanced_hair = True
    s.hair_step = 6
    s.render_step = 6
    s.factor_random = 0.35
    s.child_type = "INTERPOLATED"
    s.child_percent = 6
    s.rendered_child_count = 0
    s.clump_factor = 0.45
    s.clump_shape = 0.2
    s.roughness_1 = 0.0035
    s.roughness_1_size = 0.6
    s.roughness_endpoint = 0.004
    s.roughness_end_shape = 0.8
    s.child_length_threshold = 0.4
    s.child_radius = 0.6
    s.radius_scale = 0.0011
    s.root_radius = 1.0
    s.tip_radius = 0.1
    s.use_close_tip = True
    s.display_percentage = 12
    s.material = 0
    s.hair_length = 0.035
    return s
build()
bpy.context.view_layer.update()
ev = plane.evaluated_get(bpy.context.evaluated_depsgraph_get())
ps = ev.particle_systems[0]
ls = sorted(((p.hair_keys[-1].co - p.hair_keys[0].co).length) for p in ps.particles if len(p.hair_keys) > 1)
print("FULL SEQ hair_length", ps.settings.hair_length, "median", round(ls[len(ls)//2],4), "max", round(ls[-1],4))
print("attrs factor_random", ps.settings.factor_random, "normal", ps.settings.normal_factor)
