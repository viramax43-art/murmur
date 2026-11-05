"""Debug: one head, neutral studio light, nothing else in frame.

The cutscene lighting is low-key and warm, which flatters a shot but hides the
geometry. This renders the same head under flat three-point light so a shape
error is a shape error and not a lighting choice.

    blender -b -P tools/blender/probe_face.py -- --kind female --view front
    blender -b -P tools/blender/probe_face.py -- --kind male --view side --hair
"""

import argparse
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_body
import lib_common as C
import lib_person


def studio():
    """Flat key/fill/rim, no grade: form only."""
    C.reset(samples=32)
    C.world(color=(0.6, 0.62, 0.66), strength=0.25)
    floor = C.plane("floor", loc=(0, 0, 0), size=1, scale=(6, 6, 1), mat=C.cloth("studio_floor", (0.32, 0.32, 0.33), roughness=0.9))
    floor.rotation_euler = (0, 0, 0)
    key = C.area("key", (-0.9, -1.1, 1.9), energy=55.0, size=1.6, color=(1.0, 0.98, 0.95))
    C.aim(key, (0, 0, 1.55))
    fill = C.area("fill", (1.2, -0.9, 1.5), energy=18.0, size=2.0, color=(0.9, 0.94, 1.0))
    C.aim(fill, (0, 0, 1.5))
    rim = C.area("rim", (0.6, 1.4, 2.1), energy=34.0, size=1.0, color=(1.0, 0.96, 0.9))
    C.aim(rim, (0, 0, 1.6))


FOCUS = {
    "head": (0.0, 0.945),  # the skull's centre: a wide frame with shoulders
    "face": (0.0, 0.912),  # brow line 1.553 m to chin 1.440 m, so neither is cropped
    "eyes": (0.0, 0.935),  # the eye line, for reading lids and the lash line
    "eye": (0.020, 0.935),  # one eye: they sit 33 mm off the midline, which a
    "lips": (0.0, 0.8885),  # tight frame centred on x = 0 cannot hold
}


def frame(view, height, lens=100.0, zoom=1.0, focus="head"):
    """Aim the camera at a landmark on the head, from the head's own front/side/back.

    `zoom` sets the frame's width across the subject: 1.0 frames 0.22 m, which
    holds the whole head, 1.7 frames the face (0.13 m), 2.2 both eyes, 4.9 one.
    A width rather than a distance because the answer to "is this cropped" is a
    width, and because each view has a different near surface: the face is
    0.125 m in front of the aim point and a profile only 0.09 m, so one camera
    distance frames a profile 40 mm tighter than a face.
    """
    spot = FOCUS.get(focus, FOCUS["head"])
    across = 0.22 / max(zoom, 0.01)
    # how far forward of the aim point the subject's near surface sits, per view
    near = {"side": 0.09, "back": 0.09, "three_quarter": 0.10, "low": 0.125}
    distance = near.get(view, 0.125) + lens * across / 36.0  # 36 mm is the sensor
    places = {
        "front": Vector((0.0, -1.0, 0.0)),
        "three_quarter": Vector((-0.7, -0.72, 0.0)),
        "side": Vector((-1.0, 0.0, 0.0)),
        "back": Vector((0.0, 1.0, 0.0)),
        "low": Vector((0.0, -1.0, -0.35)),
    }
    direction = places.get(view, places["front"]).normalized()
    target = Vector((height * spot[0], -0.03, height * spot[1]))
    # no depth of field: a probe is for reading form, and at these distances a
    # 100 mm lens keeps a couple of millimetres sharp and blurs the rest of the face
    camera = C.camera(loc=target + direction * distance, target=target, lens=lens, fstop=None)
    camera.data.clip_start = min(0.1, distance * 0.05)  # close framing clips an eye at the default 0.1
    return camera


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", default="female", choices=("female", "male"))
    parser.add_argument("--view", default="front", choices=("front", "three_quarter", "side", "back", "low"))
    parser.add_argument("--res", type=int, default=520)
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--skin-only", action="store_true", help="no hair, no brows, no lips")
    parser.add_argument("--no-hair", action="store_true")
    parser.add_argument("--no-eyes", action="store_true", help="see the socket and lid geometry on its own")
    parser.add_argument("--style", default="short", choices=tuple(lib_person.STYLES))
    parser.add_argument("--zoom", type=float, default=1.0, help="frame width: 1 whole head, 1.7 face, 2.2 both eyes")
    parser.add_argument("--focus", default="head", choices=tuple(FOCUS), help="which landmark to centre on")
    parser.add_argument("--tag", default="", help="suffix for the output filename")
    parser.add_argument("--out", default=os.path.join(HERE, "out", "face"))
    args = parser.parse_args(argv)

    studio()
    lib_person.person(
        "face",
        kind=args.kind,
        base=(0, 0, 0),
        skin_tone=(0.78, 0.58, 0.49),
        hair_style=args.style,
    )
    body = bpy.data.objects["face_body"]
    bpy.context.view_layer.update()
    corners = [body.matrix_world @ Vector(corner) for corner in body.bound_box]
    height = max(c.z for c in corners)

    if args.skin_only:
        body.data.materials.clear()
        body.data.materials.append(C.skin("probe_skin", (0.78, 0.55, 0.46)))
        for poly in body.data.polygons:
            poly.material_index = 0
    if args.no_hair or args.skin_only:
        # the cap is a mesh, the strands are a curves object: both are hair
        for obj in list(bpy.context.scene.objects):
            if obj.type in ("MESH", "CURVES") and (obj.name.endswith("_hair") or obj.name.endswith("_strands")):
                bpy.data.objects.remove(obj, do_unlink=True)
    if args.no_eyes:
        for obj in list(bpy.context.scene.objects):
            if ".eye." in obj.name:
                bpy.data.objects.remove(obj, do_unlink=True)

    frame(args.view, height, zoom=args.zoom, focus=args.focus)
    C.render(
        f"face-{args.kind}-{args.view}{args.tag}",
        args.out,
        width=args.res,
        height=args.res,
        samples=args.samples,
        film=False,
    )


if __name__ == "__main__":
    main()
