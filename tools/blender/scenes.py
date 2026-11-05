"""Cutscene stages. One function per shot, all built from primitives.

Shots are named after the chapter they belong to:
  ch1-in   above the crib — two faces, warm lamp, the bars in the way
  ch5-out  evening street — moon, lamp, a house, a goodbye
Each returns nothing; build.py renders whatever the camera sees.
"""

import math

import bpy

import lib_common as C
from lib_person import person
from lib_set import bed, bottle, glow_wall, room


def ch1_in():
    """Baby's POV: looking up through the crib bars at two leaning faces."""
    C.reset(samples=64)
    C.world(color=(0.02, 0.025, 0.04), strength=0.12)
    room(width=5.2, depth=6.0, height=2.6, back=(0.11, 0.1, 0.12), side=(0.075, 0.075, 0.09), floor=(0.07, 0.06, 0.06), back_y=2.9)
    bed(0.0, 0.0)

    person(
        "mama",
        kind="female",
        base=(-0.34, 0.75, 0.0),
        lean=26,
        turn=-12,
        skin_tone=(0.76, 0.57, 0.48),
        shirt=(0.3, 0.2, 0.24),
        trousers=(0.15, 0.15, 0.19),
        hair_color=(0.09, 0.055, 0.04),
    )
    person(
        "papa",
        kind="male",
        base=(0.36, 0.92, 0.0),
        lean=20,
        turn=14,
        skin_tone=(0.66, 0.48, 0.4),
        shirt=(0.14, 0.18, 0.24),
        trousers=(0.12, 0.12, 0.14),
        hair_color=(0.06, 0.045, 0.035),
    )

    bottle(0.32, -0.3, 0.66)

    # one warm key from screen right: half the face falls into shadow
    C.area("key", (0.7, 0.1, 1.75), energy=70.0, size=0.6, color=(1.0, 0.74, 0.54))
    C.aim(bpy.data.objects["key"], (-0.42, 0.2, 1.45))
    # cold rim from behind left, separates hair and shoulders from the wall
    C.area("rim", (-1.3, 1.8, 1.8), energy=60.0, size=0.5, color=(0.5, 0.63, 1.0))
    C.aim(bpy.data.objects["rim"], (0.0, 0.5, 1.5))
    # a night light behind, only so the wall is not a black hole
    C.point("night_light", (1.25, 1.5, 1.05), energy=14.0, radius=0.05, color=(1.0, 0.66, 0.4))
    # floor-level bounce, barely there
    C.area("bounce", (0.1, -0.2, 0.55), energy=7.0, size=0.9, color=(1.0, 0.9, 0.82))
    C.aim(bpy.data.objects["bounce"], (-0.3, 0.5, 1.25))

    C.camera(loc=(0.05, -1.3, 0.8), target=(-0.15, 0.4, 1.28), lens=24.0, fstop=1.6, focus=1.55)


