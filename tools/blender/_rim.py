"""Debug: where does the skin actually stop around an eye?

The socket is a hole in the head shell, and a ray fired from the front at the
aperture passes straight through into the cavity and hits whatever is at the back
of the skull. So "cast a ray and look for a hit" cannot find the lid line -- but
the *normal* of the first hit can: skin around the socket faces forward, the
socket's own inner wall faces inward or backward. This walks a ray outwards from
the eye centre at each angle and reports the radius where the surface turns from
cavity to skin.

    blender -b -P tools/blender/_rim.py
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_body
import lib_common as C
import lib_person


def main():
    C.reset(samples=8)
    lib_person.person(
        "face",
        kind="female",
        base=(0, 0, 0),
        skin_tone=(0.78, 0.58, 0.49),
        hair_style="short",
    )
    body = bpy.data.objects["face_body"]
    bpy.context.view_layer.update()
    to_local = body.matrix_world.inverted()
    eyes = [obj for obj in bpy.data.objects if ".eye." in obj.name]
    info = lib_body.eye_centres(eyes)

    bm = bmesh.new()
    bm.from_mesh(body.data)
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    print(f"[mesh] {len(bm.verts)} verts, {len(bm.faces)} faces, {len(boundary)} boundary edges")
    bm.free()

    for eye, centre, radius in info[:1]:
        spot = to_local @ centre
        print(f"[eye] {eye.name} centre ({spot.x * 1000:.2f}, {spot.y * 1000:.2f}, {spot.z * 1000:.2f}) mm, radius {radius * 1000:.2f} mm")
        hits = 0
        print(" angle |    r    |  hit y  |  ny   | depth range")
        for step in range(36):
            angle = 2.0 * math.pi * step / 36.0
            cos, sin = math.cos(angle), math.sin(angle)
            edge_r, edge_y, edge_ny, deep, near = None, None, None, -1e9, 1e9
            r = 0.0005
            while r < 0.020:
                origin = Vector((spot.x + r * cos, spot.y - 0.05, spot.z + r * sin))
                found, loc, normal, _index = body.ray_cast(origin, Vector((0.0, 1.0, 0.0)))
                if found:
                    hits += 1
                    dy = loc.y - spot.y
                    deep = max(deep, dy)
                    near = min(near, dy)
                    # skin faces the camera: normal points down -y (out of the face)
                    if normal.y < -0.25 and edge_r is None and dy > -0.020 and dy < 0.004:
                        edge_r, edge_y, edge_ny = r, dy, normal.y
                r += 0.0005
            print(
                f"{math.degrees(angle):6.1f} | "
                + (f"{edge_r * 1000:6.2f} | {edge_y * 1000:7.2f} | {edge_ny:5.2f}" if edge_r is not None else "  none |         |      ")
                + f" | {near * 1000:6.1f} .. {deep * 1000:6.1f}"
            )
        print(f"[rays] {hits} hits")


if __name__ == "__main__":
    main()
