"""Shared Blender helpers.

Every cutscene is described in code: reset the file, build the set, place the
camera, light it, render one PNG. Nothing is stored in a .blend, so a scene can
be rebuilt from scratch on any machine that has Blender.

Run through tools/blender/build.py, never directly.
"""

import math
import os

import bpy
from mathutils import Vector

# ---------- scene ----------


def device(prefer="OPTIX"):
    """Render on the GPU when there is one. A 10k-poly human with subsurface,
    pores and strand hair is minutes on the CPU and seconds on a laptop GPU."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        return "CPU"
    for backend in (prefer, "CUDA", "OPTIX", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
        except (TypeError, AttributeError):
            continue
        devices = [d for d in prefs.devices if d.type == backend]
        if not devices:
            continue
        for found in prefs.devices:
            found.use = found.type == backend
        scene = bpy.context.scene
        scene.cycles.device = "GPU"
        return backend
    return "CPU"


def reset(samples=48, gpu=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.012
    scene.cycles.adaptive_min_samples = min(24, samples)
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.cycles.transmission_bounces = 6
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.sample_clamp_indirect = 8.0
    scene.cycles.blur_glossy = 1.0
    scene.render.film_transparent = False
    scene.render.filter_size = 1.35
    scene.render.use_persistent_data = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    if gpu:
        # CUDA first: OptiX kernels from recent Blender builds need a newer
        # driver than some laptops ship, and a failed kernel load kills the run.
        backend = device(prefer="CUDA")
        if backend == "CPU":
            scene.cycles.device = "CPU"
            scene.render.threads_mode = "AUTO"
        else:
            for attr, value in (("denoiser", backend if backend == "OPTIX" else "OPENIMAGEDENOISE"), ("denoising_use_gpu", True)):
                try:
                    setattr(scene.cycles, attr, value)
                except (AttributeError, TypeError):
                    pass
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Punchy"
    except TypeError:
        scene.view_settings.view_transform = "Filmic"
    return scene


def world(color=(0.02, 0.025, 0.04), strength=0.6):
    """Ambient fill so shadows never go to pure black."""
    scene = bpy.context.scene
    node_world = bpy.data.worlds.new("world")
    node_world.use_nodes = True
    background = node_world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (*color, 1.0)
    background.inputs["Strength"].default_value = strength
    scene.world = node_world
    return node_world


# ---------- materials ----------


def _input(bsdf, name, value):
    if name in bsdf.inputs:
        try:
            bsdf.inputs[name].default_value = value
        except (TypeError, ValueError):
            pass


def material(
    name,
    base=(0.6, 0.6, 0.6),
    roughness=0.6,
    metallic=0.0,
    subsurface=0.0,
    subsurface_radius=(1.0, 0.35, 0.2),
    sheen=0.0,
    coat=0.0,
    emission=None,
    emission_strength=0.0,
    alpha=1.0,
):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    _input(bsdf, "Base Color", (*base, 1.0))
    _input(bsdf, "Roughness", roughness)
    _input(bsdf, "Metallic", metallic)
    _input(bsdf, "Sheen Weight", sheen)
    _input(bsdf, "Coat Weight", coat)
    _input(bsdf, "Alpha", alpha)
    if subsurface:
        _input(bsdf, "Subsurface Weight", subsurface)
        _input(bsdf, "Subsurface Radius", subsurface_radius)
        _input(bsdf, "Subsurface Scale", 0.05)
    if emission is not None:
        _input(bsdf, "Emission Color", (*emission, 1.0))
        _input(bsdf, "Emission Strength", emission_strength)
    if alpha < 1.0:
        for attr, value in (("blend_method", "BLEND"), ("surface_render_method", "BLENDED")):
            try:
                setattr(mat, attr, value)
            except (AttributeError, TypeError):
                pass
    return mat


def bump(mat, scale=320.0, strength=0.16, detail=3.0, distance=0.0015):
    """Micro-relief. One noise node does more for 'this is a surface' than any
    amount of extra polygons."""
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    texture = nodes.new("ShaderNodeTexNoise")
    texture.inputs["Scale"].default_value = scale
    texture.inputs["Detail"].default_value = detail
    normal = nodes.new("ShaderNodeBump")
    normal.inputs["Strength"].default_value = strength
    normal.inputs["Distance"].default_value = distance
    bsdf = nodes.get("Principled BSDF")
    links.new(texture.outputs["Fac"], normal.inputs["Height"])
    links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def skin(name="skin", tone=(0.72, 0.5, 0.42), roughness=0.46):
    """Human skin: subsurface scattering, two scales of pore relief, and a tone
    that drifts warm and cool across the body the way real skin does."""
    mat = material(
        name,
        base=tone,
        roughness=roughness,
        subsurface=0.26,
        subsurface_radius=(1.0, 0.36, 0.24),
        sheen=0.12,
        coat=0.05,
    )
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    # 7 mm keeps the glow soft without letting a thin fold of geometry — the lid
    # margin, the socket wall — light up like a coal: at 12 mm the canthus went orange
    _input(bsdf, "Subsurface Scale", 0.007)
    _input(bsdf, "Subsurface IOR", 1.42)
    _input(bsdf, "Specular IOR Level", 0.42)
    _input(bsdf, "Specular Tint", (1.0, 0.9, 0.86, 1.0))
    _input(bsdf, "Sheen Roughness", 0.38)
    _input(bsdf, "Sheen Tint", (1.0, 0.72, 0.62, 1.0))
    _input(bsdf, "Coat Roughness", 0.3)
    tone_map(mat, tone)
    pores(mat)
    return mat


def _mix(nodes, factor):
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    try:
        mix.inputs["Factor"].default_value = factor
    except (KeyError, IndexError):
        pass
    return mix


def tone_map(mat, tone, amount=0.55):
    """Mottling plus a warmer flush layer: no patch of skin is one colour."""
    try:
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")

        mottle = nodes.new("ShaderNodeTexNoise")
        mottle.inputs["Scale"].default_value = 14.0
        mottle.inputs["Detail"].default_value = 6.0
        mottle.inputs["Roughness"].default_value = 0.62
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.33
        ramp.color_ramp.elements[0].color = (tone[0] * 0.84, tone[1] * 0.79, tone[2] * 0.78, 1.0)
        ramp.color_ramp.elements[1].position = 0.7
        ramp.color_ramp.elements[1].color = (
            min(1.0, tone[0] * 1.07),
            min(1.0, tone[1] * 1.03),
            min(1.0, tone[2] * 1.0),
            1.0,
        )
        links.new(mottle.outputs["Fac"], ramp.inputs["Fac"])
        base = _mix(nodes, amount)
        base.inputs[6].default_value = (*tone, 1.0)
        links.new(ramp.outputs["Color"], base.inputs[7])

        # a flush of capillaries just under the surface
        flush = nodes.new("ShaderNodeTexNoise")
        flush.inputs["Scale"].default_value = 3.4
        flush.inputs["Detail"].default_value = 4.0
        warm = nodes.new("ShaderNodeValToRGB")
        warm.color_ramp.elements[0].position = 0.4
        warm.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        warm.color_ramp.elements[1].position = 0.78
        warm.color_ramp.elements[1].color = (1.0, 0.42, 0.34, 1.0)
        links.new(flush.outputs["Fac"], warm.inputs["Fac"])
        tint = _mix(nodes, 0.16)
        tint.blend_type = "MULTIPLY"
        links.new(base.outputs[2], tint.inputs[6])
        links.new(warm.outputs["Color"], tint.inputs[7])
        links.new(tint.outputs[2], bsdf.inputs["Base Color"])

        # roughness is patchy too: the T-zone is oilier than the cheeks
        oil = nodes.new("ShaderNodeTexNoise")
        oil.inputs["Scale"].default_value = 38.0
        oil.inputs["Detail"].default_value = 3.0
        oil_ramp = nodes.new("ShaderNodeValToRGB")
        oil_ramp.color_ramp.elements[0].position = 0.25
        oil_ramp.color_ramp.elements[0].color = (0.3, 0.3, 0.3, 1.0)
        oil_ramp.color_ramp.elements[1].position = 0.8
        oil_ramp.color_ramp.elements[1].color = (0.62, 0.62, 0.62, 1.0)
        links.new(oil.outputs["Fac"], oil_ramp.inputs["Fac"])
        links.new(oil_ramp.outputs["Color"], bsdf.inputs["Roughness"])
    except (KeyError, IndexError, AttributeError, TypeError):
        pass  # a flat tone is an acceptable fallback
    return mat


def pores(mat, coarse=(170.0, 0.13, 0.0016), fine=(2200.0, 0.42, 0.00028)):
    """Two bump layers: coarse form (tendons, soft creases) then pores. Pores are
    the single detail that stops a shaded body reading as plastic."""
    try:
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        node = None
        for scale, strength, distance in (coarse, fine):
            texture = nodes.new("ShaderNodeTexNoise")
            texture.inputs["Scale"].default_value = scale
            texture.inputs["Detail"].default_value = 6.0
            bump_node = nodes.new("ShaderNodeBump")
            bump_node.inputs["Strength"].default_value = strength
            bump_node.inputs["Distance"].default_value = distance
            links.new(texture.outputs["Fac"], bump_node.inputs["Height"])
            if node is not None:
                links.new(node.outputs["Normal"], bump_node.inputs["Normal"])
            node = bump_node
        links.new(node.outputs["Normal"], bsdf.inputs["Normal"])
    except (KeyError, AttributeError, TypeError):
        pass
    return mat

# ---------- procedural face paint ----------


def _feed(links, socket, value):
    """Set a socket from a number or tuple, or link it when handed an output."""
    if hasattr(value, "is_output"):
        links.new(value, socket)
    else:
        socket.default_value = value


def _math(links, nodes, operation, a, b=None, c=None, clamp=False):
    """A Math node; `c` feeds the third socket, which MULTIPLY_ADD lerps with.

    `clamp` clamps the output whatever the operation, which is the only way to
    keep a shape term inside 0..1 before it is used as a divisor.
    """
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    node.use_clamp = clamp
    _feed(links, node.inputs[0], a)
    if b is not None:
        _feed(links, node.inputs[1], b)
    if c is not None:
        _feed(links, node.inputs[2], c)
    return node.outputs[0]


def _ramp(links, nodes, value, low, high):
    """Smoothstep from 0 at `low` to 1 at `high`; a reversed pair inverts it."""
    node = nodes.new("ShaderNodeMapRange")
    node.interpolation_type = "SMOOTHSTEP"
    node.clamp = True
    _feed(links, node.inputs[0], value)
    node.inputs[1].default_value = low
    node.inputs[2].default_value = high
    node.inputs[3].default_value = 0.0
    node.inputs[4].default_value = 1.0
    return node.outputs[0]


def _inside(links, nodes, value, inner, outer):
    """1 well inside `inner`, 0 past `outer`, smooth in between."""
    return _math(links, nodes, "SUBTRACT", 1.0, _ramp(links, nodes, value, inner, outer))


def _times(links, nodes, *masks):
    total = masks[0]
    for mask in masks[1:]:
        total = _math(links, nodes, "MULTIPLY", total, mask)
    return total


def _blend(links, nodes, base, colour, fac):
    node = nodes.new("ShaderNodeMix")
    node.data_type = "RGBA"
    _feed(links, node.inputs[0], fac)
    _feed(links, node.inputs[6], base)
    _feed(links, node.inputs[7], colour)
    return node.outputs[2]


def face_paint(mat, height, eye_z, eyes, lips=(0.42, 0.17, 0.16), brow=(0.05, 0.035, 0.028), lash=(0.025, 0.018, 0.016)):
    """Lips, brows and lash lines as a positional mask on the skin shader.

    Per-face colour cannot resolve a 4 mm brow when the head mesh has 6 mm
    quads — it comes out as dashes. A mask in object space is smooth at any
    topology, needs no UVs, and can feather its own edges.

    Every size below was measured off the head rather than guessed, because a
    mask 10 mm too long or 3 mm too low stops reading as paint and starts
    reading as a bruise. Ray-probing the closed head gives the eyelid opening as
    a 20 x 10 mm almond centred 0.5 mm above the eyeball centre (hence the 0.83
    and 0.46 radius factors on the lash ring), the lip bulge as a 21 mm band
    centred at 0.8885 h, and the brow as needing to stay ~11 mm clear of the lid
    margin: ends at eye_z + 13.5 mm, arch at +18.5 mm, 37 mm long.

    `eyes` is [(centre, radius)] in body space, the way `lib_body.eye_centres`
    reports them. Everything is gated to the front of the head, because the same
    z on the nape is skin and not lip.
    """
    try:
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        coord = nodes.new("ShaderNodeTexCoord")
        split = nodes.new("ShaderNodeSeparateXYZ")
        links.new(coord.outputs["Object"], split.inputs[0])
        x, y, z = split.outputs["X"], split.outputs["Y"], split.outputs["Z"]
        # forward of y = -22 mm is the face; the nape sits behind it
        front = _inside(links, nodes, y, -0.022, -0.006)
        span = _math(links, nodes, "ABSOLUTE", x)

        # lips: a 46 x 17 mm oval laid on the bulge. One curve drives both the
        # tone split and the seam, and it lifts a millimetre in the middle, which
        # is the difference between a mouth and a pink sausage.
        mx, mz, mh = 0.0140 * height, 0.8885 * height, 0.0052 * height
        ex = _math(links, nodes, "ABSOLUTE", _math(links, nodes, "DIVIDE", x, mx))
        ez = _math(links, nodes, "DIVIDE", _math(links, nodes, "SUBTRACT", z, mz), mh)
        # a mouth is a lens: full width at the seam, closing to a point at each
        # corner. Ellipse in x, but a 1.5 power on |z| makes the taper reach the
        # corner faster than a square root would — round corners read as a clown
        # mouth, while a kink at the top makes a leaf
        rim = _math(
            links,
            nodes,
            "ADD",
            _math(links, nodes, "MULTIPLY", ex, ex),
            _math(links, nodes, "POWER", _math(links, nodes, "ABSOLUTE", ez), 1.5),
        )
        # a vermilion border is a hard edge on the form, not a bruise: feathered
        # over 3 mm the mouth reads as a shadow, so keep the fade under 1.5 mm
        lip_mask = _times(links, nodes, _inside(links, nodes, rim, 0.84, 1.0), front)
        centre = _math(links, nodes, "DIVIDE", x, 0.55 * mx)
        dip = _math(links, nodes, "SUBTRACT", 1.0, _math(links, nodes, "MULTIPLY", centre, centre), clamp=True)
        # the mouth line sits above the middle of the vermilion: measured, it was
        # 9.4 mm down a 17 mm mouth, and an upper lip taller than the lower is the
        # one mouth proportion that never happens (8.3 upper to 10.4 lower is the
        # female average), so lift it inside the same outline. z is up, so a bigger
        # line means a higher seam.
        line = _math(links, nodes, "MULTIPLY_ADD", dip, 0.0010, mz + 0.0019)
        split_node = nodes.new("ShaderNodeMapRange")
        split_node.interpolation_type = "SMOOTHSTEP"
        split_node.clamp = True
        links.new(z, split_node.inputs[0])
        links.new(_math(links, nodes, "SUBTRACT", line, 0.0007), split_node.inputs[1])
        links.new(_math(links, nodes, "ADD", line, 0.0007), split_node.inputs[2])
        split_node.inputs[3].default_value = 0.0
        split_node.inputs[4].default_value = 1.0
        above = split_node.outputs[0]
        # only a touch darker above: at 0.72 the split exactly cancelled the light
        # the lower lip catches, and the mouth came out one flat tone
        tone = _blend(links, nodes, lips + (1.0,), tuple(c * 0.86 for c in lips) + (1.0,), above)
        # the mouth line is simply where that split is halfway: no second shape
        # to keep in register with the first
        seam = _times(
            links,
            nodes,
            lip_mask,
            _math(links, nodes, "MULTIPLY", _math(links, nodes, "MULTIPLY", above, _math(links, nodes, "SUBTRACT", 1.0, above)), 4.0),
            _inside(links, nodes, span, 0.62 * mx, 0.94 * mx),
        )

        # brows: an arch 37 mm long, thickest at the nose end, thinning to the tail
        inner, outer = 0.0115 * height, 0.0340 * height
        t = _math(links, nodes, "DIVIDE", _math(links, nodes, "SUBTRACT", span, inner), outer - inner)
        # clamped for the shape terms: t runs negative inboard and past 1 at the
        # tail, and a negative thickness would divide the band by zero
        tc = _math(links, nodes, "ADD", t, 0.0, clamp=True)
        s = _math(links, nodes, "MULTIPLY_ADD", tc, 2.0, -1.0)
        arch = _math(links, nodes, "SUBTRACT", 1.0, _math(links, nodes, "MULTIPLY", s, s))
        bow = _math(links, nodes, "MULTIPLY_ADD", arch, 0.005, eye_z + 0.0135)
        half = _math(links, nodes, "MULTIPLY_ADD", tc, -0.0014, 0.0032)
        band = _inside(
            links,
            nodes,
            _math(links, nodes, "DIVIDE", _math(links, nodes, "ABSOLUTE", _math(links, nodes, "SUBTRACT", z, bow)), half),
            0.55,
            1.0,
        )
        brow_mask = _times(
            links,
            nodes,
            band,
            _ramp(links, nodes, t, -0.06, 0.12),
            _inside(links, nodes, t, 0.82, 1.02),
            front,
        )

        # lashes: a 1 mm ring on the lid margin, long over the middle of the
        # upper lid, with a sparser line under the lower one
        lash_mask = None
        for centre, radius in eyes:
            dx = _math(links, nodes, "DIVIDE", _math(links, nodes, "SUBTRACT", x, centre.x), radius * 0.83)
            dz = _math(
                links,
                nodes,
                "DIVIDE",
                _math(links, nodes, "SUBTRACT", z, centre.z + radius * 0.04),
                radius * 0.46,
            )
            n = _math(
                links,
                nodes,
                "SQRT",
                _math(links, nodes, "ADD", _math(links, nodes, "MULTIPLY", dx, dx), _math(links, nodes, "MULTIPLY", dz, dz)),
            )
            ring = _times(links, nodes, _ramp(links, nodes, n, 0.80, 1.0), _inside(links, nodes, n, 1.0, 1.24))
            upper = _ramp(links, nodes, dz, 0.05, 0.42)
            lower = _math(
                links,
                nodes,
                "MULTIPLY",
                _ramp(links, nodes, _math(links, nodes, "MULTIPLY", dz, -1.0), 0.10, 0.55),
                0.32,
            )
            one = _times(links, nodes, ring, _math(links, nodes, "MAXIMUM", upper, lower), front)
            lash_mask = one if lash_mask is None else _math(links, nodes, "MAXIMUM", lash_mask, one)

        base = bsdf.inputs["Base Color"].links[0].from_socket if bsdf.inputs["Base Color"].is_linked else bsdf.inputs["Base Color"].default_value
        colour = _blend(links, nodes, base, tone, lip_mask)
        colour = _blend(links, nodes, colour, tuple(c * 0.45 for c in lips) + (1.0,), seam)
        # a brow is hairs over skin: let a little of the skin through the mask,
        # but not so much that 0.05 hair over 0.74 skin reads as grey pencil
        soft = _blend(links, nodes, base, brow + (1.0,), 0.86)
        colour = _blend(links, nodes, colour, soft, brow_mask)
        if lash_mask is not None:
            colour = _blend(links, nodes, colour, lash + (1.0,), lash_mask)
        links.new(colour, bsdf.inputs["Base Color"])
    except (KeyError, IndexError, AttributeError, TypeError) as error:
        print(f"[murmur] face paint fell back to plain skin: {error!r}")
    return mat


def _socket_edge(head, spot, segs, reach=0.024, step=0.0004, front=0.0015):
    """Radius of the head's own lid line round a socket, one value per segment.

    The socket is a cup, not a hole: fired from the front, a ray inside the
    aperture runs past the eyeball and lands on the cup's back wall up to 14 mm
    *behind* the eye centre, so a hit says nothing on its own. Two things do:
    skin round the socket sits in front of the centre plane, and it faces the
    camera where the cup's wall faces inward. Measured, the lid line runs -4 mm
    (canthi) to -13 mm (brow and cheek) in front, the cup's wall +14 mm behind,
    so the two cannot be confused once the depth is checked.

    The raw profile is jagged (11.0, 11.5, 10.5 mm at neighbouring angles) and
    empty at some angles, so it is filled from its neighbours and smoothed.
    Returns (radii, depths) in the head's own units, or lists of None if there is
    no socket to measure and the caller must fall back to a guess.
    """
    radii, depths = [], []
    for k in range(segs):
        angle = 2.0 * math.pi * k / segs
        cos, sin = math.cos(angle), math.sin(angle)
        found_r = found_y = None
        out = 0.0010
        while out <= reach:
            origin = Vector((spot.x + out * cos, spot.y - 0.05, spot.z + out * sin))
            hit, loc, normal, _index = head.ray_cast(origin, Vector((0.0, 1.0, 0.0)))
            if hit and normal.y < -0.25 and (loc.y - spot.y) < -front:
                found_r, found_y = out, loc.y
                break
            out += step
        radii.append(found_r)
        depths.append(found_y)

    for k in range(segs):
        if radii[k] is not None:
            continue
        for offset in range(1, segs):
            for near in ((k - offset) % segs, (k + offset) % segs):
                if radii[near] is not None:
                    radii[k], depths[k] = radii[near], depths[near]
                    break
            if radii[k] is not None:
                break

    if None in radii:  # no skin facing forward anywhere: let the caller guess
        return radii, depths

    for _pass in range(2):
        radii = [(radii[(k - 1) % segs] + 2.0 * radii[k] + radii[(k + 1) % segs]) / 4.0 for k in range(segs)]
        depths = [(depths[(k - 1) % segs] + 2.0 * depths[k] + depths[(k + 1) % segs]) / 4.0 for k in range(segs)]
    return radii, depths


def lid_margin(name, centre, radius, head=None, across=0.0110, up=0.0050, lift=0.0005, inner=0.86, drop=0.0003, rim=0.0110, proud=0.00015, lash=0.00035, taper=1.2, bulge=0.00012, scale=1.0, segs=72, mat=None, ink=None):
    """The millimetre of eyelid the head does not model, laid from rim to eyeball.

    The socket is an open almond, the eyeball fills it, and the skin around it is
    a zero-thickness shell: measured, the ball sits 1.5 mm behind the lid line and
    the shell's edge is seen dead-on, so there is no lid margin anywhere -- the eye
    reads as a ball pushed through a hole. Sinking the ball is not a lever either:
    the visible extent stayed 22 x 10 mm from 0 to 6 mm of seat offset, because the
    aperture, not the ball, is what bounds it.

    So the lid gets a surface: a funnel from the almond's edge down to the eyeball,
    tucked 0.5 mm under the skin so its outer edge hides, ending on the ball itself.
    That is a real margin -- it shades, it throws a shadow onto the sclera, and it
    faces the camera, so the lash paint keyed to this radius finally lands on
    something instead of on a shell edge seen edge-on.

    `centre` and `radius` are the *seated* eyeball in the same space as the skin,
    because the band has to meet the ball it sits on. The inner ring is narrower
    than the outer by `inner` and dropped by `drop`, which is what makes the upper
    lid cover more of the eye than the lower one does. `scale` converts the metric
    defaults into the skin's own units when the body is not at unit scale.

    The band carries two materials: skin for the margin, `ink` for the line where
    it meets the ball. That line is the point of the whole surface. Painted on the
    head it was invisible, because the skin's rim is a zero-thickness edge seen
    dead-on; here it is on a strip that faces the camera, so it reads as lashes.
    `lash` is its thickness in metres, held constant round the eye: taken as a
    fraction of the band it came out 0.7 mm at the canthi, where the band is
    widest, and 0.2 mm at the top, where the eye needs it most -- measured back
    out of a render, that is a ring of eyeliner above a bare lid. `taper` widens
    it in the last few degrees at each corner, which is what makes the almond
    come to a point instead of stopping at a rounded end. `bulge` bows the strip
    outwards between rim and ball: a lid is a rolled edge catching light, and a
    straight chord from skin to eyeball reads as the inside of a cone.

    Handing over `head` fits the outer ring to the socket the head actually has.
    A blind ellipse of 22 x 10 mm left slivers of lit cavity showing at the canthi,
    where the real lid line runs to 24 mm: the almond is not an ellipse and only
    the asset knows its shape. See `_socket_edge`. `across` and `up` then only
    place the inner ring, on the ball.
    """
    centre = Vector(centre)
    across, up, lift = across * scale, up * scale, lift * scale
    drop, rim, proud, radius = drop * scale, rim * scale, proud * scale, radius * scale
    lash, bulge = lash * scale, bulge * scale
    # under the skin and a hair outwards, so the band's outer edge cannot be seen
    # as the edge it is
    tuck_r, tuck_y = 0.00015 * scale, 0.00030 * scale
    edge_r = edge_y = None
    if head is not None:
        edge_r, edge_y = _socket_edge(
            head, centre, segs, reach=max(across, up) * 2.4, step=0.0004 * scale, front=0.0015 * scale
        )
        if None in edge_r:
            edge_r = edge_y = None

    def lip_point(angle):
        """The head's own lid line at this angle, a hair under it."""
        cos, sin = math.cos(angle), math.sin(angle)
        if edge_r is not None:
            at = (angle / (2.0 * math.pi)) % 1.0 * segs
            low = int(math.floor(at)) % segs
            high = (low + 1) % segs
            frac = at - math.floor(at)
            r = edge_r[low] + (edge_r[high] - edge_r[low]) * frac
            y = edge_y[low] + (edge_y[high] - edge_y[low]) * frac
            return Vector((centre.x + (r + tuck_r) * cos, y + tuck_y, centre.z + (r + tuck_r) * sin))
        return Vector((centre.x + across * cos, centre.y - rim, centre.z + up * sin + lift))

    def ball_point(angle):
        cos, sin = math.cos(angle), math.sin(angle)
        dx, dz = across * inner * cos, up * inner * sin + lift - drop
        depth = math.sqrt(max(radius * radius - dx * dx - dz * dz, 0.0)) + proud
        return Vector((centre.x + dx, centre.y - depth, centre.z + dz))

    def band_point(lip, ball, u):
        """A point on the band, bulged across the middle like a lid roll."""
        point = lip.lerp(ball, u)
        point.y -= bulge * math.sin(math.pi * u)
        return point

    verts, faces = [], []
    for k in range(segs):
        angle = 2.0 * math.pi * k / segs
        cos = math.cos(angle)
        lip, ball = lip_point(angle), ball_point(angle)
        span = max((ball - lip).length, 1e-6)
        seen = max(math.hypot(ball.x - lip.x, ball.z - lip.z), 1e-6)
        # `lash` is the width the line shows from the front, so the strip has to be
        # that much longer along the surface wherever the band turns away from the
        # camera: 0.35 mm seen is 0.67 mm of surface at the top of the lid
        wide = lash * (span / seen) * (1.0 + taper * max(0.0, abs(cos) - 0.80) ** 2 / 0.04)
        inner_edge = max(0.56, 1.0 - wide / span)
        # 0 the rim, 0.5 the roll of the lid, then the lash line to the ball
        for u in (0.0, 0.5, inner_edge, 1.0):
            verts.append(tuple(band_point(lip, ball, u)))
    for k in range(segs):
        here, next_ = 4 * k, 4 * ((k + 1) % segs)
        for step in range(3):
            faces.append((here + step, next_ + step, next_ + step + 1, here + step + 1))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    _finish(obj, mat, True)
    if ink is not None:
        obj.data.materials.append(ink)
        for index, poly in enumerate(obj.data.polygons):
            if index % 3 == 2:  # the strip that meets the ball
                poly.material_index = 1
    return obj


