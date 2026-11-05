"""Load a real human body from the official Blender base-mesh bundle.

The bundle is a sculpted asset library, not something to eyeball: we append the
collection, then dress it procedurally —

1. paint regions of the single skin mesh as clothing (shirt, trousers, shoes), by
   classifying face centres against body landmarks, so no skin shows at a hem,
2. build real cloth shells over the painted regions: pushed out, relaxed,
   displaced into folds and solidified, because a painted silhouette still reads
   as paint the moment the light rakes it,
3. grow strand hair from a scalp copy, so the head is not a rubber cap.

Download once with: tools/blender/fetch_assets.ps1
"""

import math
import os

import bpy
from mathutils import Matrix, Vector

import lib_common as C

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = os.path.join(HERE, "cache", "human_base_meshes_bundle.blend")

BODIES = {
    "female": "Body Female - Realistic",
    "male": "Body Male - Realistic",
}
HEADS = {
    "female": "Head (Animation) - Realistic",
    "male": "Head (Animation) - Realistic",
}


def _append_collection(name):
    if not os.path.exists(BUNDLE):
        raise SystemExit(f"missing asset bundle: {BUNDLE} (run tools/blender/fetch_assets.ps1)")
    with bpy.data.libraries.load(BUNDLE, link=False) as (source, target):
        if name not in source.collections:
            raise SystemExit(f"no collection {name!r} in {BUNDLE}")
        target.collections = [name]
    collection = target.collections[0]
    if collection.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(collection)
    return collection


def _main_mesh(collection):
    meshes = [obj for obj in collection.all_objects if obj.type == "MESH" and len(obj.data.polygons) > 500]
    if not meshes:
        raise SystemExit(f"no body mesh in {collection.name}")
    return max(meshes, key=lambda obj: len(obj.data.polygons))


def load_body(kind="female", name=None):
    """Append the realistic body. Returns (body mesh, eye objects, height, floor z)."""
    collection = _append_collection(BODIES[kind])
    body = _main_mesh(collection)
    body.name = name or f"body_{kind}"
    eyes = [obj for obj in collection.all_objects if obj.type == "MESH" and obj is not body]
    bpy.context.view_layer.update()

    # the asset lives off to the side of its own scene: put the feet at the origin
    corners = [body.matrix_world @ Vector(corner) for corner in body.bound_box]
    low = min(c.z for c in corners)
    centre = body.matrix_world.translation.copy()
    for obj in collection.all_objects:
        if obj.parent is None:
            obj.location = obj.location - centre + Vector((0, 0, -low))
    bpy.context.view_layer.update()

    corners = [body.matrix_world @ Vector(corner) for corner in body.bound_box]
    height = max(c.z for c in corners) - min(c.z for c in corners)
    return body, eyes, height, min(c.z for c in corners)


def _radial(co):
    return (co.x * co.x + co.y * co.y) ** 0.5


def dress(body, skin_mat, shirt_mat, trouser_mat, shoe_mat, height=1.64):
    """Paint clothing onto the naked base mesh by region.

    Landmarks are fractions of body height: collar 0.855, shoulders 0.82, waist
    0.60, hips 0.50, ankles 0.03. Arms and hands sit outboard of the torso at
    |x| > 0.115 h, which is how a sleeve stops near the elbow and the hands stay
    skin instead of being painted into a trouser leg.

    Returns the material index of each region, so a cloth shell can be built
    from exactly the painted faces.
    """
    for mat in (skin_mat, shirt_mat, trouser_mat, shoe_mat):
        body.data.materials.append(mat)
    indexes = {"skin": 0, "shirt": 1, "trousers": 2, "shoes": 3}

    for poly in body.data.polygons:
        co = poly.center
        z = co.z / height
        outboard = abs(co.x) > 0.115 * height  # arms and hands, not torso or leg
        neck = z > 0.795 and abs(co.x) < 0.036 * height  # the column under the jaw

        if z > 0.855 or neck:
            index = indexes["skin"]  # face, ears and the whole neck: no collar over the jaw
        elif z > 0.625:
            index = indexes["shirt"]  # torso, shoulders, short sleeves
        elif z > 0.545 and not outboard:
            index = indexes["shirt"]  # hem hanging over the waistband
        elif z > 0.030:
            index = indexes["trousers"] if not outboard else indexes["skin"]
        else:
            index = indexes["shoes"] if not outboard else indexes["skin"]

        poly.material_index = index
    return indexes


def _set(target, name, value):
    """Blender renames particle attributes between releases; never hard-fail on that."""
    if hasattr(target, name):
        try:
            setattr(target, name, value)
        except (TypeError, ValueError, AttributeError):
            pass