def ch5_out():
    """Dusk: the moon, a lit window, and a child who can now say goodbye."""
    C.reset(samples=96)
    C.world(color=(0.03, 0.05, 0.1), strength=0.7)

    road = C.cloth("road", (0.09, 0.09, 0.11), roughness=0.55)
    C.plane("street", loc=(0, 6.0, 0), size=1, scale=(24.0, 16.0, 1), mat=road, rotation=(0, 0, 0))

    # houses along the far side of the street
    facade = C.cloth("facade", (0.16, 0.14, 0.16), roughness=0.9)
    frame = C.material("window_frame", base=(0.05, 0.05, 0.06), roughness=0.7)
    for index, x in enumerate((-6.5, -2.0, 2.6, 7.0)):
        C.cube(f"house_{index}", loc=(x, 9.4, 2.2), size=1.0, scale=(2.4, 1.2, 2.2), mat=facade, bevel=0.05)
        C.cube(f"roof_{index}", loc=(x, 9.4, 4.45), size=1.0, scale=(2.5, 1.3, 0.12), mat=C.cloth(f"roof_mat_{index}", (0.09, 0.09, 0.11)))
        for row in (1.4, 2.7):
            for col in (-0.6, 0.6):
                C.plane(f"window_recess_{index}_{row}_{col}", loc=(x + col, 8.18, row), size=0.54, mat=frame)
                C.plane(
                    f"window_{index}_{row}_{col}",
                    loc=(x + col, 8.16, row),
                    size=0.44,
                    mat=C.material(
                        f"window_glow_{index}{row}{col}",
                        base=(1.0, 0.78, 0.45),
                        roughness=1.0,
                        emission=(1.0, 0.72, 0.4),
                        emission_strength=3.2,
                    ),
                )

    # kerb, so the ground reads as a street and not as a wall
    C.cube("kerb", loc=(0, 6.4, 0.05), size=1.0, scale=(14.0, 0.14, 0.05), mat=C.cloth("kerb_mat", (0.22, 0.21, 0.2)))
    C.plane("sidewalk", loc=(0, 7.6, 0.02), size=1, scale=(16.0, 3.0, 1), mat=C.cloth("pavement", (0.18, 0.17, 0.17), roughness=0.95), rotation=(0, 0, 0))

    # street lamp, in frame this time
    C.rod("lamp_post", (3.1, 4.2, 0), (3.1, 4.2, 3.4), 0.045, C.material("iron", base=(0.06, 0.06, 0.07), roughness=0.5, metallic=0.7))
    C.rod("lamp_arm", (3.1, 4.2, 3.4), (2.75, 4.2, 3.5), 0.03, C.material("iron2", base=(0.06, 0.06, 0.07), roughness=0.5, metallic=0.7))
    C.lamp("street_lamp", (2.72, 4.2, 3.44), (0, 0, 0), energy=140.0, radius=0.11, color=(1.0, 0.72, 0.42))

    # moon and the first star
    C.sphere("moon", loc=(3.4, 17.0, 6.6), radius=0.7, mat=C.material("moon_mat", base=(1, 0.97, 0.9), roughness=1.0, emission=(1, 0.96, 0.88), emission_strength=6.0), segments=32)
    for index, (x, z, r) in enumerate(((1.9, 7.6, 0.04), (4.6, 8.2, 0.028), (6.2, 6.9, 0.032))):
        C.sphere(f"star_{index}", loc=(x, 16.0, z), radius=r, mat=C.material(f"star_mat_{index}", base=(1, 1, 1), roughness=1.0, emission=(0.9, 0.95, 1.0), emission_strength=12.0), segments=12)

    # tree silhouette on the left
    C.capsule("trunk", loc=(-5.2, 5.2, 1.5), radius=0.13, depth=3.0, mat=C.cloth("bark", (0.07, 0.06, 0.05), roughness=1.0))
    for index, (x, y, z, r) in enumerate(((-5.2, 5.2, 3.3, 1.15), (-4.4, 5.0, 2.9, 0.8), (-5.9, 5.4, 2.8, 0.75))):
        C.sphere(f"canopy_{index}", loc=(x, y, z), radius=r, scale=(1.0, 1.0, 0.8), mat=C.cloth(f"leaf_{index}", (0.06, 0.09, 0.07), roughness=1.0))

    mama = person(
        "mama",
        kind="female",
        base=(-0.85, 3.0, 0.02),
        turn=32,
        skin_tone=(0.76, 0.57, 0.48),
        shirt=(0.32, 0.21, 0.24),
        trousers=(0.14, 0.14, 0.18),
        hair_color=(0.09, 0.055, 0.04),
    )
    person(
        "child",
        kind="female",
        base=(0.12, 2.82, 0.02),
        turn=-34,
        scale=0.63,
        skin_tone=(0.8, 0.62, 0.53),
        shirt=(0.2, 0.26, 0.34),
        trousers=(0.16, 0.18, 0.24),
        hair_color=(0.12, 0.08, 0.05),
        hair_thickness=0.007,
    )

    C.area("sky_fill", (-7.0, 9.0, 6.0), energy=90.0, size=6.0, color=(0.45, 0.55, 0.95))
    C.aim(bpy.data.objects["sky_fill"], (0, 3.0, 1.0))
    C.area("rim", (2.4, 3.4, 2.6), energy=90.0, size=1.0, color=(1.0, 0.72, 0.44))
    C.aim(bpy.data.objects["rim"], (0, 2.9, 1.2))

    C.camera(loc=(0.95, -2.3, 1.55), target=(-0.35, 3.0, 1.05), lens=35.0, fstop=2.2, focus=5.6)


SCENES = {
    "ch1-in": ch1_in,
    "ch5-out": ch5_out,
}