def cloth(name, base, roughness=0.9, weave=2200.0):
    """Fabric: sheen for the fuzz, two bump layers for the weave and the folds."""
    mat = material(name, base=base, roughness=roughness, sheen=0.55, coat=0.03)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    _input(bsdf, "Sheen Roughness", 0.42)
    _input(bsdf, "Specular IOR Level", 0.28)
    _input(bsdf, "Sheen Tint", (1.0, 0.96, 0.92, 1.0))
    try:
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        fibre = nodes.new("ShaderNodeTexVoronoi")
        fibre.feature = "F1"
        fibre.inputs["Scale"].default_value = weave
        folds = nodes.new("ShaderNodeTexNoise")
        folds.inputs["Scale"].default_value = 80.0
        folds.inputs["Detail"].default_value = 4.0
        bump_fibre = nodes.new("ShaderNodeBump")
        bump_fibre.inputs["Strength"].default_value = 0.32
        bump_fibre.inputs["Distance"].default_value = 0.0006
        links.new(fibre.outputs["Distance"], bump_fibre.inputs["Height"])
        bump_folds = nodes.new("ShaderNodeBump")
        bump_folds.inputs["Strength"].default_value = 0.22
        bump_folds.inputs["Distance"].default_value = 0.0022
        links.new(folds.outputs["Fac"], bump_folds.inputs["Height"])
        links.new(bump_fibre.outputs["Normal"], bump_folds.inputs["Normal"])
        links.new(bump_folds.outputs["Normal"], bsdf.inputs["Normal"])

        # a dye lot is never perfectly even: ±6%
        variation = nodes.new("ShaderNodeTexNoise")
        variation.inputs["Scale"].default_value = 55.0
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (base[0] * 0.94, base[1] * 0.94, base[2] * 0.95, 1.0)
        ramp.color_ramp.elements[1].color = (
            min(1, base[0] * 1.06),
            min(1, base[1] * 1.06),
            min(1, base[2] * 1.06),
            1.0,
        )
        links.new(variation.outputs["Fac"], ramp.inputs["Fac"])
        dye = _mix(nodes, 0.5)
        dye.inputs[6].default_value = (*base, 1.0)
        links.new(ramp.outputs["Color"], dye.inputs[7])
        links.new(dye.outputs[2], bsdf.inputs["Base Color"])
    except (KeyError, AttributeError, TypeError):
        pass
    return mat