def hair(
    body,
    hair_mat,
    height=1.64,
    thickness=0.004,
    length=0.05,
    count=6000,
    fall=0.02,
    eye_z=None,
    seed=7,
):
    """A hair shell fitted to the skull, plus real strand hair grown on it.

    The shell closes the scalp, so no skin shows between strands; the strands are
    a hair-curves object built here rather than a legacy particle system, because
    particles emit every strand straight along the surface normal (a hedgehog)
    while hair leaves the scalp tangent and then falls.
    """
    import bmesh
    from mathutils import noise

    mesh = body.data.copy()
    mesh.name = f"{body.name}_hair"
    cap = bpy.data.objects.new(f"{body.name}_hair", mesh)
    for collection in body.users_collection:
        collection.objects.link(cap)
    cap.parent = body
    cap.matrix_world = body.matrix_world.copy()
    cap.matrix_parent_inverse = body.matrix_world.inverted()

    landmarks = _head_landmarks(body, height, eye_z)

    chin = landmarks["eye"] - 0.30 * landmarks["rz"]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    drop = [face for face in bm.faces if not _on_scalp(face.calc_center_median(), landmarks)]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bmesh.ops.delete(bm, geom=[vert for vert in bm.verts if not vert.link_faces], context="VERTS")
    bm.normal_update()  # without this the outward push is zero and the shell vanishes
    for vertex in bm.verts:
        wobble = 0.55 + 0.9 * noise.noise(vertex.co * 55.0)
        vertex.co += vertex.normal * (thickness * wobble)
        # hair falls: pull the nape down a little, more toward the back
        if vertex.co.z < chin + 0.06:
            behind = max(0.0, vertex.co.y - landmarks["y0"]) * 32.0
            vertex.co.z -= min(fall, 0.05) * 0.3 * wobble * (0.4 + min(1.0, behind))
            vertex.co.y += min(fall, 0.05) * 0.1 * wobble

    bm.to_mesh(mesh)
    bm.free()

    mesh.materials.clear()
    mesh.materials.append(hair_mat)
    for poly in mesh.polygons:
        poly.use_smooth = True

    solidify = cap.modifiers.new("thickness", "SOLIDIFY")
    solidify.thickness = 0.004
    solidify.offset = -1.0
    relax = cap.modifiers.new("relax", "SMOOTH")
    relax.factor = 0.5
    relax.iterations = 10

    bpy.context.view_layer.update()
    strands = _strand_hair(body, cap, hair_mat, landmarks, length=length, count=count, fall=fall, seed=seed)
    return [cap, strands]


def garment(
    body,
    mat,
    height,
    material_index,
    z_from=0.0,
    z_to=1.05,
    max_x=1.0,
    min_x=-1.0,
    thickness=0.02,
    solidify=0.005,
    smooth=14,
    wrinkles=0.004,
):
    """A cloth shell: copy the covered part of the body, push it out along its
    normals, relax it so it does not follow every rib, then add folds with a
    displace modifier and close it with solidify. Cheaper than modelling a shirt
    and it keeps the fabric on the silhouette, which is what the eye checks.

    The covered part is the painted region (`material_index`), so a hem or a
    sleeve ends precisely where the paint ends — a z band alone leaks over the
    face as soon as it reaches the collar.
    """
    import bmesh
    from mathutils import noise

    mesh = body.data.copy()
    mesh.name = f"{body.name}_{mat.name}"
    shell = bpy.data.objects.new(mesh.name, mesh)
    for collection in body.users_collection:
        collection.objects.link(shell)
    shell.parent = body
    shell.matrix_world = body.matrix_world.copy()
    shell.matrix_parent_inverse = body.matrix_world.inverted()

    keep_limit = max_x * height
    drop_limit = min_x * height

    def keep(face):
        if face.material_index != material_index:
            return False
        centre = face.calc_center_median()
        return (
            z_from * height <= centre.z <= z_to * height
            and abs(centre.x) <= keep_limit
            and abs(centre.x) >= drop_limit
        )

    bm = bmesh.new()
    bm.from_mesh(mesh)
    drop = [face for face in bm.faces if not keep(face)]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bmesh.ops.delete(bm, geom=[vert for vert in bm.verts if not vert.link_faces], context="VERTS")
    bm.normal_update()
    for vertex in bm.verts:
        fold = 0.6 + 0.8 * noise.noise(vertex.co * 38.0)
        vertex.co += vertex.normal * (thickness * fold)

    # hold the hem, the collar and the cuffs still: relaxing an open shell drags
    # its border inward and up, which is how a shirt ends up over the jaw
    bm.verts.index_update()
    pinned = [vertex.index for vertex in bm.verts if any(edge.is_boundary for edge in vertex.link_edges)]

    bm.to_mesh(mesh)
    bm.free()

    mesh.materials.clear()
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True

    if pinned:
        group = shell.vertex_groups.new(name="pinned")
        group.add(pinned, 0.0, "REPLACE")

    if smooth:
        # cloth does not follow every rib and nipple: flatten the copy first
        relax = shell.modifiers.new("relax", "SMOOTH")
        relax.factor = 0.6
        relax.iterations = smooth
        if pinned:
            relax.vertex_group = "pinned"

    if wrinkles:
        # folds and pull lines — without them a garment is a shrink-wrap
        texture = bpy.data.textures.new(f"{mat.name}_folds", type="CLOUDS")
        texture.noise_scale = 0.16
        texture.noise_depth = 3
        displace = shell.modifiers.new("wrinkles", "DISPLACE")
        displace.texture = texture
        displace.texture_coords = "GLOBAL"
        displace.strength = wrinkles
        displace.mid_level = 0.62
        if pinned:
            displace.vertex_group = "pinned"

    modifier = shell.modifiers.new("cloth", "SOLIDIFY")
    modifier.thickness = solidify
    modifier.offset = -1.0
    modifier.use_rim = True
    return shell


