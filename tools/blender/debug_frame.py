"""Debug: what is in front of the camera in a scene?

Prints where the eyes and body parts actually land, and what the camera hits,
using an updated depsgraph.

    blender -b -P tools/blender/debug_frame.py -- --scene ch1-in
"""

import argparse
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import scenes


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", default="ch1-in")
    args = parser.parse_args(argv)

    scenes.SCENES[args.scene]()
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    camera = scene.camera
    origin = camera.matrix_world.translation
    rotation = camera.matrix_world.to_quaternion()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    print(f"camera at {tuple(round(v, 2) for v in origin)}")
    print(f"camera looks at {tuple(round(v, 2) for v in (rotation @ Vector((0, 0, -1))))}")

    for obj in scene.objects:
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        if not (obj.name.startswith("GEO-") or obj.name.startswith("mama") or obj.name.startswith("papa")):
            continue
        box = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        print(
            f"  {obj.name:30s} at {tuple(round(v, 2) for v in obj.matrix_world.translation)}"
            f" z {min(b.z for b in box):.2f}..{max(b.z for b in box):.2f}"
            f" parent={obj.parent.name if obj.parent else None}"
        )

    print("--- what the camera hits, 5x3 grid ---")
    for iy in (-0.8, 0.0, 0.8):
        row = []
        for ix in (-1.0, -0.5, 0.0, 0.5, 1.0):
            direction = (rotation @ Vector((ix * 0.45, iy * 0.26, -1.0))).normalized()
            hit, location, _normal, _index, obj, _matrix = scene.ray_cast(depsgraph, origin, direction)
            row.append(f"{(location - origin).length:5.2f} {obj.name}" if hit else "  --- sky ---")
        print(" | ".join(row))


if __name__ == "__main__":
    main()
