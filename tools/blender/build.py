"""Render a cutscene to assets/cutscenes/<id>.png.

    blender -b -P tools/blender/build.py -- --scene ch1-in --res 800x450 --samples 24

Scenes live in scenes.py; everything is rebuilt from an empty file each time, so
there is no .blend to keep in sync.
"""

import argparse
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_common as C  # noqa: E402  (sys.path has to come first)
import scenes  # noqa: E402


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="build.py")
    parser.add_argument("--scene", default="all", help="scene id, or 'all'")
    parser.add_argument("--res", default="1600x900", help="WIDTHxHEIGHT")
    parser.add_argument("--samples", type=int, default=0, help="override the scene sample count")
    parser.add_argument("--raw", action="store_true", help="skip the film grade (for debugging)")
    parser.add_argument("--out", default=os.path.join(ROOT, "assets", "cutscenes"))
    return parser.parse_args(argv)


def main():
    args = parse()
    width, height = (int(part) for part in args.res.lower().split("x"))
    ids = list(scenes.SCENES) if args.scene == "all" else [args.scene]

    for scene_id in ids:
        build = scenes.SCENES.get(scene_id)
        if build is None:
            raise SystemExit(f"unknown scene: {scene_id} (have: {', '.join(scenes.SCENES)})")
        build()
        samples = args.samples or bpy.context.scene.cycles.samples
        C.render(scene_id, args.out, width=width, height=height, samples=samples, film=not args.raw)


if __name__ == "__main__":
    main()
