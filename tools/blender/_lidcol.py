"""Debug: paint each surface a flat colour, so a render says which one is seen.

Magenta is the lid band's skin strip, cyan its ink strip, green the head and blue
the eyeball. Then "is that a gap or a lid?" is a colour question, not a guess.

    blender -b -P tools/blender/_lidcol.py
"""

import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_common as C
import lib_person
import probe_face


def flat(name, rgb):
    """Unlit colour: no shading to mistake for a different surface."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for node in list(nodes):
        if node.type != "OUTPUT_MATERIAL":
            nodes.remove(node)
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    mat.node_tree.links.new(emit.outputs["Emission"], nodes["Material Output"].inputs["Surface"])
    return mat


def main():
    probe_face.studio()
    lib_person.person(
        "face",
        kind="female",
        base=(0, 0, 0),
        skin_tone=(0.78, 0.58, 0.49),
        hair_style="short",
    )
    body = bpy.data.objects["face_body"]
    bpy.context.view_layer.update()
    height = max((body.matrix_world @ Vector(c)).z for c in body.bound_box)

    band = flat("debug_band", (1.0, 0.0, 1.0))
    ink = flat("debug_ink", (0.0, 1.0, 1.0))
    head = flat("debug_head", (0.0, 0.45, 0.0))
    ball = flat("debug_ball", (0.0, 0.0, 1.0))
    other = flat("debug_other", (1.0, 1.0, 0.0))
    for index in range(len(body.data.materials)):
        body.data.materials[index] = head
    for obj in bpy.data.objects:
        if obj is body or obj.type not in ("MESH", "CURVES"):
            continue
        if ".eye." in obj.name:
            tint = ball
        elif obj.name.startswith("face_lid"):
            continue
        else:
            tint = other
        for index in range(len(obj.data.materials)):
            obj.data.materials[index] = tint
        print(f"[obj] {obj.name} -> {tint.name}")
    for obj in bpy.data.objects:
        if not obj.name.startswith("face_lid"):
            continue
        for index in range(len(obj.data.materials)):
            obj.data.materials[index] = ink if index else band
        xs = [v.co.x for v in obj.data.vertices]
        zs = [v.co.z for v in obj.data.vertices]
        ys = [v.co.y for v in obj.data.vertices]
        print(
            f"[band] {obj.name}: x {min(xs) * 1000:.2f}..{max(xs) * 1000:.2f} mm, "
            f"z {min(zs) * 1000:.2f}..{max(zs) * 1000:.2f} mm, "
            f"depth {min(ys) * 1000:.2f}..{max(ys) * 1000:.2f} mm"
        )

    probe_face.frame("front", height, zoom=4.0, focus="eye")
    C.render(
        "face-female-front_lidcol",
        os.path.join(HERE, "out", "face"),
        width=620,
        height=620,
        samples=16,
        film=False,
    )


if __name__ == "__main__":
    main()
