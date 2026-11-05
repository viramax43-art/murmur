"""Temp: cross-section through the eye, so the lid/socket is not a guess.

Cuts body + eyeball on the plane x = eye centre and looks straight into the cut.

    blender -b -P tools/blender/_cross.py
"""

import os
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import lib_body
import lib_common as C

C.reset(samples=32)
body, eyes, height, _low = lib_body.load_body("female", name="probe")
bpy.context.view_layer.update()
info = lib_body.eye_centres(eyes)
eye_obj, centre, radius = info[0]
print("EYE centre", tuple(round(v, 4) for v in centre), "radius", round(radius, 4))

skin = C.material("cross_skin", base=(0.55, 0.42, 0.38), roughness=0.5)
eye_mat = C.material("cross_eye", base=(0.9, 0.15, 0.12), roughness=0.2)
body.data.materials.clear()
body.data.materials.append(skin)
for poly in body.data.polygons:
    poly.material_index = 0
eye_obj.data.materials.clear()
eye_obj.data.materials.append(eye_mat)

# cut everything at x = eye.x, keep the far half (+X), so the camera on +X sees
# the inside of the cut: the socket profile and a disc of eyeball
cut = centre.x
for obj in (body, eye_obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    matrix = obj.matrix_world
    plane_co = matrix.inverted() @ Vector((cut, centre.y, centre.z))
    normal = (matrix.inverted().to_3x3() @ Vector((1, 0, 0))).normalized()
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane_co, plane_no=normal, clear_inner=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and obj not in (body, eye_obj):
        obj.hide_render = True

C.world(color=(0.4, 0.4, 0.42), strength=0.6)
key = C.area("key", (cut + 0.25, centre.y - 0.2, centre.z + 0.2), energy=12.0, size=0.3)
C.aim(key, (cut, centre.y, centre.z))
cam = C.camera((cut - 0.075, centre.y, centre.z), (cut, centre.y, centre.z), lens=85.0, fstop=22.0, focus=0.075)
cam.data.clip_start = 0.004
C.render("eye-cross", os.path.join(HERE, "out", "face"), width=640, height=640, samples=32, film=False)
