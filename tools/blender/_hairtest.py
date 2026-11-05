import os, sys, math, random
sys.path.insert(0, os.path.abspath("tools/blender"))
import bpy
from mathutils import Vector, noise
import lib_common as C
C.reset(samples=16, gpu=True)
C.world((0.4,0.42,0.5), 1.0)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0,0,1.6), segments=48, ring_count=24)
sphere = bpy.context.object
C.area("key", (0.5,-0.6,2.1), energy=60.0, size=1.0)
C.aim(bpy.data.objects["key"], (0,0,1.6))
C.camera(loc=(0.0,-0.55,1.62), target=(0,0,1.6), lens=85.0, fstop=4.0, focus=0.55)
mats = C.hair_material("hairtest", (0.09,0.05,0.035))
print("props:", [p for p in dir(bpy.data.hair_curves.new("probe")) if "shape" in p or "res" in p or "subdiv" in p])
hc = bpy.data.hair_curves.new("strands")
n, npts = 900, 7
hc.add_curves([npts] * n)
pts, radii = [], []
rng = random.Random(3)
for i in range(n):
    # root on the upper hemisphere
    theta = rng.uniform(0, 2*math.pi); phi = rng.uniform(0, 1.1)
    nrm = Vector((math.sin(phi)*math.cos(theta), math.sin(phi)*math.sin(theta), math.cos(phi)))
    root = Vector((0,0,1.6)) + nrm * 0.1
    ln = rng.uniform(0.04, 0.08)
    for s in range(npts):
        t = s / (npts-1)
        p = root + nrm * (0.02*t) + Vector((0,0,-1)) * (ln*t*t*0.9) + Vector((0.0, -0.02*t*t, 0))
        pts.extend(p)
        radii.append(0.0005 * (1 - 0.7*t))
hc.position_data.foreach_set("vector", pts)
rad = hc.attributes.new("radius", "FLOAT", "POINT")
rad.data.foreach_set("value", radii)
hc.materials.append(mats)
obj = bpy.data.objects.new("strands", hc)
bpy.context.collection.objects.link(obj)
C.render("hairtest", os.path.join(os.path.dirname(os.path.abspath("tools/blender/x")), "blender", "out", "hairapi"), width=320, height=320, samples=16, film=False)