def hair_material(name, color=(0.09, 0.055, 0.04), roughness=0.3):
    """Strand hair uses the Hair BSDF, not Principled: that is the difference
    between 'hair' and 'a smooth cap'."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    try:
        hair_node = tree.nodes.new("ShaderNodeBsdfHairPrincipled")
        _menu(hair_node.inputs.get("Model"), ("CHIANG", "HUANG", "MULTISCATTER", "Chiang"))
        bright = max(color)
        _socket(hair_node.inputs.get("Melanin"), max(0.0, min(1.0, 0.94 - bright * 1.6)))
        _socket(hair_node.inputs.get("Melanin Redness"), max(0.0, min(1.0, color[0] / max(bright, 0.01) - 0.2)))
        _socket(hair_node.inputs.get("Roughness"), roughness)
        _socket(hair_node.inputs.get("Radial Roughness"), 0.35)
        _socket(hair_node.inputs.get("Random Color"), 0.12)
        _socket(hair_node.inputs.get("Random Roughness"), 0.25)
        _socket(hair_node.inputs.get("Coat"), 0.12)
        tree.links.new(hair_node.outputs[0], output.inputs["Surface"])
    except (AttributeError, RuntimeError, TypeError):
        bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
        _socket(bsdf.inputs.get("Base Color"), (*color, 1.0))
        _socket(bsdf.inputs.get("Roughness"), roughness)
        _socket(bsdf.inputs.get("Sheen Weight"), 0.9)
        tree.links.new(bsdf.outputs[0], output.inputs["Surface"])
    return mat




def eye_material(name="eye", iris=(0.16, 0.09, 0.05), radius=0.014):
    """A whole eyeball in one shader: pupil, iris, limbal ring, veined sclera.

    Everything is keyed to the distance from the *look axis* (-Y), not from the
    centre: every point on a sphere is exactly `radius` from the centre, so a
    centre-distance ramp paints the whole ball one colour. `radius` is the
    eyeball's radius in *object* space, which is what the texture coordinate is.

    That makes the shader's contract "the ball looks down -Y in object space",
    and an asset that ships its eyeballs turned -- same sphere in world space,
    different local axes -- quietly has no iris at all, because the frontal
    plane is then read off the wrong axes. `lib_body.eye_centres` keeps that
    promise for every body kind, so the axis here can be trusted.

    Two rules keep this from looking like a marble: the fibre noise multiplies
    the iris colour instead of replacing it, and the cornea is a coat, not a
    mirror — a full-weight coat reflects the softbox and hides the iris.
    """
    mat = material(name, base=(0.74, 0.7, 0.66), roughness=0.34, coat=0.4)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    _input(bsdf, "Coat Roughness", 0.035)
    _input(bsdf, "Specular IOR Level", 0.5)
    _input(bsdf, "Subsurface Weight", 0.0)
    try:
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        coord = nodes.new("ShaderNodeTexCoord")
        separate = nodes.new("ShaderNodeSeparateXYZ")
        links.new(coord.outputs["Object"], separate.inputs[0])
        x, z = separate.outputs["X"], separate.outputs["Z"]

        # the frontal plane: the eyeball looks down -Y, so the pupil is x=z=0
        plane = nodes.new("ShaderNodeCombineXYZ")
        links.new(x, plane.inputs["X"])
        links.new(z, plane.inputs["Z"])
        axis = nodes.new("ShaderNodeVectorMath")
        axis.operation = "LENGTH"
        links.new(plane.outputs[0], axis.inputs[0])
        norm = _math(links, nodes, "DIVIDE", axis.outputs["Value"], radius)

        # radius -> colour: pupil, collarette, iris, limbal ring, sclera
        band = nodes.new("ShaderNodeValToRGB")
        ramp = band.color_ramp
        ramp.elements[0].position = 0.0
        ramp.elements[0].color = (0.003, 0.003, 0.004, 1.0)
        for position, value in (
            (0.135, (0.004, 0.004, 0.005, 1.0)),
            (0.152, (iris[0] * 1.7, iris[1] * 1.45, iris[2] * 1.2, 1.0)),
            (0.260, iris + (1.0,)),
            (0.380, (iris[0] * 0.5, iris[1] * 0.45, iris[2] * 0.45, 1.0)),
            (0.425, (0.012, 0.010, 0.009, 1.0)),
            (0.455, (0.012, 0.010, 0.009, 1.0)),
            (0.475, (0.46, 0.40, 0.36, 1.0)),
            (0.560, (0.78, 0.72, 0.68, 1.0)),
            (1.000, (0.80, 0.74, 0.70, 1.0)),
        ):
            element = ramp.elements.new(position)
            element.color = value
        links.new(norm, band.inputs["Fac"])

        # iris fibres: noise in polar coordinates, so it runs out from the pupil.
        # The frequencies are chosen against the drawn size, not the millimetres:
        # a ball this age is ~300 px across on screen, so ~10 rad^-1 gives sixty
        # readable striations instead of a grey average.
        angle = _math(links, nodes, "ARCTAN2", x, z)
        polar = nodes.new("ShaderNodeCombineXYZ")
        links.new(_math(links, nodes, "MULTIPLY", angle, 4.0), polar.inputs["X"])
        links.new(_math(links, nodes, "MULTIPLY", norm, 0.5), polar.inputs["Z"])
        fibres = nodes.new("ShaderNodeTexNoise")
        fibres.inputs["Scale"].default_value = 2.5
        fibres.inputs["Detail"].default_value = 6.0
        fibres.inputs["Roughness"].default_value = 0.65
        links.new(polar.outputs[0], fibres.inputs["Vector"])
        gain = _math(
            links,
            nodes,
            "ADD",
            _math(links, nodes, "MULTIPLY", fibres.outputs["Fac"], 1.3),
            0.42,
        )
        fibre_mix = _mix(nodes, 1.0)
        fibre_mix.blend_type = "MULTIPLY"
        links.new(band.outputs["Color"], fibre_mix.inputs[6])
        links.new(gain, fibre_mix.inputs[7])

        # blood vessels: a web over the whole ball, allowed through on the sclera
        veins = nodes.new("ShaderNodeTexNoise")
        veins.inputs["Scale"].default_value = 70.0
        veins.inputs["Detail"].default_value = 8.0
        veins.inputs["Roughness"].default_value = 0.72
        links.new(coord.outputs["Object"], veins.inputs["Vector"])
        vein_ramp = nodes.new("ShaderNodeValToRGB")
        vein_ramp.color_ramp.elements[0].position = 0.58
        vein_ramp.color_ramp.elements[0].color = (1.0, 1.0, 1.0, 1.0)
        vein_ramp.color_ramp.elements[1].position = 0.70
        vein_ramp.color_ramp.elements[1].color = (0.80, 0.52, 0.48, 1.0)
        links.new(veins.outputs["Fac"], vein_ramp.inputs["Fac"])
        sclera = _ramp(links, nodes, norm, 0.50, 0.66)
        vessel = _mix(nodes, 0.0)
        vessel.blend_type = "MULTIPLY"
        links.new(sclera, vessel.inputs[0])
        links.new(fibre_mix.outputs[2], vessel.inputs[6])
        links.new(vein_ramp.outputs["Color"], vessel.inputs[7])

        # a sclera is never white: the upper lid shades the top of it and the light
        # falls off toward the canthi. Without this the ball reads as a glass bead
        # and the eye stares instead of being set in a socket.
        up = _math(links, nodes, "DIVIDE", z, radius)  # +1 is the top of the ball
        lid = _math(links, nodes, "MULTIPLY_ADD", _ramp(links, nodes, up, -0.15, 0.70), -0.58, 1.0)
        edge = _math(links, nodes, "MULTIPLY_ADD", _ramp(links, nodes, norm, 0.42, 1.0), -0.35, 1.0)
        shade = _math(links, nodes, "MULTIPLY", lid, edge)
        grey = nodes.new("ShaderNodeCombineXYZ")
        for socket in grey.inputs:
            links.new(shade, socket)
        dark = _mix(nodes, 1.0)
        dark.blend_type = "MULTIPLY"
        links.new(vessel.outputs[2], dark.inputs[6])
        links.new(grey.outputs[0], dark.inputs[7])
        links.new(dark.outputs[2], bsdf.inputs["Base Color"])

        # wet iris, drier sclera
        wet = nodes.new("ShaderNodeValToRGB")
        wet.color_ramp.elements[0].position = 0.0
        wet.color_ramp.elements[0].color = (0.05, 0.05, 0.05, 1.0)
        wet.color_ramp.elements[1].position = 1.0
        wet.color_ramp.elements[1].color = (0.42, 0.42, 0.42, 1.0)
        for position, value in ((0.44, 0.07), (0.58, 0.30)):
            element = wet.color_ramp.elements.new(position)
            element.color = (value, value, value, 1.0)
        links.new(norm, wet.inputs["Fac"])
        links.new(wet.outputs["Color"], bsdf.inputs["Roughness"])
    except (KeyError, IndexError, AttributeError, TypeError) as error:
        print(f"[murmur] eye shader fell back to a flat ball: {error!r}")
    return mat


def dust(name="dust", center=(0, 0, 1), spread=(1.0, 1.0, 1.2), count=90, radius=0.0016, seed=1.0):
    """Motes hanging in the light. Cheap geometry, and it puts air in the frame."""
    import random

    random.seed(seed)
    mat = material(
        f"{name}_mat",
        base=(1.0, 0.95, 0.86),
        roughness=0.6,
        emission=(1.0, 0.93, 0.82),
        emission_strength=0.7,
        alpha=0.4,
    )
    motes = []
    for index in range(count):
        loc = (
            center[0] + (random.random() - 0.5) * spread[0],
            center[1] + (random.random() - 0.5) * spread[1],
            center[2] + (random.random() - 0.5) * spread[2],
        )
        motes.append(sphere(f"{name}_{index}", loc=loc, radius=radius * (0.4 + random.random()), mat=mat, segments=8))
    return motes


def emissive(name, color, strength=18.0):
    return material(name, base=color, roughness=1.0, emission=color, emission_strength=strength)


# ---------- primitives ----------


def _finish(obj, mat, smooth=True, subsurf=0):
    if mat is not None:
        obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if subsurf:
        mod = obj.modifiers.new("subsurf", "SUBSURF")
        mod.levels = subsurf
        mod.render_levels = subsurf
    return obj


def sphere(name, loc=(0, 0, 0), radius=0.5, scale=(1, 1, 1), mat=None, segments=32, subsurf=0, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return _finish(obj, mat, smooth, subsurf)


def capsule(name, loc=(0, 0, 0), radius=0.1, depth=0.2, scale=(1, 1, 1), mat=None, subsurf=1, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width = radius * 0.85
    bev.segments = 4
    return _finish(obj, mat, True, subsurf)


def cube(name, loc=(0, 0, 0), size=1.0, scale=(1, 1, 1), mat=None, bevel=0.0, rotation=(0, 0, 0), subsurf=0):
    bpy.ops.mesh.primitive_cube_add(size=size, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return _finish(obj, mat, True, subsurf)


def plane(name, loc=(0, 0, 0), size=2.0, scale=(1, 1, 1), mat=None, rotation=(math.radians(90), 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=size, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return _finish(obj, mat, False)


def rod(name, start, end, radius=0.02, mat=None, subsurf=0):
    """A cylinder spanning two points — crib bars, chair legs, window frames."""
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    mid = a + delta / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=delta.length, location=mid)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return _finish(obj, mat, True, subsurf)


# ---------- light ----------


def area(name, loc, rot=(0, 0, 0), energy=200.0, size=1.0, color=(1, 0.96, 0.9), shape="SQUARE"):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.shape = shape
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = rot
    obj.visible_camera = False  # a light is not a prop: never render the emitter itself
    bpy.context.collection.objects.link(obj)
    return obj


def point(name, loc, energy=60.0, radius=0.15, color=(1, 0.8, 0.55)):
    data = bpy.data.lights.new(name, type="POINT")
    data.energy = energy
    data.shadow_soft_size = radius
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.visible_camera = False
    bpy.context.collection.objects.link(obj)
    return obj


def aim(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("-Z", "Y")
    return obj


def lamp(name, loc, target, energy=40.0, radius=0.08, color=(1.0, 0.72, 0.42)):
    """A warm practical: the thing you can see glowing in the shot."""
    point(name, loc, energy=energy, radius=radius, color=color)
    return sphere(name + "_bulb", loc=loc, radius=radius, mat=emissive(name + "_glow", color, 25.0), segments=16)


# ---------- camera ----------


def camera(loc, target, lens=50.0, fstop=2.0, focus=None, sensor=36.0):
    """`fstop=None` turns depth of field off. A lens long enough to fill the
    frame with a face has only a couple of millimetres of depth of field at
    that distance, which is right for a shot and useless for a probe."""
    data = bpy.data.cameras.new("camera")
    data.lens = lens
    data.sensor_width = sensor
    data.dof.use_dof = fstop is not None
    if fstop is not None:
        data.dof.aperture_fstop = fstop
    obj = bpy.data.objects.new("camera", data)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    aim(obj, target)
    if focus is not None:
        data.dof.focus_distance = Vector(focus).length if isinstance(focus, tuple) else float(focus)
    bpy.context.scene.camera = obj
    return obj


# ---------- render ----------


def grade(bloom=0.3, grain=0.06, vignette=0.45):
    """Post: a touch of bloom on the practicals and film grain. Cheap, and it is
    most of the difference between 'a render' and 'a photograph'."""
    scene = bpy.context.scene
    scene.use_nodes = True
    tree = getattr(scene, "node_tree", None)
    if tree is None:
        # Blender 5 moved the compositor into a node group
        tree = getattr(scene, "compositing_node_group", None)
        if tree is None:
            tree = bpy.data.node_groups.new("murmur_comp", "CompositorNodeTree")
            scene.compositing_node_group = tree
    tree.nodes.clear()

    layers = tree.nodes.new("CompositorNodeRLayers")
    tail = layers

    if bloom:
        glare = tree.nodes.new("CompositorNodeGlare")
        _menu(glare.inputs.get("Type"), ("Bloom", "BLOOM", "Fog Glow"))
        _socket(glare.inputs.get("Threshold"), 1.0)
        _socket(glare.inputs.get("Strength"), bloom)
        _socket(glare.inputs.get("Size"), 0.6)
        _socket(glare.inputs.get("Saturation"), 1.0)
        tree.links.new(tail.outputs["Image"], glare.inputs["Image"])
        tail = glare

    if grain:
        try:
            noise = tree.nodes.new("CompositorNodeTexture")
            texture = bpy.data.textures.new("grain", type="CLOUDS")
            texture.noise_scale = 0.0006
            noise.texture = texture
            mix = tree.nodes.new("CompositorNodeMix")
            _menu(mix.inputs.get("Data Type"), ("RGBA", "Color"))
            _socket(mix.inputs.get("Factor"), grain)
            mix.blend_type = "OVERLAY"
            tree.links.new(tail.outputs["Image"], mix.inputs["A"])
            tree.links.new(noise.outputs["Value"], mix.inputs["B"])
            tail = mix
        except (RuntimeError, TypeError, AttributeError, KeyError):
            pass

    if vignette:
        try:
            mask = tree.nodes.new("CompositorNodeEllipseMask")
            for attr, value in (("width", 0.95), ("height", 0.95)):
                try:
                    setattr(mask, attr, value)
                except (AttributeError, TypeError):
                    pass
            blur = tree.nodes.new("CompositorNodeBlur")
            _socket(blur.inputs.get("Size"), 400.0)
            invert = tree.nodes.new("CompositorNodeInvert")
            links = tree.links
            links.new(mask.outputs[0], blur.inputs[0])
            links.new(blur.outputs[0], invert.inputs[0])
            shade = tree.nodes.new("CompositorNodeMix")
            _menu(shade.inputs.get("Data Type"), ("RGBA", "Color"))
            _socket(shade.inputs.get("Factor"), vignette)
            shade.blend_type = "MULTIPLY"
            links.new(tail.outputs["Image"], shade.inputs["A"])
            # a dark wash at the corners, never a black border
            links.new(invert.outputs[0], shade.inputs["B"])
            tail = shade
        except (RuntimeError, TypeError, AttributeError, KeyError):
            pass

    image = tail.outputs["Image"]
    try:  # Blender 5: a compositor group ends in a group output socket
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        tree.links.new(image, tree.nodes.new("NodeGroupOutput").inputs[0])
    except (RuntimeError, TypeError, AttributeError):
        composite = tree.nodes.new("CompositorNodeComposite")
        tree.links.new(image, composite.inputs["Image"])


def _socket(socket, value):
    if socket is None:
        return
    try:
        socket.default_value = value
    except (TypeError, ValueError):
        pass


def _menu(socket, candidates):
    """Menu sockets take an identifier we cannot guess, so try until one sticks."""
    for candidate in candidates:
        try:
            socket.default_value = candidate
            return
        except (TypeError, ValueError, AttributeError):
            continue


def render(scene_id, out_dir, width=1600, height=900, samples=48, film=True):
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.cycles.samples = samples
    if film:
        try:
            grade()
        except (RuntimeError, TypeError, AttributeError) as error:
            print(f"[murmur] grade skipped: {error}")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{scene_id}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[murmur] rendered {path}")
    return path
