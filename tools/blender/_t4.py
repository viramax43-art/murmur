import bpy
s = bpy.data.particles.new("t")
s.type = "HAIR"
s.use_advanced_hair = True
s.normal_factor = 0.85
s.factor_random = 0.35
s.hair_length = 0.035
print("ORDERED hair_length", s.hair_length)
s.normal_factor = 0.9
print("after retouch normal", s.hair_length)
