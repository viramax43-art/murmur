"""Temp: the eyeball on its own, so the shader bands are readable.

    blender -b -P tools/blender/_eye.py
"""

import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import lib_body
import lib_common as C

C.reset(samples=48)
body, eyes, height, _low = lib_body.load_body("female", name="probe")
eye = eyes[0]
bpy.context.view_layer.update()

# --- what are the local coordinates actually like? -------------------------
me = eye.data
lo = Vector((min(v.co.x for v in me.vertices), min(v.co.y for v in me.vertices), min(v.co.z for v in me.vertices)))
hi = Vector((max(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices), max(v.co.z for v in me.vertices)))
print("EYE local bounds", tuple(round(v, 4) for v in lo), tuple(round(v, 4) for v in hi))
print("EYE world scale", tuple(round(v, 4) for v in eye.matrix_world.to_scale()))
print("EYE world loc", tuple(round(v, 4) for v in eye.matrix_world.translation))
print("EYE local radius", round(max(hi - lo) / 2, 5))

# --- put it alone in the studio -------------------------------------------
for obj in bpy.context.scene.objects:
    if obj.name != eye.name:
        obj.hide_render = True
eye.parent = None
eye.matrix_world.identity()

C.world(color=(0.35, 0.35, 0.38), strength=0.35)
key = C.area("key", (-0.09, -0.11, 0.07), energy=2.0, size=0.10)
C.aim(key, (0, 0, 0))
fill = C.area("fill", (0.10, -0.10, 0.0), energy=0.7, size=0.12)
C.aim(fill, (0, 0, 0))

mat = C.eye_material("probe_eye", iris=(0.16, 0.09, 0.05), radius=0.014)
eye.data.materials.clear()
eye.data.materials.append(mat)

# 85 mm at 115 mm: a 28 mm ball fills the frame, and 115 mm is past the focal
# length so the lens can actually focus (it cannot at 55 mm, which is why the
# first probe was a smear)
cam = C.camera((0, -0.115, 0), (0, 0, 0), lens=85.0, fstop=None)
cam.data.clip_start = 0.002
scene = bpy.context.scene
scene.cycles.use_denoising = False
scene.render.filter_size = 0.01
C.render("eye-front", os.path.join(HERE, "out", "face"), width=480, height=480, samples=200, film=False)

# what the shader actually computes, with the lighting taken out of the argument
nodes = mat.node_tree.nodes
links = mat.node_tree.links
bsdf = nodes.get("Principled BSDF")
source = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].is_linked else None
emit = nodes.new("ShaderNodeEmission")
if source is not None:
    links.new(source, emit.inputs["Color"])
out = nodes.get("Material Output")
links.new(emit.outputs[0], out.inputs["Surface"])
C.render("eye-colour", os.path.join(HERE, "out", "face"), width=480, height=480, samples=16, film=False)

# what the shader actually computes, with the lighting taken out of the argument
nodes = mat.node_tree.nodes
links = mat.node_tree.links
bsdf = nodes.get("Principled BSDF")
source = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].is_linked else None
print("BASE COLOUR LINKED", source is not None, source)
emit = nodes.new("ShaderNodeEmission")
if source is not None:
    links.new(source, emit.inputs["Color"])
out = nodes.get("Material Output")
links.new(emit.outputs[0], out.inputs["Surface"])
band = next((n for n in nodes if n.bl_idname == "ShaderNodeValToRGB"), None)
print("RAMPS", [(round(e.position, 3), tuple(round(c, 3) for c in e.color)) for e in band.color_ramp.elements])
noise = [n for n in nodes if n.bl_idname == "ShaderNodeTexNoise"]
print("NOISE", [(n.inputs["Scale"].default_value, n.inputs["Detail"].default_value, n.inputs["Vector"].is_linked) for n in noise])
mix = [n for n in nodes if n.bl_idname == "ShaderNodeMix"]
print("MIX", [(n.blend_type, n.inputs[0].is_linked, round(n.inputs[0].default_value, 3)) for n in mix])
print("NODES", len(nodes))
C.render("eye-colour", os.path.join(HERE, "out", "face"), width=480, height=480, samples=16, film=False)

cam = C.camera((0, -0.055, 0), (0, 0, 0), lens=85.0, fstop=8.0, focus=0.055)
cam.data.clip_start = 0.001  # default 0.1 clips a 28 mm eyeball at 55 mm
C.render("eye-front", os.path.join(HERE, "out", "face"), width=480, height=480, samples=48, film=False)

# and a debug view: the raw Object-coordinate radius as a heat map
dbg = C.material("probe_coords", base=(0.1, 0.1, 0.1), roughness=0.5)
nodes = dbg.node_tree.nodes
links = dbg.node_tree.links
bsdf = nodes.get("Principled BSDF")
coord = nodes.new("ShaderNodeTexCoord")
sep = nodes.new("ShaderNodeSeparateXYZ")
links.new(coord.outputs["Object"], sep.inputs[0])
plane = nodes.new("ShaderNodeCombineXYZ")
links.new(sep.outputs["X"], plane.inputs["X"])
links.new(sep.outputs["Z"], plane.inputs["Z"])
length = nodes.new("ShaderNodeVectorMath")
length.operation = "LENGTH"
links.new(plane.outputs[0], length.inputs[0])
div = nodes.new("ShaderNodeMath")
div.operation = "DIVIDE"
div.inputs[1].default_value = 0.0144
links.new(length.outputs["Value"], div.inputs[0])
ramp = nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
ramp.color_ramp.elements[1].position = 1.0
ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
for pos, col in ((0.16, (0.1, 0.0, 0.4, 1)), (0.51, (0.9, 0.1, 0.0, 1)), (0.56, (0.1, 0.9, 0.2, 1))):
    e = ramp.color_ramp.elements.new(pos)
    e.color = col
links.new(div.outputs[0], ramp.inputs["Fac"])
links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
eye.data.materials.clear()
eye.data.materials.append(dbg)
C.render("eye-coords", os.path.join(HERE, "out", "face"), width=480, height=480, samples=24, film=False)
