# Torso/limb helpers shared by the cutscene stages.

import math

import bpy

from lib_common import capsule, cloth, material, plane, sphere


def room(
    width=6.0,
    depth=6.0,
    height=2.6,
    back=(0.10, 0.10, 0.13),
    side=(0.08, 0.08, 0.11),
    floor=(0.07, 0.06, 0.06),
    back_y=2.6,
):
    """Three planes: a wall behind the action, a side wall, a floor."""
    wall = cloth("wall_back", back, roughness=1.0)
    wall_side = cloth("wall_side", side, roughness=1.0)
    floor_mat = cloth("floor", floor, roughness=0.8)

    plane("wall_back", loc=(0, back_y, height / 2), size=1, scale=(width, height, 1), mat=wall)
    plane("wall_left", loc=(-width / 2, back_y - depth / 2, height / 2), size=1, scale=(depth, height, 1), mat=wall_side, rotation=(math.radians(90), 0, math.radians(90)))
    plane("wall_right", loc=(width / 2, back_y - depth / 2, height / 2), size=1, scale=(depth, height, 1), mat=wall_side, rotation=(math.radians(90), 0, math.radians(-90)))
    plane("floor", loc=(0, back_y - depth / 2, 0), size=1, scale=(width, depth, 1), mat=floor_mat, rotation=(0, 0, 0))
    plane("ceiling", loc=(0, back_y - depth / 2, height), size=1, scale=(width, depth, 1), mat=wall_side, rotation=(math.radians(180), 0, 0))


def bed(x=0.0, y=0.0):
    """A crib: mattress, headboard and the bars the baby sees the world through."""
    wood = cloth("crib_wood", (0.3, 0.21, 0.14), roughness=0.6)
    sheet = cloth("crib_sheet", (0.3, 0.29, 0.28), roughness=1.0)
    bpy.ops.object.select_all(action="DESELECT")
    capsule("mattress", loc=(x, y + 0.15, 0.42), radius=0.42, depth=1.1, scale=(1.0, 1.25, 0.5), mat=sheet)
    for rail_z in (0.66, 0.8):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.011, depth=1.9, location=(x, y - 0.6, rail_z), rotation=(0, math.radians(90), 0))
        obj = bpy.context.object
        obj.name = f"crib_rail_{int(rail_z * 100)}"
        obj.data.materials.append(wood)
        for poly in obj.data.polygons:
            poly.use_smooth = True
    for index in range(-9, 10):
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.008, depth=0.44, location=(x + index * 0.1, y - 0.6, 0.62))
        obj = bpy.context.object
        obj.name = f"crib_bar_{index + 9}"
        obj.data.materials.append(wood)


def bottle(x, y, z, empty=False):
    glass = material("glass", base=(0.85, 0.88, 0.9), roughness=0.06, alpha=0.35)
    milk = material("milk_liquid", base=(0.93, 0.92, 0.88), roughness=0.35, subsurface=0.4)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.033, depth=0.15, location=(x, y, z))
    body = bpy.context.object
    body.name = "bottle"
    body.data.materials.append(glass)
    if not empty:
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.031, depth=0.10, location=(x, y, z - 0.02))
        liquid = bpy.context.object
        liquid.name = "bottle_milk"
        liquid.data.materials.append(milk)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=(x, y, z + 0.06))
    teat = bpy.context.object
    teat.name = "bottle_teat"
    teat.data.materials.append(material("teat", base=(0.75, 0.55, 0.5), roughness=0.7, subsurface=0.3))


def glow_wall(loc, size=0.6, color=(1.0, 0.62, 0.3), strength=6.0):
    """The soft rectangle a lamp throws on a wall."""
    mat = material("glow_patch", base=color, roughness=1.0, emission=color, emission_strength=strength, alpha=0.5)
    return sphere("glow_patch", loc=loc, radius=size, scale=(1.0, 0.05, 0.8), mat=mat, segments=24)
