import bpy
print("has hair_curves:", hasattr(bpy.data, "hair_curves"))
hc = bpy.data.hair_curves.new("test")
print("curves type:", type(hc))
print("attrs:", [a for a in dir(hc) if not a.startswith("_")][:60])
print("has add_curves:", hasattr(hc, "add_curves"))
print("attributes:", [(a.name, a.domain, a.data_type) for a in hc.attributes])