def _head_landmarks(body, height, eye_z=None):
    """A scalp frame measured off the mesh instead of guessed from `height`.

    One unit here is the eye line to the crown, which is the same for a 1.5 m
    child and a 1.9 m man, so the hairline mask needs no per-body fudge factors.
    """
    verts = body.data.vertices
    top = max(v.co.z for v in verts)
    z0 = eye_z if eye_z else 0.935 * height
    above = [v.co for v in verts if v.co.z > z0]
    if not above:
        above = [v.co for v in verts if v.co.z > 0.9 * top]
    y_front = min(v.y for v in above)
    y_back = max(v.y for v in above)
    return {
        "eye": z0,
        "top": top,
        "rz": max(0.02, top - z0),
        "xr": max(0.02, max(abs(v.x) for v in above)),
        "y0": (y_front + y_back) / 2,
        "yr": max(0.02, (y_back - y_front) / 2),
    }


def _on_scalp(co, landmarks):
    """The hairline: high across the brow, low behind the ear, lower at the nape.

    Done in head units rather than metres, and as three lobes (crown, back,
    temples) rather than one waterline — a single z cut gives a bowl cut, and a
    cut plus a y test gives a skullcap that starts too far back on the forehead.
    """
    nz = (co.z - landmarks["eye"]) / landmarks["rz"]
    ny = (co.y - landmarks["y0"]) / landmarks["yr"]
    nx = co.x / landmarks["xr"]
    if nz > 0.50:
        return True
    if ny > 0.12 and nz > -0.45:
        return True
    return abs(nx) > 0.58 and ny > -0.34 and nz > -0.12


def _sample_surface(mesh, count, rng):
    """Area-weighted random points with interpolated normals."""
    mesh.calc_loop_triangles()
    triangles = mesh.loop_triangles
    cumulative = []
    total = 0.0
    for triangle in triangles:
        total += triangle.area
        cumulative.append(total)
    verts = mesh.vertices
    found = []
    for _ in range(count):
        pick = rng.uniform(0.0, total)
        low, high = 0, len(cumulative) - 1
        while low < high:
            middle = (low + high) // 2
            if cumulative[middle] < pick:
                low = middle + 1
            else:
                high = middle
        a, b, c = (verts[index] for index in triangles[low].vertices)
        u, v = rng.random(), rng.random()
        if u + v > 1.0:
            u, v = 1.0 - u, 1.0 - v
        w = 1.0 - u - v
        point = a.co * w + b.co * u + c.co * v
        normal = a.normal * w + b.normal * u + c.normal * v
        found.append((point, normal.normalized() if normal.length > 1e-9 else Vector((0, 0, 1))))
    return found


