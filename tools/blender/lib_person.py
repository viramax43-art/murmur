"""A person: real base mesh + clothing + hair + face details, on one root empty.

This is the only thing scenes should call. Everything else is plumbing.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import lib_body
import lib_common as C

# strand length (m), strand count, cap fall (m) — the cap is what sets the shape
STYLES = {
    "buzz": (0.014, 2600, 0.004),
    "short": (0.035, 4200, 0.012),
    "bob": (0.055, 4600, 0.055),
    "long": (0.075, 5000, 0.16),
}


# how far the eyeball is shrunk about its own centre and sunk into the socket
SEAT = (0.94, 0.0018)


def _seat_eye(eye, centre, scale=SEAT[0], back=SEAT[1]):
    """Shrink an eyeball about its own centre and sink it into the socket.

    The bundle's eyes are spheres sized to the socket opening, so they sit proud
    of the lid margin and read as googly. Pulling them back a millimetre lets the
    lids do the shaping, which is what makes an eye look set rather than stuck on.
    """
    world = eye.matrix_world.copy()
    sink = Matrix.Translation(Vector((0.0, back, 0.0)))
    about = Matrix.Translation(centre) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-centre)
    eye.matrix_world = sink @ about @ world


def person(
    name,
    kind="female",
    base=(0, 0, 0),
    lean=0.0,
    turn=0.0,
    scale=1.0,
    skin_tone=(0.74, 0.55, 0.47),
    shirt=(0.26, 0.2, 0.26),
    trousers=(0.13, 0.14, 0.18),
    hair_color=(0.08, 0.055, 0.04),
    iris=(0.14, 0.09, 0.055),
    hair_style="short",
    hair_thickness=0.006,
    shoes=(0.035, 0.035, 0.04),
):
    """`lean` tips the body forward about the feet (+ leans over the crib),
    `turn` rotates it about the vertical axis (+ turns to the figure's left).

    Clothing is real geometry: a shirt shell over torso and arms, a trouser
    shell over the legs, both relaxed, folded and given thickness, on top of the
    painted regions that keep the skin from peeking through a hem.
    """
    body, eyes, height, _low = lib_body.load_body(kind, name=f"{name}_body")

    skin_mat = C.skin(f"{name}_skin", skin_tone)
    shirt_mat = C.cloth(f"{name}_shirt", shirt)
    trouser_mat = C.cloth(f"{name}_trousers", trousers)
    shoe_mat = C.material(f"{name}_shoes", base=shoes, roughness=0.38, coat=0.2)

    index = lib_body.dress(body, skin_mat, shirt_mat, trouser_mat, shoe_mat, height=height)
    garments = [
        lib_body.garment(
            body,
            shirt_mat,
            height,
            index["shirt"],
            thickness=0.026,
            solidify=0.006,
            smooth=16,
            wrinkles=0.005,
        ),
        lib_body.garment(
            body,
            trouser_mat,
            height,
            index["trousers"],
            thickness=0.018,
            solidify=0.006,
            smooth=10,
            wrinkles=0.004,
        ),
    ]

    eye_info = lib_body.eye_centres(eyes)
    # `Object` texture space is the eyeball's own space, so the shader needs the
    # radius the bounds give divided back out by the object scale
    eye_scale = eye_info[0][0].matrix_world.to_scale().x if eye_info else 1.0
    body_scale = body.matrix_world.to_scale().x
    eye_radius = eye_info[0][2] / max(eye_scale, 1e-6) if eye_info else 0.014
    eye_mat = C.eye_material(f"{name}_eye", iris=iris, radius=eye_radius)
    # the eye centres are in world space; the shaders work in the body's own space
    to_local = body.matrix_world.inverted()
    sockets = [
        (to_local @ centre, radius / body_scale) for _eye, centre, radius in eye_info
    ]
    for eye, centre, _radius in eye_info:
        eye.data.materials.clear()
        eye.data.materials.append(eye_mat)
        # eyeballs that fill the socket bulge past the lid like a snail's; sink
        # them a little and the lid margin does the shaping
        _seat_eye(eye, centre, *SEAT)

    # the head has no lid margin at all: its socket is a hole in a zero-thickness
    # shell with the ball 1.5 mm behind the lid line, so the eye needs one built
    # against the ball *as seated* -- and since that band is its own mesh, its
    # `Object` coordinates have to be put into the body's space or the paint masks
    # keyed to socket radii land on the wrong part of it
    seated = [
        (to_local @ (centre + Vector((0.0, SEAT[1], 0.0))), radius * SEAT[0])
        for _eye, centre, radius in eye_info
    ]
    # same value face_paint uses for the painted lashes, so the modelled line and
    # any paint that falls on it are one colour
    lash_mat = C.material(f"{name}_lashline", base=(0.025, 0.018, 0.016), roughness=0.55)
    lids = [
        C.lid_margin(
            f"{name}_lid{index}",
            centre,
            radius,
            # handed the head so the band ends on the socket's real edge: the
            # almond runs wider at the canthi than any ellipse guess, and the
            # gap showed as slivers of lit cavity
            head=body,
            scale=1.0 / body_scale,
            mat=skin_mat,
            ink=lash_mat,
        )
        for index, (centre, radius) in enumerate(seated)
    ]
    for lid in lids:
        lid.matrix_world = body.matrix_world.copy()

    C.face_paint(
        skin_mat,
        height,
        sockets[0][0].z if sockets else 0.935 * height,
        sockets,
        brow=hair_color,
    )

    hair_mat = C.hair_material(f"{name}_hair", hair_color)
    strand_length, strand_count, fall = STYLES.get(hair_style, STYLES["short"])
    hair_parts = lib_body.hair(
        body,
        hair_mat,
        height=height,
        thickness=hair_thickness,
        length=strand_length,
        count=strand_count,
        fall=fall,
    )

    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    bpy.context.view_layer.update()
    # the eyes and the body still carry the asset bundle's own transforms: keep
    # world placement while moving them onto our root (re-parenting alone drops
    # the parent's matrix and throws the eyes a metre off the head)
    for obj in (body, *hair_parts, *garments, *lids, *[eye for eye, _c, _r in eye_info]):
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_parent_inverse.identity()
        obj.matrix_world = world
    root.location = base
    root.rotation_mode = "XYZ"
    root.rotation_euler = (math.radians(lean), 0, math.radians(turn))
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    return root
