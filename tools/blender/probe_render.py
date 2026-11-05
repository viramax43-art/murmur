"""Debug: rebuild a scene, optionally strip features, then render it.

    blender -b -P tools/blender/probe_render.py -- --scene ch1-in --no-hair

Flags exist because a single misplaced modifier is invisible in a log but
obvious in a frame.
"""

import argparse
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_common as C
import scenes


def closeup(subject, lens=85.0, view="front"):
    """Point the camera at one head, so a 480 px frame is all scalp and eyelash.

    `view` orbits the subject: front / side / back / top, always from the head's
    own facing, so a close-up is comparable between renders.
    """
    from mathutils import Vector

    cap = bpy.data.objects.get(f"{subject}_body_hair")
    root = bpy.data.objects.get(subject)
    if cap is None or root is None:
        raise SystemExit(f"no {subject} / {subject}_body_hair in this scene")
    bpy.context.view_layer.update()
    corners = [cap.matrix_world @ Vector(corner) for corner in cap.bound_box]
    centre = sum(corners, Vector()) / len(corners)
    spin = root.matrix_world.to_quaternion()
    forward = (spin @ Vector((0, -1, 0))).normalized()  # the way the face looks
    right = (spin @ Vector((1, 0, 0))).normalized()
    offsets = {
        "front": forward * 0.60 + Vector((0, 0, -0.02)),
        "side": right * 0.60 + Vector((0, 0, -0.02)),
        "back": -forward * 0.60 + Vector((0, 0, -0.02)),
        "top": forward * 0.28 + Vector((0, 0, 0.55)),
    }
    offset = offsets.get(view, offsets["front"])
    camera = bpy.context.scene.camera
    camera.data.lens = lens
    camera.location = centre + offset
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = offset.length
    camera.data.dof.aperture_fstop = 2.8
    C.aim(camera, centre)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--scene", default="ch1-in")
    parser.add_argument("--res", default="480x270")
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--no-hair", action="store_true")
    parser.add_argument("--no-garment", action="store_true")
    parser.add_argument("--hair-count", type=int, default=0, help="override strand count (0 = leave as built)")
    parser.add_argument("--closeup", default="", help="frame this person's head (e.g. mama)")
    parser.add_argument("--view", default="front", choices=("front", "side", "back", "top"))
    parser.add_argument("--lens", type=float, default=85.0, help="close-up lens")
    parser.add_argument("--out", default=os.path.join(HERE, "out", "probe"))
    args = parser.parse_args(argv)

    scenes.SCENES[args.scene]()

    for obj in list(bpy.context.scene.objects):
        if args.no_hair and obj.modifiers and any(m.type == "PARTICLE_SYSTEM" for m in obj.modifiers):
            for modifier in [m for m in obj.modifiers if m.type == "PARTICLE_SYSTEM"]:
                obj.modifiers.remove(modifier)
            print(f"[probe] hair off: {obj.name}")
        if args.hair_count and obj.modifiers:
            for modifier in [m for m in obj.modifiers if m.type == "PARTICLE_SYSTEM"]:
                settings = modifier.particle_system.settings
                settings.count = args.hair_count
                print(
                    f"[probe] {obj.name} strands={settings.count} len={settings.hair_length}"
                    f" radius={settings.radius_scale} root={settings.root_radius} tip={settings.tip_radius}"
                    f" children={settings.rendered_child_count} clump={settings.clump_factor}"
                    f" rough1={settings.roughness_1} rough_end={settings.roughness_endpoint}"
                    f" normal={settings.normal_factor} rand={settings.factor_random}"
                )
        if args.no_garment and obj.modifiers and any(m.type == "SOLIDIFY" for m in obj.modifiers):
            bpy.data.objects.remove(obj, do_unlink=True)
            print(f"[probe] garment off: {obj.name}")

    width, height = (int(part) for part in args.res.lower().split("x"))
    if args.closeup:
        closeup(args.closeup, args.lens, args.view)
    C.render(f"{args.scene}-probe", args.out, width=width, height=height, samples=args.samples, film=False)


if __name__ == "__main__":
    main()
