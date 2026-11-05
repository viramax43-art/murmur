"""List what the human base-mesh bundle actually contains.

    blender -b -P tools/blender/inspect_bundle.py

Handy before writing a scene: tells us which collections (body / head / hands),
which meshes, and whether anything comes rigged.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE, "cache", "human_base_meshes_bundle.blend")


def main():
    with bpy.data.libraries.load(BUNDLE, link=False) as (source, target):
        print("collections:", *sorted(source.collections), sep="\n  ")
        print("objects:", *sorted(source.objects), sep="\n  ")
        print("armatures:", *sorted(source.armatures), sep="\n  ")
        print("actions:", *sorted(source.actions), sep="\n  ")
        target.objects = list(source.objects)


if __name__ == "__main__":
    main()
