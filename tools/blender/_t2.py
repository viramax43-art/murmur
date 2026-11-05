import bpy
s = bpy.data.particles.new("t")
s.type = "HAIR"
s.hair_length = 0.035
steps = [("count",4200),("emit_from","FACE"),("distribution","RAND"),("use_even_distribution",True),("use_advanced_hair",True),("hair_step",6),("render_step",6),("normal_factor",0.85),("factor_random",0.35),("child_type","INTERPOLATED"),("child_percent",6),("rendered_child_count",8),("clump_factor",0.45),("clump_shape",0.2),("roughness_1",0.0035),("roughness_1_size",0.6),("roughness_endpoint",0.004),("roughness_end_shape",0.8),("child_length_threshold",0.4),("child_radius",0.6),("radius_scale",0.0011),("root_radius",1.0),("tip_radius",0.1),("use_close_tip",True),("display_percentage",12),("material",0)]
for name, value in steps:
    if hasattr(s, name):
        setattr(s, name, value)
    print("STEP", name, "->", round(s.hair_length, 4))
