"""Probe the bundle + this Blender's Cycles devices.

    blender -b -P tools/blender/probe.py

Prints the body object inventory, polygon counts, and whether OptiX lands, so a
scene can be lit and a render budget picked without guessing.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_body  # noqa: E402


def devices():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    found = []
    for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            names = [d.name for d in prefs.devices if d.type == backend]
            if names:
                found.append((backend, names))
        except (TypeError, AttributeError):
            continue
    return found


PART_COLLECTIONS = (
    "Head (Animation) - Realistic",
    "Head (Sculpting) - Realistic",
    "Hand  - Realistic",
    "Foot - Realistic",
    "Eye - Realistic",
)


def parts():
    for name in PART_COLLECTIONS:
        try:
            collection = lib_body._append_collection(name)
        except SystemExit as error:
            print("part missing:", name, error)
            continue
        for obj in collection.all_objects:
            if obj.type != "MESH":
                continue
            keys = obj.data.shape_keys
            print(
                f"part {name!r}: {obj.name} polys={len(obj.data.polygons)} verts={len(obj.data.vertices)}"
                f" keys={(len(keys.key_blocks) if keys else 0)}"
            )


def main():
    print("cyc devices:", devices())
    parts()
    body, eyes, height, low = lib_body.load_body("female", name="probe_body")
    print("body:", body.name, "polys:", len(body.data.polygons), "verts:", len(body.data.vertices))
    print("height:", round(height, 3), "floor:", round(low, 4))
    print("collection objects:", [o.name for o in body.users_collection[0].all_objects])
    print("eyes:", [(e.name, len(e.data.polygons)) for e in eyes])
    print("uv layers:", [uv.name for uv in body.data.uv_layers])
    print("shape keys:", body.data.shape_keys and [k.name for k in body.data.shape_keys.key_blocks] or None)
    print("particles ok:", hasattr(bpy.data, "particles"))


if __name__ == "__main__":
    main()