def _strand_hair(body, cap, hair_mat, landmarks, length=0.05, count=6000, fall=0.02, seed=7):
    """Grow strands from the scalp shell into a hair-curves object.

    Each strand leaves the scalp half tangent, bends downhill with low-frequency
    noise so neighbours flow together, and sags under its own weight. Long at the
    sides and the back, short along the hairline: the same field makes a bob and
    a buzz cut.
    """
    import random

    from mathutils import noise

    rng = random.Random(seed)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    shell = bpy.data.meshes.new_from_object(cap.evaluated_get(depsgraph))
    roots = _sample_surface(shell, count, rng)
    shell_verts = len(shell.vertices)
    bpy.data.meshes.remove(shell)
    if not roots:
        raise SystemExit(f"no scalp faces on {cap.name}: the hairline mask ate the cap")
    if shell_verts < 64:
        print(f"[hair] warning: {cap.name} scalp is only {shell_verts} verts")

    down = Vector((0.0, 0.0, -1.0))
    back = Vector((0.0, 1.0, 0.0))
    points = []
    radii = []
    sizes = []
    for origin, normal in roots:
        sideness = min(1.0, abs(origin.x) / landmarks["xr"])
        backness = min(1.0, max(0.0, (origin.y - (landmarks["y0"] - landmarks["yr"])) / (2 * landmarks["yr"])))
        crown = min(1.0, max(0.0, (origin.z - landmarks["eye"]) / landmarks["rz"]))
        far = max(sideness, backness)

        strand = length + fall * (0.35 + 0.65 * far)
        strand *= rng.uniform(0.82, 1.18)
        strand *= 0.62 + 0.38 * crown  # the hairline edge itself stays short

        flow = down - normal * down.dot(normal)
        if flow.length < 0.45:
            flow = back - normal * back.dot(normal)  # over the crown, sweep back
        flow.normalize()
        curl = Vector(
            (
                noise.noise(origin * 26.0),
                noise.noise(origin * 26.0 + Vector((13.0, 7.0, 3.0))),
                noise.noise(origin * 26.0 + Vector((-5.0, 2.0, 9.0))),
            )
        )
        flow = (flow + curl * 0.5).normalized()
        # hair leaves the scalp at a shallow angle, or it is a hedgehog
        start = (normal * 0.55 + flow * 0.85).normalized()
        lift = min(0.012, strand * 0.22) * (0.35 + 0.65 * far)
        sag = strand * (0.12 + 0.34 * far)
        wobble = Vector((rng.uniform(-1.0, 1.0), rng.uniform(-1.0, 1.0), rng.uniform(-1.0, 1.0))) * 0.0016
        fray = curl * strand * 0.05

        steps = max(4, min(10, int(strand / 0.02) + 3))
        radius = 0.00042 * (0.8 + 0.4 * crown)
        for step in range(steps):
            t = step / (steps - 1)
            point = (
                origin
                + start * (strand * t)
                + down * (sag * t * t)
                + normal * (lift * math.sin(math.pi * min(1.0, t * 0.7)))
                + wobble * t
                + fray * (t * t * t)
            )
            points.extend(point)
            radii.append(radius * (1.0 - 0.72 * t))
        sizes.append(steps)

    curves = bpy.data.hair_curves.new(f"{body.name}_strands")
    curves.add_curves(sizes)
    curves.position_data.foreach_set("vector", points)
    layer = curves.attributes.get("radius") or curves.attributes.new("radius", "FLOAT", "POINT")
    layer.data.foreach_set("value", radii)
    curves.materials.append(hair_mat)
    strands = bpy.data.objects.new(curves.name, curves)
    for collection in body.users_collection:
        collection.objects.link(strands)
    strands.parent = body
    strands.matrix_world = body.matrix_world.copy()
    strands.matrix_parent_inverse = body.matrix_world.inverted()
    print(f"[hair] {strands.name}: {len(sizes)} strands, {len(points) // 3} points")
    return strands


def _bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return low, high


def _flatten_rotation(eye):
    """Turn an eyeball's object space back in line with the body's.

    `eye_material` finds the pupil by distance to the look axis in *object*
    space, which is only the body's forward axis if the object is unrotated.
    The male bundle ships its eyeballs turned 90 degrees about X: the same
    sphere in world space, but its local Y points up, so the shader's frontal
    plane is read off the wrong axes and the iris lands where the eye cannot be
    seen -- the ball renders plain grey with fibre streaks and no pupil.

    Baking the rotation into the mesh leaves the world shape untouched, so this
    is invisible except that the eye starts having an iris.
    """
    rotation = eye.matrix_world.to_quaternion().to_matrix().to_4x4()
    if rotation == Matrix.Identity(4):
        return
    # both eyes of a bundle can share one mesh; rotating it twice would undo it
    if eye.data.users > 1:
        eye.data = eye.data.copy()
    eye.data.transform(rotation)
    # the eyeball matrix is a uniform scale and a translation once the rotation
    # is gone, so rebuilding it from the decomposition drops nothing
    span, _rotation, scale = eye.matrix_world.decompose()
    eye.matrix_world = Matrix.Translation(span) @ Matrix.Diagonal(scale.to_4d())


def eye_centres(eyes):
    """Move each eyeball's origin to the eyeball centre and report
    (object, centre, radius): the eye shader is radial about that point.

    Also puts each eyeball's object space back in line with the body's rotation,
    because the eye shader reads object-space coordinates -- see
    `_flatten_rotation`.
    """
    found = []
    bpy.ops.object.select_all(action="DESELECT")
    for eye in eyes:
        low, high = _bounds(eye)
        centre = (low + high) / 2
        size = high - low
        radius = max(size.x, size.y, size.z) / 2
        bpy.context.scene.cursor.location = centre
        bpy.context.view_layer.objects.active = eye
        eye.select_set(True)
        try:
            bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        except RuntimeError:
            pass
        eye.select_set(False)
        _flatten_rotation(eye)
        found.append((eye, eye.matrix_world.translation.copy(), radius))
    return found


