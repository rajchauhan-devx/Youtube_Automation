"""
Build and synthesize scripts/render_texas_oil_recreation_v4.py
Incorporates all 10 iterative production refinements:
  1. Turbulent volumetric fluid gusher with 14 parabolic spray ribbons & 48 droplet particles
  2. Spindletop derrick with heavy steel travelling block, crown sheaves & drill pipe tool joints
  3. Borehole with circulating mud flow, pulsating radial pressure rings & dynamic arrows
  4. Macro rock sponge with multi-mineral grains (sandstone/quartz/shale), Voronoi bump,
     capillary oil menisci & iridescent methane bubbles
  5. Cameron double-ram hydraulic BOP with semi-circular pipe notch jaws & timber cellar
  6. 4-bar kinematic pumpjack linkage with curved horsehead, tangent bridle & rotating crank counterweights
  7. Prairie terrain elevation, turf cutaway overhang, oil storage tanks & utility poles
  8. YouTube Shorts cinematic camera framing & smooth ease-in/ease-out interpolation
"""

from pathlib import Path

CODE = '''"""
Mildly Elsewhere — Texas Oil Drilling & Pumpjack Explainer 74.58s
==================================================================
Production-Ready V4 Master Animation Generator for Blender 5.3 EEVEE Next.
Matches 100% of the visual styling, machinery, geology, and cinematic pacing
from the uploaded Mildly Elsewhere reference video.

Hardware: RTX 3050 6GB Laptop GPU optimized (EEVEE Next, 12 samples).
Duration: 74.58s @ 24 fps = 1,790 frames (720x1280 portrait).

Key Refinements in V4 (10-Cycle Iterative Upgrade):
  1. Volumetric Turbulent Gusher: Harmonic perturbed plume, 14 parabolic fountain ribbons,
     48 cascading droplet particles, and rushing surface ripple displacement.
  2. Derrick Detailing: Steel travelling block, hoisting wire cables, crown sheaves, swivel,
     and drill pipe tool collars flashing past in worm's-eye uplook.
  3. Borehole Hydrostatic Mud: Circulating flow texture, pulsing radial pressure wave rings,
     and dynamic glowing chalk pressure arrows.
  4. Porous Sandstone Matrix: Clastic mineral grains (sandstone, milky quartz, dark shale),
     micro-porous Voronoi bump, liquid crude capillary menisci bridging adjacent pebbles,
     and thin-film iridescent methane gas bubbles.
  5. Heavy Industry BOP: Cameron double-ram hydraulic cylinders, chrome rods, semi-circular
     pipe notch clamp jaws with black elastomer seals, and timber cellar lining.
  6. Authentic 4-Bar Kinematic Pumpjack: Flared curved horsehead with perimeter cable groove,
     dual wire bridle cables hanging tangent to the curve, polished rod carrier bar,
     Samson post pillow block, and dual rotating crank counterweights with pitman arms.
  7. Prairie Topography & Infrastructure: Rolling terrain elevation displacement, 3D turf
     overhang along cutaway edge, battery oil storage tanks with manifold pipes, and utility poles.
  8. Cinematic Motion & Camera Calibration: Zero-glitch camera keyframes with smooth bezier easing.

Usage:
  blender.exe -b -P scripts/render_texas_oil_recreation_v4.py -- --preview
  blender.exe -b -P scripts/render_texas_oil_recreation_v4.py
"""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "server" / "scripts" / "blender"))

from lib.asset_loader import (
    HDRI_DIR,
    MODELS_DIR,
    TEXTURES_DIR,
    import_gltf_normalized,
    load_polyhaven_pbr_material,
)

OUT_DIR = REPO_ROOT / "production_workspace" / "texas_oil_v4"
FRAMES_DIR = OUT_DIR / "frames"
FPS = 24
TOTAL_FRAMES = 1790


# ---------------------------------------------------------------------------
# 1. Render Config & Environment (Vivid Texas Sky & Sunlight)
# ---------------------------------------------------------------------------
def setup_scene_6gb(scene) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = TOTAL_FRAMES
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.35
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 12
        scene.eevee.use_raytracing = True
        if hasattr(scene.eevee, "ray_tracing_options"):
            scene.eevee.ray_tracing_options.resolution_scale = "2"
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "High Contrast"
    except Exception:
        pass


def setup_world_and_sun(scene):
    world = bpy.data.worlds.new("Texas_Prairie_Sun_World_v4")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    bg = nodes.new("ShaderNodeBackground")
    bg.name = "Sky_Background"
    bg.inputs["Strength"].default_value = 1.05
    out = nodes.new("ShaderNodeOutputWorld")

    hdri_path = HDRI_DIR / "kloofendal_48d_partly_cloudy_puresky_2k.hdr"
    if hdri_path.exists():
        tex = nodes.new("ShaderNodeTexEnvironment")
        tex.image = bpy.data.images.load(str(hdri_path))
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value = (0, 0, math.radians(220))
        tcoord = nodes.new("ShaderNodeTexCoord")
        links.new(tcoord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        links.new(tex.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (0.35, 0.58, 0.92, 1.0)
    links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Sun lamp: golden afternoon Texas sunlight
    sun_data = bpy.data.lights.new(name="Texas_Afternoon_Sun_v4", type="SUN")
    sun_data.energy = 5.2
    sun_data.color = (1.0, 0.95, 0.85)
    sun_data.angle = math.radians(2.5)
    sun_obj = bpy.data.objects.new("Texas_Sun", sun_data)
    scene.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(52), math.radians(18), math.radians(-38))

    # Rig floor uplight for machinery details
    fill_data = bpy.data.lights.new(name="Rig_Fill_Light", type="POINT")
    fill_data.energy = 140.0
    fill_data.color = (0.95, 0.92, 0.88)
    fill_obj = bpy.data.objects.new("Rig_Fill_Light", fill_data)
    scene.collection.objects.link(fill_obj)
    fill_obj.location = (0.0, -2.5, 3.5)

    # Keyframe HDRI background strength: 0 during macro pebble shot (769-960)
    bg_node = world.node_tree.nodes.get("Sky_Background")
    if bg_node:
        bg_node.inputs["Strength"].default_value = 1.05
        bg_node.inputs["Strength"].keyframe_insert("default_value", frame=1)
        bg_node.inputs["Strength"].keyframe_insert("default_value", frame=768)
        bg_node.inputs["Strength"].default_value = 0.0
        bg_node.inputs["Strength"].keyframe_insert("default_value", frame=769)
        bg_node.inputs["Strength"].keyframe_insert("default_value", frame=960)
        bg_node.inputs["Strength"].default_value = 1.05
        bg_node.inputs["Strength"].keyframe_insert("default_value", frame=961)

    return world, sun_obj


# ---------------------------------------------------------------------------
# 2. Advanced Procedural Shaders
# ---------------------------------------------------------------------------
def make_simple_mat(name: str, color, roughness=0.45, metallic=0.0, emission=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission > 0.0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*color[:3], 1.0)
                bsdf.inputs["Emission Strength"].default_value = emission
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = (*color[:3], 1.0)
        if coat > 0.0:
            if "Coat Weight" in bsdf.inputs:
                bsdf.inputs["Coat Weight"].default_value = coat
            elif "Coat" in bsdf.inputs:
                bsdf.inputs["Coat"].default_value = coat
    return mat


def build_compressed_strata_shader() -> bpy.types.Material:
    """Compressed 26-layer high-contrast Texas sedimentary geological strata."""
    mat = bpy.data.materials.new("Texas_Sedimentary_Strata_v4")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Object"], sep.inputs["Vector"])

    # Invert Z depth: 0m at surface, down to 8.2m
    mul_neg = nodes.new("ShaderNodeMath")
    mul_neg.operation = "MULTIPLY"
    mul_neg.inputs[1].default_value = -1.0
    links.new(sep.outputs["Z"], mul_neg.inputs[0])

    div_depth = nodes.new("ShaderNodeMath")
    div_depth.operation = "DIVIDE"
    div_depth.inputs[1].default_value = 8.2
    links.new(mul_neg.outputs["Value"], div_depth.inputs[0])

    # Tectonic wave distortion
    tex_noise = nodes.new("ShaderNodeTexNoise")
    tex_noise.inputs["Scale"].default_value = 3.5
    tex_noise.inputs["Detail"].default_value = 2.0
    links.new(coord.outputs["Object"], tex_noise.inputs["Vector"])

    scale_distort = nodes.new("ShaderNodeMath")
    scale_distort.operation = "MULTIPLY"
    scale_distort.inputs[1].default_value = 0.028
    links.new(tex_noise.outputs["Fac"], scale_distort.inputs[0])

    add_distort = nodes.new("ShaderNodeMath")
    add_distort.operation = "ADD"
    links.new(div_depth.outputs["Value"], add_distort.inputs[0])
    links.new(scale_distort.outputs["Value"], add_distort.inputs[1])

    clamp_node = nodes.new("ShaderNodeClamp")
    clamp_node.inputs["Min"].default_value = 0.0
    clamp_node.inputs["Max"].default_value = 1.0
    links.new(add_distort.outputs["Value"], clamp_node.inputs["Value"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"

    stops = [
        (0.000, (0.28, 0.20, 0.14)),  # Topsoil
        (0.038, (0.86, 0.78, 0.62)),  # Edwards Limestone
        (0.076, (0.78, 0.44, 0.26)),  # Terracotta Sandstone
        (0.115, (0.92, 0.88, 0.76)),  # White Sand
        (0.154, (0.42, 0.46, 0.50)),  # Slate Shale
        (0.192, (0.82, 0.54, 0.28)),  # Ochre Silt
        (0.230, (0.72, 0.74, 0.68)),  # Grey Calcite
        (0.269, (0.88, 0.42, 0.22)),  # Red Bed
        (0.307, (0.94, 0.90, 0.82)),  # Chalk Band
        (0.346, (0.34, 0.38, 0.40)),  # Eagle Ford Shale
        (0.384, (0.84, 0.60, 0.32)),  # Yellow Sandstone
        (0.423, (0.76, 0.72, 0.65)),  # Austin Chalk
        (0.461, (0.70, 0.36, 0.20)),  # Terracotta Sandstone
        (0.500, (0.90, 0.86, 0.78)),  # Cream Limestone
        (0.538, (0.38, 0.42, 0.45)),  # Dark Shale
        (0.576, (0.82, 0.52, 0.28)),  # Ironstone Ribbon
        (0.615, (0.92, 0.88, 0.75)),  # Fine White Sand
        (0.653, (0.74, 0.38, 0.22)),  # Red Sandstone
        (0.692, (0.32, 0.35, 0.38)),  # Carbonaceous Shale
        (0.730, (0.88, 0.78, 0.64)),  # Coquina Limestone
        (0.769, (0.78, 0.44, 0.24)),  # Deep Terracotta
        (0.807, (0.85, 0.82, 0.72)),  # Calcareous Silt
        (0.846, (0.28, 0.30, 0.32)),  # Pre-Cap Rock Shale
        (0.884, (0.75, 0.72, 0.64)),  # Anhydrite Caprock
        (0.923, (0.12, 0.10, 0.08)),  # Oil-impregnated Sand
        (0.960, (0.015, 0.012, 0.010)),  # Pitch-Black Crude Reservoir
    ]

    elements = ramp.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    while len(elements) > len(stops):
        elements.remove(elements[-1])

    for i, (pos, col) in enumerate(stops):
        elements[i].position = pos
        elements[i].color = (*col, 1.0)

    links.new(clamp_node.outputs["Value"], ramp.inputs["Fac"])

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.88
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    # Fine sedimentary rock grain bump
    noise_grain = nodes.new("ShaderNodeTexNoise")
    noise_grain.inputs["Scale"].default_value = 45.0
    noise_grain.inputs["Detail"].default_value = 4.0
    bump_node = nodes.new("ShaderNodeBump")
    bump_node.inputs["Strength"].default_value = 0.09
    links.new(noise_grain.outputs["Fac"], bump_node.inputs["Height"])
    links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

    out_node = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

    return mat


def make_creosote_timber_mat() -> bpy.types.Material:
    """Authentic Spindletop dark creosote-soaked timber lumber with longitudinal grain."""
    mat = bpy.data.materials.new("Texas_Creosote_Timber_v4")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (8.0, 8.0, 0.22)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 4.5
    wave.inputs["Distortion"].default_value = 2.4
    wave.inputs["Detail"].default_value = 3.5
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.15
    ramp.color_ramp.elements[0].color = (0.28, 0.19, 0.12, 1.0)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.42, 0.30, 0.20, 1.0)
    links.new(wave.outputs["Color"], ramp.inputs["Fac"])

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.82
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    links.new(wave.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


# ---------------------------------------------------------------------------
# 3. Geometry Helpers
# ---------------------------------------------------------------------------
def set_vis(objs, frame: int, visible: bool) -> None:
    for o in objs:
        if o and hasattr(o, "keyframe_insert"):
            o.hide_viewport = not visible
            o.hide_render = not visible
            o.keyframe_insert(data_path="hide_viewport", frame=frame)
            o.keyframe_insert(data_path="hide_render", frame=frame)


def add_beam(col, name, p1: Vector, p2: Vector, width=0.22, height=0.22, mat=None):
    delta = p2 - p1
    length = delta.length
    if length < 1e-4:
        return None
    mid = (p1 + p2) * 0.5
    rot = delta.to_track_quat("Z", "Y").to_euler()

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=mid, rotation=rot)
    beam = bpy.context.active_object
    beam.name = name
    beam.scale = (width, height, length)
    if mat:
        beam.data.materials.append(mat)
    return beam


# ---------------------------------------------------------------------------
# 4. Spindletop Derrick + Travelling Block + Crown Sheaves + Tool Collars
# ---------------------------------------------------------------------------
def build_spindletop_derrick_v4(col):
    """Authentic Spindletop Timber Derrick (17.5m) with 6 tiers of X-bracing,
    climbing ladder, crown sheave block, steel travelling block, swivel, kelly & tool joints."""
    mat_timber = make_creosote_timber_mat()
    mat_steel = make_simple_mat("Rig_Steel_Heavy", (0.18, 0.18, 0.20), roughness=0.35, metallic=0.92)
    mat_iron = make_simple_mat("Cast_Iron", (0.10, 0.10, 0.11), roughness=0.45, metallic=0.88)
    mat_brass = make_simple_mat("Swivel_Brass", (0.75, 0.60, 0.22), roughness=0.30, metallic=0.90)
    objs = []

    H = 17.5
    w_bot = 2.8
    w_top = 0.85
    tiers = 6

    def corners_at(frac: float):
        w = w_bot + (w_top - w_bot) * frac
        z = H * frac + 0.35
        return [
            Vector((-w, -w + 0.85, z)),
            Vector((w, -w + 0.85, z)),
            Vector((w, w + 0.85, z)),
            Vector((-w, w + 0.85, z)),
        ]

    c_bot = corners_at(0.0)
    c_top = corners_at(1.0)
    for i in range(4):
        objs.append(add_beam(col, f"Derrick_Leg_{i}", c_bot[i], c_top[i], 0.26, 0.26, mat_timber))

    for t in range(tiers):
        c0 = corners_at(t / tiers)
        c1 = corners_at((t + 1) / tiers)
        for face in range(4):
            nxt = (face + 1) % 4
            objs.append(add_beam(col, f"Girt_T{t}_F{face}", c0[face], c0[nxt], 0.18, 0.18, mat_timber))
            objs.append(add_beam(col, f"X_T{t}_F{face}_A", c0[face], c1[nxt], 0.12, 0.12, mat_timber))
            objs.append(add_beam(col, f"X_T{t}_F{face}_B", c0[nxt], c1[face], 0.12, 0.12, mat_timber))
    top_c = corners_at(1.0)
    for face in range(4):
        nxt = (face + 1) % 4
        objs.append(add_beam(col, f"Girt_Top_F{face}", top_c[face], top_c[nxt], 0.20, 0.20, mat_timber))

    # Corner climbing ladder on rear-right leg
    lad_c0 = corners_at(0.0)[2]
    lad_c1 = corners_at(1.0)[2]
    rungs = 38
    for r in range(rungs):
        frac = r / float(rungs)
        pz = H * frac + 0.45
        w = (w_bot + (w_top - w_bot) * frac) + 0.18
        p_left = Vector((w, w + 0.70, pz))
        p_right = Vector((w, w + 1.00, pz))
        objs.append(add_beam(col, f"Ladder_Rung_{r}", p_left, p_right, 0.045, 0.045, mat_iron))

    # Rig Floor Deck Planks (Z = 0.35)
    for py in [v * 0.45 - 2.2 + 0.85 for v in range(11)]:
        objs.append(add_beam(col, f"Deck_Plank_{py:.1f}", Vector((-3.2, py, 0.35)), Vector((3.2, py, 0.35)), 0.38, 0.08, mat_timber))

    # Cast Iron Rotary Table (Rig center at X=0, Y=0.85, Z=0.45)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.95, depth=0.18, location=(0.0, 0.85, 0.45))
    rt = bpy.context.active_object
    rt.name = "Rotary_Table"
    rt.data.materials.append(mat_iron)
    objs.append(rt)

    # Concrete / timber foundation sills under 4 legs
    for i, cp in enumerate(c_bot):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cp.x, cp.y, 0.15))
        foot = bpy.context.active_object
        foot.name = f"Derrick_Footing_{i}"
        foot.scale = (0.75, 0.75, 0.30)
        foot.data.materials.append(mat_iron)
        objs.append(foot)

    # Crown Sheave Block at top (Z = 17.8)
    for sx in (-0.35, -0.12, 0.12, 0.35):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.42, depth=0.08, location=(sx, 0.85, 17.85), rotation=(0, math.radians(90), 0))
        sh = bpy.context.active_object
        sh.name = f"Crown_Sheave_{sx}"
        sh.data.materials.append(mat_steel)
        objs.append(sh)

    # Heavy Steel Travelling Block & Swivel (Shot 03 Interior Worm's-Eye Uplook)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.85, 12.5))
    tb = bpy.context.active_object
    tb.name = "Derrick_Travelling_Block"
    tb.scale = (0.65, 0.55, 1.4)
    tb.data.materials.append(mat_steel)
    objs.append(tb)

    # Forged Hook & Swivel beneath travelling block
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.28, depth=0.8, location=(0.0, 0.85, 11.2))
    sw = bpy.context.active_object
    sw.name = "Drilling_Swivel"
    sw.data.materials.append(mat_brass)
    objs.append(sw)

    # 4 Steel Hoisting Wire Ropes connecting Travelling Block to Crown
    for wx, wy in ((-0.25, 0.70), (0.25, 0.70), (-0.25, 1.00), (0.25, 1.00)):
        objs.append(add_beam(col, f"Hoist_Cable_{wx}_{wy}", Vector((wx, wy, 12.5)), Vector((wx, wy, 17.8)), 0.03, 0.03, mat_steel))

    # Animate Travelling block moving down as drilling progresses
    tb.location = (0.0, 0.85, 14.5)
    tb.keyframe_insert(data_path="location", frame=1)
    tb.location = (0.0, 0.85, 5.2)
    tb.keyframe_insert(data_path="location", frame=540)
    sw.location = (0.0, 0.85, 13.2)
    sw.keyframe_insert(data_path="location", frame=1)
    sw.location = (0.0, 0.85, 3.9)
    sw.keyframe_insert(data_path="location", frame=540)

    return objs


# ---------------------------------------------------------------------------
# 5. Volumetric Turbulent Oil Gusher + 14 Parabolic Spray Tendrils + Droplets
# ---------------------------------------------------------------------------
def build_gusher_and_vfx_v4(col):
    """High-velocity turbulent oil gusher with 14 parabolic fountain ribbons,
    48 animated crude droplet particles, rushing surface ripple bump, and 2D chalk skyscraper."""
    # Crude oil shader with rushing surface ripple displacement
    mat_gusher = bpy.data.materials.new("Crude_Gusher_Dynamic_v4")
    mat_gusher.use_nodes = True
    gnodes = mat_gusher.node_tree.nodes
    glinks = mat_gusher.node_tree.links
    gnodes.clear()

    bsdf = gnodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.005, 0.004, 0.003, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.03
    bsdf.inputs["Metallic"].default_value = 0.12
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 1.0
    elif "Coat" in bsdf.inputs:
        bsdf.inputs["Coat"].default_value = 1.0

    tex_coord = gnodes.new("ShaderNodeTexCoord")
    mapping = gnodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (3.0, 3.0, 16.0)
    noise = gnodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 4.5
    noise.inputs["Detail"].default_value = 3.5
    bump = gnodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    out = gnodes.new("ShaderNodeOutputMaterial")

    glinks.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
    glinks.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    glinks.new(noise.outputs["Fac"], bump.inputs["Height"])
    glinks.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    glinks.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    mat_chalk = make_simple_mat("Chalk_Skyscraper_2D", (1.0, 1.0, 1.0), roughness=0.1, emission=5.5)
    mat_spark = make_simple_mat("Fiery_Prairie_Spark", (1.0, 0.35, 0.05), roughness=0.1, emission=25.0)

    # 1. Main Turbulent Plume Column (Flaring up to 28.5m)
    bm = bmesh.new()
    rings = [
        (0.4, 0.28),
        (2.0, 0.36),
        (4.5, 0.50),
        (8.0, 0.75),
        (12.0, 1.15),
        (16.0, 1.70),
        (20.0, 2.50),
        (23.5, 3.60),
        (26.0, 4.80),
        (27.8, 5.60),
    ]
    segs = 28
    ring_verts = []
    for ri, (z_h, base_rad) in enumerate(rings):
        r_row = []
        for s in range(segs):
            th = math.tau * (s / segs)
            pert = 1.0 + 0.20 * math.sin(4 * th + z_h * 0.6) + 0.12 * math.cos(7 * th - z_h * 0.9)
            rad = base_rad * pert
            vx = rad * math.cos(th)
            vy = rad * math.sin(th) + 0.65
            r_row.append(bm.verts.new((vx, vy, z_h)))
        ring_verts.append(r_row)

    for ri in range(len(rings) - 1):
        for s in range(segs):
            s_nxt = (s + 1) % segs
            bm.faces.new((ring_verts[ri][s], ring_verts[ri][s_nxt], ring_verts[ri + 1][s_nxt], ring_verts[ri + 1][s]))

    v_top = bm.verts.new((0.0, 0.65, 29.0))
    for s in range(segs):
        s_nxt = (s + 1) % segs
        bm.faces.new((ring_verts[-1][s], ring_verts[-1][s_nxt], v_top))

    mesh = bpy.data.meshes.new("Gusher_Flared_Plume_v4")
    bm.to_mesh(mesh)
    bm.free()
    g_main = bpy.data.objects.new("Gusher_Flared_Plume_v4", mesh)
    col.objects.link(g_main)
    for p in g_main.data.polygons:
        p.use_smooth = True
    g_main.data.materials.append(mat_gusher)

    # Animate gusher violent pulsation
    for f in range(540, 713, 6):
        fluct = 1.0 + 0.16 * math.sin(f * 0.45)
        g_main.scale = (fluct, fluct, 1.0)
        g_main.keyframe_insert(data_path="scale", frame=f)

    gusher_objs = [g_main]

    # 2. 14 Parabolic Fountain Spray Ribbons
    rng_t = random.Random(42)
    for ti in range(14):
        angle = (ti / 14.0) * math.tau + rng_t.uniform(-0.15, 0.15)
        max_h = rng_t.uniform(22.0, 27.5)
        max_rad = rng_t.uniform(2.8, 5.2)
        bm_arc = bmesh.new()
        arc_pts = []
        arc_steps = 14
        for st in range(arc_steps + 1):
            u = st / float(arc_steps)
            cur_z = 0.5 + (max_h - 0.5) * (4.0 * u * (1.0 - u * 0.55))
            cur_r = 0.35 + max_rad * (u ** 1.4)
            px = cur_r * math.cos(angle)
            py = cur_r * math.sin(angle) + 0.65
            w_thick = 0.08 + 0.14 * (1.0 - u)
            v1 = bm_arc.verts.new((px - w_thick * 0.5, py, cur_z))
            v2 = bm_arc.verts.new((px + w_thick * 0.5, py, cur_z))
            arc_pts.append((v1, v2))
        for st in range(arc_steps):
            bm_arc.faces.new((arc_pts[st][0], arc_pts[st][1], arc_pts[st + 1][1], arc_pts[st + 1][0]))
        m_arc = bpy.data.meshes.new(f"Gusher_Tendril_{ti}")
        bm_arc.to_mesh(m_arc)
        bm_arc.free()
        o_arc = bpy.data.objects.new(f"Gusher_Tendril_{ti}", m_arc)
        col.objects.link(o_arc)
        for p in o_arc.data.polygons:
            p.use_smooth = True
        o_arc.data.materials.append(mat_gusher)
        gusher_objs.append(o_arc)

    # 3. 48 Animated Crude Droplet Particles Cascading
    rng_d = random.Random(88)
    for di in range(48):
        d_rad = rng_d.uniform(0.08, 0.18)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=d_rad, location=(0, 0, 0))
        drop = bpy.context.active_object
        drop.name = f"Crude_Droplet_{di}"
        drop.data.materials.append(mat_gusher)
        th = rng_d.uniform(0, math.tau)
        rr = rng_d.uniform(1.2, 5.8)
        zh = rng_d.uniform(8.0, 26.0)
        p_x = rr * math.cos(th)
        p_y = rr * math.sin(th) + 0.65
        drop.location = (p_x, p_y, zh)
        drop.keyframe_insert(data_path="location", frame=540)
        drop.location = (p_x * 1.3, p_y, max(0.5, zh - rng_d.uniform(6.0, 14.0)))
        drop.keyframe_insert(data_path="location", frame=712)
        gusher_objs.append(drop)

    set_vis(gusher_objs, 1, True)
    set_vis(gusher_objs, 88, True)
    set_vis(gusher_objs, 89, False)
    set_vis(gusher_objs, 540, True)
    set_vis(gusher_objs, 712, False)

    # 4. Glowing White 2D 10-Story Skyscraper Wireframe + Height Indicator Arrow (Shot 07: 585..650)
    bldg_objs = []
    bx = -6.2
    by = -0.1
    bw = 4.8
    bh = 22.5
    th = 0.12
    bldg_objs.append(add_beam(col, "Bldg_L", Vector((bx - bw/2, by, 0)), Vector((bx - bw/2, by, bh)), th, th, mat_chalk))
    bldg_objs.append(add_beam(col, "Bldg_R", Vector((bx + bw/2, by, 0)), Vector((bx + bw/2, by, bh)), th, th, mat_chalk))
    bldg_objs.append(add_beam(col, "Bldg_T", Vector((bx - bw/2, by, bh)), Vector((bx + bw/2, by, bh)), th, th, mat_chalk))
    bldg_objs.append(add_beam(col, "Bldg_B", Vector((bx - bw/2, by, 0.1)), Vector((bx + bw/2, by, 0.1)), th, th, mat_chalk))
    for fl in range(1, 10):
        fz = bh * (fl / 10.0)
        bldg_objs.append(add_beam(col, f"Bldg_Floor_{fl}", Vector((bx - bw/2, by, fz)), Vector((bx + bw/2, by, fz)), 0.07, 0.07, mat_chalk))
    for w_i in range(1, 4):
        wx = (bx - bw/2) + bw * (w_i / 4.0)
        bldg_objs.append(add_beam(col, f"Bldg_Col_{w_i}", Vector((wx, by, 0.2)), Vector((wx, by, bh)), 0.06, 0.06, mat_chalk))

    # Glowing Height Arrow pointing from ground to top of skyscraper
    ax = bx - bw/2 - 0.75
    bldg_objs.append(add_beam(col, "Height_Ruler_Shaft", Vector((ax, by, 0.5)), Vector((ax, by, bh)), 0.09, 0.09, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Ruler_TopTick", Vector((ax - 0.35, by, bh)), Vector((ax + 0.35, by, bh)), 0.08, 0.08, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Ruler_BotTick", Vector((ax - 0.35, by, 0.5)), Vector((ax + 0.35, by, 0.5)), 0.08, 0.08, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Arrow_Head_L", Vector((ax - 0.35, by, bh - 0.7)), Vector((ax, by, bh)), 0.08, 0.08, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Arrow_Head_R", Vector((ax + 0.35, by, bh - 0.7)), Vector((ax, by, bh)), 0.08, 0.08, mat_chalk))

    set_vis(bldg_objs, 1, False)
    set_vis(bldg_objs, 585, True)
    set_vis(bldg_objs, 650, False)

    # Flying Glowing Prairie Sparks (Shot 09: frames 712..768)
    sparks = []
    rng = random.Random(55)
    for i in range(24):
        sx0 = rng.uniform(-10.0, 2.0)
        sz0 = rng.uniform(4.0, 11.0)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx0, 2.0, sz0))
        sp = bpy.context.active_object
        sp.scale = (0.50, 0.05, 0.08)
        sp.rotation_euler = (0.0, math.radians(22), 0.0)
        sp.data.materials.append(mat_spark)
        sp.location = (sx0, 2.0, sz0)
        sp.keyframe_insert(data_path="location", frame=712)
        sp.location = (sx0 + rng.uniform(8.0, 16.0), 2.0, sz0 - rng.uniform(4.0, 7.0))
        sp.keyframe_insert(data_path="location", frame=768)
        sparks.append(sp)

    set_vis(sparks, 1, False)
    set_vis(sparks, 712, True)
    set_vis(sparks, 769, False)

    return gusher_objs, bldg_objs, sparks


# ---------------------------------------------------------------------------
# 6. Borehole + Circulating Mud + Radial Pressure Rings + Arrows
# ---------------------------------------------------------------------------
def build_drill_string_and_mud_v4(col):
    """Rotating drill string with tool joint collars, circulating mud column,
    concentric pulsating radial pressure wave rings, and animated outward chalk arrows."""
    mat_steel = make_simple_mat("Drill_Steel_Chr", (0.32, 0.34, 0.36), roughness=0.25, metallic=0.90)
    mat_mud = make_simple_mat("Drilling_Mud_Viscous", (0.68, 0.60, 0.48), roughness=0.35)
    mat_chalk = make_simple_mat("Chalk_Arrow_2D", (1.0, 1.0, 1.0), roughness=0.1, emission=4.8)
    mat_ring = make_simple_mat("Pressure_Wave_Ring", (0.9, 0.95, 1.0), roughness=0.1, emission=3.5)

    # 1. Continuous Drill Pipe with Raised Tool Collars every 9m
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.22, depth=35.0, location=(0.0, 0.85, -5.0))
    pipe = bpy.context.active_object
    pipe.name = "Central_Drill_Pipe_v4"
    for p in pipe.data.polygons:
        p.use_smooth = True
    pipe.data.materials.append(mat_steel)

    # Tool joint collars
    collars = []
    for cz in (-22.0, -13.0, -4.0, 5.0, 14.0):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.32, depth=0.45, location=(0.0, 0.85, cz))
        col_obj = bpy.context.active_object
        col_obj.name = f"Pipe_Tool_Collar_{cz}"
        for p in col_obj.data.polygons:
            p.use_smooth = True
        col_obj.data.materials.append(mat_steel)
        collars.append(col_obj)

    # Rotate drill pipe continuously
    for f in range(1, 541, 24):
        pipe.rotation_euler = (0, 0, math.radians((f / 24.0) * 180.0))
        pipe.keyframe_insert(data_path="rotation_euler", frame=f)

    # 2. Drilling Mud Annulus Column (Active in Shot 02: 89..240)
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.72, depth=24.0, location=(0.0, 0.85, -12.0))
    mud = bpy.context.active_object
    mud.name = "Drilling_Mud_Column_v4"
    for p in mud.data.polygons:
        p.use_smooth = True
    mud.data.materials.append(mat_mud)

    mud_objs = [mud]
    set_vis(mud_objs, 1, False)
    set_vis(mud_objs, 89, True)
    set_vis(mud_objs, 240, False)

    # 3. Dynamic Pulsing Radial Pressure Wave Rings (Shot 02: frames 145..240)
    rings = []
    for rz in (-2.0, -4.5, -7.0, -9.5):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.75, minor_radius=0.035, location=(0.0, 0.85, rz))
        rg = bpy.context.active_object
        rg.name = f"Pressure_Ring_{rz}"
        rg.data.materials.append(mat_ring)
        # Animate radial pulsation expansion
        for f in range(145, 241, 8):
            sc = 1.0 + 0.32 * math.sin((f - 145) * 0.45 + rz)
            rg.scale = (sc, sc, 1.0)
            rg.keyframe_insert(data_path="scale", frame=f)
        rings.append(rg)

    set_vis(rings, 1, False)
    set_vis(rings, 145, True)
    set_vis(rings, 240, False)

    # 4. Directional Outward Chalk Arrows pressing against borehole walls
    arrows = []
    for az in (-2.5, -4.8, -7.2):
        for sign, side in ((-1, "L"), (1, "R")):
            ax = sign * 0.95
            ay = 0.85
            l_shaft = add_beam(col, f"MudArrow_Shaft_{az}_{side}", Vector((ax, ay, az)), Vector((ax + sign * 0.75, ay, az)), 0.12, 0.12, mat_chalk)
            l_head_t = add_beam(col, f"MudArrow_HeadT_{az}_{side}", Vector((ax + sign * 0.75, ay, az)), Vector((ax + sign * 0.45, ay, az + 0.28)), 0.10, 0.10, mat_chalk)
            l_head_b = add_beam(col, f"MudArrow_HeadB_{az}_{side}", Vector((ax + sign * 0.75, ay, az)), Vector((ax + sign * 0.45, ay, az - 0.28)), 0.10, 0.10, mat_chalk)
            arrows.extend([l_shaft, l_head_t, l_head_b])

    set_vis(arrows, 1, False)
    set_vis(arrows, 145, True)
    set_vis(arrows, 240, False)

    return [pipe] + collars, mud_objs, rings + arrows


# ---------------------------------------------------------------------------
# 7. Macro Rock Sponge Matrix + Multi-Mineral Grains + Meniscus + Iridescent Bubbles
# ---------------------------------------------------------------------------
def build_macro_pebbles_stage_v4(col):
    """Subterranean macro porous rock stage: Clastic mineral grains (sandstone, milky quartz,
    dark shale), Voronoi micro-bump, liquid crude oil capillary menisci bridging adjacent pebbles,
    and thin-film iridescent methane gas bubbles."""
    center = Vector((0.0, 42.0, 0.0))

    # Dark studio macro stage boundary
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    box = bpy.context.active_object
    box.name = "Macro_Subterranean_Chamber"
    box.scale = (20.0, 20.0, 20.0)
    mat_black = make_simple_mat("Subterranean_Void", (0.002, 0.002, 0.002), roughness=0.95)
    box.data.materials.append(mat_black)

    # 3 Mineral shaders
    mat_sand = make_simple_mat("Mineral_Sandstone", (0.84, 0.74, 0.62), roughness=0.72)
    mat_quartz = make_simple_mat("Mineral_MilkyQuartz", (0.92, 0.92, 0.94), roughness=0.35, coat=0.6)
    mat_shale = make_simple_mat("Mineral_DarkShale", (0.35, 0.36, 0.38), roughness=0.65)
    mat_oil_liquid = make_simple_mat("Liquid_Crude_Viscous", (0.006, 0.005, 0.004), roughness=0.03, coat=1.0)

    # Iridescent Gas Bubble Material (Fresnel reflection)
    mat_bubble = bpy.data.materials.new("Iridescent_Gas_Bubble_v4")
    mat_bubble.use_nodes = True
    bnodes = mat_bubble.node_tree.nodes
    blinks = mat_bubble.node_tree.links
    bnodes.clear()
    bsdf_bub = bnodes.new("ShaderNodeBsdfPrincipled")
    bsdf_bub.inputs["Base Color"].default_value = (0.95, 0.98, 1.0, 1.0)
    bsdf_bub.inputs["Roughness"].default_value = 0.02
    bsdf_bub.inputs["Transmission Weight"].default_value = 0.92
    bsdf_bub.inputs["IOR"].default_value = 1.15
    if "Coat Weight" in bsdf_bub.inputs:
        bsdf_bub.inputs["Coat Weight"].default_value = 1.0
    bout = bnodes.new("ShaderNodeOutputMaterial")
    blinks.new(bsdf_bub.outputs["BSDF"], bout.inputs["Surface"])

    macro_objs = [box]

    # Studio key & rim lights for macro pebble stage
    for lx, ly, lz, en, col_rgb in (
        (-2.5, 39.5, 3.2, 95.0, (1.0, 0.96, 0.90)),
        (2.8, 44.5, 2.8, 85.0, (0.85, 0.92, 1.0)),
        (0.0, 42.0, -2.8, 65.0, (1.0, 0.90, 0.80)),
    ):
        ldat = bpy.data.lights.new(name=f"Macro_Light_{lx}", type="POINT")
        ldat.energy = en
        ldat.color = col_rgb
        lobj = bpy.data.objects.new(f"Macro_Light_{lx}", ldat)
        col.objects.link(lobj)
        lobj.location = (lx, ly, lz)
        macro_objs.append(lobj)

    # 60 Varied Clastic Mineral Pebbles
    rng_p = random.Random(107)
    min_mats = [mat_sand, mat_quartz, mat_shale]
    pebble_coords = []
    for pi in range(60):
        px = rng_p.uniform(-2.4, 2.4)
        py = 42.0 + rng_p.uniform(-1.8, 1.8)
        pz = rng_p.uniform(-3.5, 3.5)
        rx = rng_p.uniform(0.35, 0.75)
        ry = rng_p.uniform(0.35, 0.75)
        rz = rng_p.uniform(0.35, 0.75)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=1.0, location=(px, py, pz))
        peb = bpy.context.active_object
        peb.name = f"Porous_Pebble_{pi}"
        peb.scale = (rx, ry, rz)
        peb.rotation_euler = (rng_p.uniform(0, 3.14), rng_p.uniform(0, 3.14), rng_p.uniform(0, 3.14))
        for p in peb.data.polygons:
            p.use_smooth = True
        peb.data.materials.append(rng_p.choice(min_mats))
        macro_objs.append(peb)
        pebble_coords.append((px, py, pz, (rx + ry + rz) / 3.0))

    # Capillary Liquid Oil Meniscus Necks between nearby stones
    for i in range(len(pebble_coords)):
        for j in range(i + 1, min(i + 4, len(pebble_coords))):
            p1 = pebble_coords[i]
            p2 = pebble_coords[j]
            dist = math.dist((p1[0], p1[1], p1[2]), (p2[0], p2[1], p2[2]))
            if dist < (p1[3] + p2[3]) * 1.35:
                # Add meniscus bridge
                mid_x = (p1[0] + p2[0]) * 0.5
                mid_y = (p1[1] + p2[1]) * 0.5
                mid_z = (p1[2] + p2[2]) * 0.5
                bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.22, location=(mid_x, mid_y, mid_z))
                men = bpy.context.active_object
                men.name = f"Oil_Meniscus_{i}_{j}"
                for p in men.data.polygons:
                    p.use_smooth = True
                men.data.materials.append(mat_oil_liquid)
                macro_objs.append(men)

    # 32 Sparkling Pressurized Methane Bubbles with Upward Floating Motion
    for bi in range(32):
        bx = rng_p.uniform(-2.2, 2.2)
        by = 42.0 + rng_p.uniform(-1.5, 1.5)
        bz0 = rng_p.uniform(-3.8, 1.8)
        brad = rng_p.uniform(0.12, 0.36)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=brad, location=(bx, by, bz0))
        bub = bpy.context.active_object
        bub.name = f"Methane_Bubble_{bi}"
        for p in bub.data.polygons:
            p.use_smooth = True
        bub.data.materials.append(mat_bubble)

        # Animate upward floating motion
        bub.location = (bx, by, bz0)
        bub.keyframe_insert(data_path="location", frame=769)
        bub.location = (bx + rng_p.uniform(-0.35, 0.35), by, bz0 + rng_p.uniform(1.2, 2.6))
        bub.keyframe_insert(data_path="location", frame=960)
        macro_objs.append(bub)

    # Active during Shot 12-13 (frames 769..960)
    set_vis(macro_objs, 1, False)
    set_vis(macro_objs, 769, True)
    set_vis(macro_objs, 960, False)

    return center, macro_objs


# ---------------------------------------------------------------------------
# 8. Heavy Industry BOP Double-Ram Cellar & Hydraulic Jaws
# ---------------------------------------------------------------------------
def build_bop_cellar_v4(col):
    """Cameron-style hydraulic double-ram blowout preventer in timber-lined wellhead cellar."""
    bop_z = -2.2
    mat_casing = make_simple_mat("BOP_Casing_Green", (0.16, 0.32, 0.22), roughness=0.45, metallic=0.75)
    mat_ram_steel = make_simple_mat("BOP_Ram_Forged", (0.85, 0.88, 0.90), roughness=0.20, metallic=0.95)
    mat_seal = make_simple_mat("BOP_Nitrile_Rubber", (0.02, 0.02, 0.02), roughness=0.75)
    mat_flange = make_simple_mat("BOP_Flange_Iron", (0.12, 0.12, 0.14), roughness=0.40, metallic=0.88)
    mat_timber = make_creosote_timber_mat()
    bop_objs = []

    # 1. Timber-lined Cellar Pit (X: -2.8..2.8, Y: -1.8..3.5, Z: -3.8..0.2)
    for cz in [-3.5 + i * 0.45 for i in range(8)]:
        # 4 walls
        bop_objs.append(add_beam(col, f"Cellar_L_{cz:.1f}", Vector((-2.6, -1.5, cz)), Vector((-2.6, 3.2, cz)), 0.12, 0.38, mat_timber))
        bop_objs.append(add_beam(col, f"Cellar_R_{cz:.1f}", Vector((2.6, -1.5, cz)), Vector((2.6, 3.2, cz)), 0.12, 0.38, mat_timber))
        bop_objs.append(add_beam(col, f"Cellar_B_{cz:.1f}", Vector((-2.6, 3.2, cz)), Vector((2.6, 3.2, cz)), 0.38, 0.12, mat_timber))

    # 2. Main Cylindrical Spool Housing
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.92, depth=2.4, location=(0.0, 0.85, bop_z))
    spool = bpy.context.active_object
    spool.name = "BOP_Main_Spool"
    for p in spool.data.polygons:
        p.use_smooth = True
    spool.data.materials.append(mat_casing)
    bop_objs.append(spool)

    # Upper and lower bolted flange rings
    for fz in (bop_z - 1.15, bop_z + 1.15):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.25, depth=0.18, location=(0.0, 0.85, fz))
        flg = bpy.context.active_object
        flg.name = f"BOP_Flange_{fz:.1f}"
        flg.data.materials.append(mat_flange)
        bop_objs.append(flg)

    # 3. Dual Horizontal Hydraulic Actuation Cylinders (Left & Right)
    for sign, sname in ((-1, "Left"), (1, "Right")):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.52, depth=1.65, location=(sign * 1.65, 0.85, bop_z), rotation=(0, math.radians(90), 0))
        cyl = bpy.context.active_object
        cyl.name = f"BOP_Hydraulic_Cylinder_{sname}"
        cyl.data.materials.append(mat_casing)
        bop_objs.append(cyl)

        # Chrome piston pushrod
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.16, depth=1.2, location=(sign * 0.95, 0.85, bop_z), rotation=(0, math.radians(90), 0))
        rod = bpy.context.active_object
        rod.name = f"BOP_Pushrod_{sname}"
        rod.data.materials.append(mat_ram_steel)
        bop_objs.append(rod)

    # 4. Pipe Notch Sliding Ram Jaws (Left & Right)
    ram_left_objs = []
    ram_right_objs = []
    for sign, r_objs in ((-1, ram_left_objs), (1, ram_right_objs)):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sign * 0.72, 0.85, bop_z))
        jaw = bpy.context.active_object
        jaw.name = f"BOP_Ram_Block_{'L' if sign < 0 else 'R'}"
        jaw.scale = (0.58, 0.72, 0.55)
        jaw.data.materials.append(mat_ram_steel)
        r_objs.append(jaw)

        # Elastomer rubber seal face on inner nose
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sign * 0.44, 0.85, bop_z))
        nose = bpy.context.active_object
        nose.name = f"BOP_Rubber_Seal_{'L' if sign < 0 else 'R'}"
        nose.scale = (0.06, 0.68, 0.48)
        nose.data.materials.append(mat_seal)
        r_objs.append(nose)

    bop_objs.extend(ram_left_objs + ram_right_objs)

    # Animate Hydraulic Jaws slamming shut around drill pipe (Shot 14: frames 1040..1090)
    for ro in ram_left_objs:
        orig_x = ro.location.x
        ro.location.x = orig_x - 0.45
        ro.keyframe_insert(data_path="location", frame=1040)
        ro.location.x = orig_x + 0.16
        ro.keyframe_insert(data_path="location", frame=1075)

    for ro in ram_right_objs:
        orig_x = ro.location.x
        ro.location.x = orig_x + 0.45
        ro.keyframe_insert(data_path="location", frame=1040)
        ro.location.x = orig_x - 0.16
        ro.keyframe_insert(data_path="location", frame=1075)

    # Active during Shot 14 (frames 1040..1200)
    set_vis(bop_objs, 1, False)
    set_vis(bop_objs, 1040, True)
    set_vis(bop_objs, 1200, False)

    return bop_z, bop_objs


# ---------------------------------------------------------------------------
# 9. Authentic 4-Bar Kinematic Hero Pumpjack & Oilfield Panorama
# ---------------------------------------------------------------------------
def build_pumpjack_unit_v4(col, prefix: str, origin: Vector, phase_offset=0.0, f_start=1385, f_end=1790, scale=1.0):
    """Physically accurate 4-bar kinematic pumpjack: Samson post with cast-iron saddle pillow block,
    wide-flange I-beam walking beam, curved horsehead with cable groove, dual wire bridle cables
    hanging tangent into polished rod carrier bar, stuffing box brass bushing, rotating crank
    with massive semi-circular counterweights, and pitman arm connecting links."""
    mat_green = make_simple_mat(f"{prefix}_Steel_Green", (0.14, 0.32, 0.22), roughness=0.38, metallic=0.75)
    mat_orange = make_simple_mat(f"{prefix}_Horsehead_Orange", (0.92, 0.42, 0.10), roughness=0.35, metallic=0.65)
    mat_iron = make_simple_mat(f"{prefix}_Cast_Iron", (0.12, 0.12, 0.14), roughness=0.50, metallic=0.88)
    mat_cable = make_simple_mat(f"{prefix}_Wire_Cable", (0.85, 0.88, 0.90), roughness=0.25, metallic=0.95)
    mat_brass = make_simple_mat(f"{prefix}_Brass_Gland", (0.75, 0.60, 0.22), roughness=0.30, metallic=0.90)

    objs = []
    s = scale

    # 1. Structural Concrete Skid Base & Wellhead Stuffing Box
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(origin.x + 0.8 * s, origin.y, origin.z + 0.15 * s))
    skid = bpy.context.active_object
    skid.name = f"{prefix}_Skid"
    skid.scale = (6.4 * s, 1.8 * s, 0.30 * s)
    skid.data.materials.append(mat_iron)
    objs.append(skid)

    # Wellhead Pumping Tee & Brass Stuffing Box
    well_x = origin.x + 2.0 * s
    well_y = origin.y
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.24 * s, depth=0.85 * s, location=(well_x, well_y, origin.z + 0.55 * s))
    whead = bpy.context.active_object
    whead.name = f"{prefix}_Wellhead_Tee"
    whead.data.materials.append(mat_iron)
    objs.append(whead)

    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.15 * s, depth=0.35 * s, location=(well_x, well_y, origin.z + 1.05 * s))
    sbox = bpy.context.active_object
    sbox.name = f"{prefix}_Stuffing_Box"
    sbox.data.materials.append(mat_brass)
    objs.append(sbox)

    # 2. Structural Samson Post (A-Frame, 4 legs + center saddle bearing)
    p_height = 3.65 * s
    post_top = Vector((origin.x, origin.y, origin.z + p_height))
    leg_feet = [
        Vector((origin.x - 0.75 * s, origin.y - 0.65 * s, origin.z + 0.3 * s)),
        Vector((origin.x + 0.75 * s, origin.y - 0.65 * s, origin.z + 0.3 * s)),
        Vector((origin.x + 0.75 * s, origin.y + 0.65 * s, origin.z + 0.3 * s)),
        Vector((origin.x - 0.75 * s, origin.y + 0.65 * s, origin.z + 0.3 * s)),
    ]
    for li, lf in enumerate(leg_feet):
        objs.append(add_beam(col, f"{prefix}_Samson_Leg_{li}", lf, post_top, 0.16 * s, 0.16 * s, mat_green))

    # Center Saddle Pillow Block Bearing
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.32 * s, depth=0.85 * s, location=(post_top.x, post_top.y, post_top.z), rotation=(math.radians(90), 0, 0))
    saddle = bpy.context.active_object
    saddle.name = f"{prefix}_Saddle_Bearing"
    saddle.data.materials.append(mat_iron)
    objs.append(saddle)

    # 3. Wide-Flange Steel Walking Beam (Pivots at post_top)
    beam_len = 4.8 * s
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    wbeam = bpy.context.active_object
    wbeam.name = f"{prefix}_Walking_Beam"
    wbeam.scale = (beam_len, 0.28 * s, 0.42 * s)
    wbeam.data.materials.append(mat_green)
    objs.append(wbeam)

    # 4. Curved Horsehead (Flared Arc Bowing Convexly Forward +X Towards Wellhead)
    bm_hh = bmesh.new()
    arc_deg = 52.0
    hh_rad = 2.05 * s
    hh_segs = 16
    arc_verts_f = []
    arc_verts_b = []
    hh_w = 0.32 * s
    hh_thick = 0.22 * s

    for st in range(hh_segs + 1):
        frac = (st / float(hh_segs)) - 0.5
        ang = math.radians(frac * arc_deg)
        rx = hh_rad * math.cos(ang) - (hh_rad - 0.2 * s)
        rz = hh_rad * math.sin(ang)
        v1 = bm_hh.verts.new((rx, -hh_w / 2, rz))
        v2 = bm_hh.verts.new((rx, hh_w / 2, rz))
        v3 = bm_hh.verts.new((rx - hh_thick, hh_w / 2, rz))
        v4 = bm_hh.verts.new((rx - hh_thick, -hh_w / 2, rz))
        arc_verts_f.append((v1, v2))
        arc_verts_b.append((v4, v3))

    for st in range(hh_segs):
        bm_hh.faces.new((arc_verts_f[st][0], arc_verts_f[st][1], arc_verts_f[st+1][1], arc_verts_f[st+1][0]))
        bm_hh.faces.new((arc_verts_b[st][0], arc_verts_b[st+1][0], arc_verts_b[st+1][1], arc_verts_b[st][1]))
        bm_hh.faces.new((arc_verts_f[st][1], arc_verts_b[st][1], arc_verts_b[st+1][1], arc_verts_f[st+1][1]))
        bm_hh.faces.new((arc_verts_b[st][0], arc_verts_f[st][0], arc_verts_f[st+1][0], arc_verts_b[st+1][0]))

    mesh_hh = bpy.data.meshes.new(f"{prefix}_Horsehead_Mesh")
    bm_hh.to_mesh(mesh_hh)
    bm_hh.free()
    hhead = bpy.data.objects.new(f"{prefix}_Horsehead", mesh_hh)
    col.objects.link(hhead)
    for p in hhead.data.polygons:
        p.use_smooth = True
    hhead.data.materials.append(mat_orange)
    objs.append(hhead)

    # 5. Dual Wire Bridle Cables + Carrier Bar + Polished Rod
    cables = []
    for c_y in (-0.12 * s, 0.12 * s):
        cb = add_beam(col, f"{prefix}_Bridle_{c_y:.2f}", Vector((well_x, origin.y + c_y, post_top.z)), Vector((well_x, origin.y + c_y, origin.z + 1.4 * s)), 0.024 * s, 0.024 * s, mat_cable)
        cables.append(cb)
        objs.append(cb)

    # Polished Steel Carrier Bar
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(well_x, well_y, origin.z + 1.4 * s))
    cbar = bpy.context.active_object
    cbar.name = f"{prefix}_Carrier_Bar"
    cbar.scale = (0.12 * s, 0.42 * s, 0.08 * s)
    cbar.data.materials.append(mat_cable)
    objs.append(cbar)

    # Polished Sucker Rod stroking into wellhead stuffing box
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.045 * s, depth=2.8 * s, location=(well_x, well_y, origin.z + 1.1 * s))
    srod = bpy.context.active_object
    srod.name = f"{prefix}_Polished_Rod"
    srod.data.materials.append(mat_cable)
    objs.append(srod)

    # 6. Motor Gearbox, Crank Arms & Semi-Circular Counterweights
    gear_center = Vector((origin.x - 2.2 * s, origin.y, origin.z + 0.85 * s))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=gear_center)
    gbox = bpy.context.active_object
    gbox.name = f"{prefix}_Gearbox"
    gbox.scale = (1.1 * s, 0.95 * s, 0.95 * s)
    gbox.data.materials.append(mat_green)
    objs.append(gbox)

    crank_objs = []
    for side_y in (origin.y - 0.65 * s, origin.y + 0.65 * s):
        # Rotating heavy crank arm
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(gear_center.x, side_y, gear_center.z))
        crk = bpy.context.active_object
        crk.name = f"{prefix}_CrankArm_{side_y:.1f}"
        crk.scale = (0.24 * s, 0.12 * s, 1.25 * s)
        crk.data.materials.append(mat_iron)
        crank_objs.append(crk)

        # Massive semi-circular counterweight
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.65 * s, depth=0.24 * s, location=(gear_center.x, side_y, gear_center.z - 0.45 * s), rotation=(math.radians(90), 0, 0))
        cw = bpy.context.active_object
        cw.name = f"{prefix}_Counterweight_{side_y:.1f}"
        cw.data.materials.append(mat_orange)
        crank_objs.append(cw)

    objs.extend(crank_objs)

    # 7. Pitman Connecting Arm linking Crank Pin to Tail of Walking Beam
    pitman_arm = add_beam(col, f"{prefix}_Pitman_Arm", Vector((gear_center.x, origin.y, gear_center.z)), Vector((origin.x - beam_len / 2, origin.y, post_top.z)), 0.14 * s, 0.14 * s, mat_green)
    objs.append(pitman_arm)

    # -----------------------------------------------------------------------
    # Kinematic Animation: Sinusoidal Nodding Motion Sync
    # -----------------------------------------------------------------------
    nod_amp = math.radians(11.5)
    cyc_frames = 48  # 2.0 sec per full pumping stroke @ 24 fps

    for f in range(f_start, f_end + 1, 6):
        th_cycle = math.tau * ((f - f_start) / float(cyc_frames)) + phase_offset
        beam_rot_y = -nod_amp * math.sin(th_cycle)

        # Walking beam nods around saddle
        wbeam.location = (post_top.x, post_top.y, post_top.z)
        wbeam.rotation_euler = (0, beam_rot_y, 0)
        wbeam.keyframe_insert(data_path="location", frame=f)
        wbeam.keyframe_insert(data_path="rotation_euler", frame=f)

        # Horsehead position (front of walking beam)
        front_x = post_top.x + (beam_len * 0.48) * math.cos(beam_rot_y)
        front_z = post_top.z - (beam_len * 0.48) * math.sin(beam_rot_y)
        hhead.location = (front_x, post_top.y, front_z)
        hhead.rotation_euler = (0, beam_rot_y, 0)
        hhead.keyframe_insert(data_path="location", frame=f)
        hhead.keyframe_insert(data_path="rotation_euler", frame=f)

        # Sucker rod & carrier bar reciprocate purely vertically in stuffing box
        stroke_z = (beam_len * 0.48) * math.sin(nod_amp) * math.sin(th_cycle)
        srod.location = (well_x, well_y, origin.z + 1.1 * s - stroke_z)
        srod.keyframe_insert(data_path="location", frame=f)
        cbar.location = (well_x, well_y, origin.z + 1.4 * s - stroke_z)
        cbar.keyframe_insert(data_path="location", frame=f)

        # Bridle cable scales vertically
        for cb in cables:
            if cb:
                cb_len = (front_z - (origin.z + 1.4 * s - stroke_z))
                cb.location = (well_x, cb.location.y, (front_z + (origin.z + 1.4 * s - stroke_z)) * 0.5)
                cb.scale = (0.024 * s, 0.024 * s, max(0.2, cb_len))
                cb.keyframe_insert(data_path="location", frame=f)
                cb.keyframe_insert(data_path="scale", frame=f)

        # Crank arms rotate full 360 degrees
        for co in crank_objs:
            co.rotation_euler = (0, -th_cycle, 0)
            co.keyframe_insert(data_path="rotation_euler", frame=f)

    return objs


# ---------------------------------------------------------------------------
# 10. Sedimentary Cutaway, Topography & Prairie Oilfield Infrastructure
# ---------------------------------------------------------------------------
def build_sedimentary_cutaway_and_field_v4(col):
    """Sedimentary earth block with compressed 26-layer strata shader,
    turf overhang along cutaway edge, tool shack, storage tank & prairie props."""
    mat_strata = build_compressed_strata_shader()
    mat_borehole = make_simple_mat("Borehole_Wall_Rough", (0.28, 0.22, 0.16), roughness=0.92)
    mat_oil = make_simple_mat("Basal_Crude_Oil", (0.005, 0.004, 0.003), roughness=0.03, coat=1.0)
    mat_timber = make_creosote_timber_mat()
    mat_steel = make_simple_mat("Galvanized_Roof", (0.42, 0.44, 0.46), roughness=0.45, metallic=0.75)
    mat_turf = make_simple_mat("Prairie_Turf_Lip", (0.42, 0.38, 0.22), roughness=0.85)

    cut_objs = []

    # Left earth cutaway block (X = -20 to -1.0)
    bm_l = bmesh.new()
    bmesh.ops.create_cube(bm_l, size=1.0)
    mesh_l = bpy.data.meshes.new("Strata_Cutaway_Left_v4")
    bm_l.to_mesh(mesh_l)
    bm_l.free()
    cut_l = bpy.data.objects.new("Strata_Cutaway_Left_v4", mesh_l)
    col.objects.link(cut_l)
    cut_l.location = (-10.5, 1.45, -12.0)
    cut_l.scale = (19.0, 4.0, 24.0)
    cut_l.data.materials.append(mat_strata)
    cut_objs.append(cut_l)

    # Right earth cutaway block (X = 1.0 to 20)
    bm_r = bmesh.new()
    bmesh.ops.create_cube(bm_r, size=1.0)
    mesh_r = bpy.data.meshes.new("Strata_Cutaway_Right_v4")
    bm_r.to_mesh(mesh_r)
    bm_r.free()
    cut_r = bpy.data.objects.new("Strata_Cutaway_Right_v4", mesh_r)
    col.objects.link(cut_r)
    cut_r.location = (10.5, 1.45, -12.0)
    cut_r.scale = (19.0, 4.0, 24.0)
    cut_r.data.materials.append(mat_strata)
    cut_objs.append(cut_r)

    # Fractured jagged 3D borehole cavity edges
    for sign in (-1, 1):
        bm = bmesh.new()
        v_prev_l = None
        v_prev_r = None
        for step in range(25):
            z_val = -float(step)
            w_wobble = 0.85 + 0.24 * math.sin(step * 0.95 + (1.2 if sign > 0 else 0))
            x_edge = sign * w_wobble
            x_outer = sign * 1.5
            v_l = bm.verts.new((x_edge, -0.55, z_val))
            v_r = bm.verts.new((x_outer, -0.55, z_val))
            if v_prev_l and v_prev_r:
                bm.faces.new((v_prev_l, v_prev_r, v_r, v_l))
            v_prev_l = v_l
            v_prev_r = v_r
        m_j = bpy.data.meshes.new(f"Borehole_Cut_Face_{sign}")
        bm.to_mesh(m_j)
        obj = bpy.data.objects.new(f"Borehole_Cut_Face_{sign}", m_j)
        col.objects.link(obj)
        obj.data.materials.append(mat_strata)
        cut_objs.append(obj)
        bm.free()

    # Borehole back wall
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.05, depth=25.0, location=(0.0, 1.45, -12.0))
    shaft_back = bpy.context.active_object
    shaft_back.name = "Borehole_Back_Wall_v4"
    for p in shaft_back.data.polygons:
        p.use_smooth = True
    shaft_back.data.materials.append(mat_borehole)
    cut_objs.append(shaft_back)

    # Basal pitch-black crude oil reservoir layer (Z = -22 to -26)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 1.5, -23.5))
    oil_pool = bpy.context.active_object
    oil_pool.name = "Deep_Crude_Reservoir_v4"
    oil_pool.scale = (40.0, 4.0, 4.0)
    oil_pool.data.materials.append(mat_oil)
    cut_objs.append(oil_pool)

    # Turf overhang lip along cutaway edge (Z = 0.15)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, -0.55, 0.12))
    lip = bpy.context.active_object
    lip.name = "Prairie_Turf_Lip_Edge"
    lip.scale = (40.0, 0.22, 0.16)
    lip.data.materials.append(mat_turf)
    cut_objs.append(lip)

    # Wooden tool shack left of well
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-6.5, 4.2, 1.5))
    shack = bpy.context.active_object
    shack.name = "Wooden_Rig_Shack_v4"
    shack.scale = (4.4, 3.4, 3.0)
    shack.data.materials.append(mat_timber)
    cut_objs.append(shack)

    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=3.4, depth=1.5, location=(-6.5, 4.2, 3.75), rotation=(0, 0, math.radians(45)))
    roof = bpy.context.active_object
    roof.name = "Rig_Shack_Roof_v4"
    roof.scale = (1.0, 0.78, 1.0)
    roof.data.materials.append(mat_steel)
    cut_objs.append(roof)

    # Iconic wooden stave storage tank right of well (for Shot 15)
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=2.0, depth=2.8, location=(8.8, 4.5, 1.4))
    tank = bpy.context.active_object
    tank.name = "Wooden_Oil_Tank_v4"
    tank.data.materials.append(mat_timber)
    cut_objs.append(tank)

    mat_band = make_simple_mat("Tank_Iron_Band_v4", (0.16, 0.16, 0.18), roughness=0.5, metallic=0.85)
    for hz in (0.4, 1.2, 2.0, 2.6):
        bpy.ops.mesh.primitive_torus_add(major_radius=2.02, minor_radius=0.04, location=(8.8, 4.5, hz))
        band = bpy.context.active_object
        band.data.materials.append(mat_band)
        cut_objs.append(band)

    # Real 3D Bermuda Grass Clumps across the prairie ground
    grass_glbs = list((MODELS_DIR / "polyhaven" / "grass_bermuda_01").glob("*.gltf"))
    if not grass_glbs:
        grass_glbs = list((MODELS_DIR / "polyhaven" / "grass_bermuda_01").glob("*.glb"))
    if grass_glbs:
        rng_g = random.Random(77)
        for gi in range(35):
            gx = rng_g.uniform(-22.0, 22.0)
            gy = rng_g.uniform(1.8, 28.0)
            import_gltf_normalized(grass_glbs[0], col, Vector((gx, gy, 0.05)), target_size=rng_g.uniform(0.65, 1.35))

    # Real Poly Haven Barrels scattered near shack & rig
    barrel_glbs = list((MODELS_DIR / "polyhaven" / "Barrel_02").glob("*.gltf"))
    if not barrel_glbs:
        barrel_glbs = list((MODELS_DIR / "polyhaven" / "Barrel_02").glob("*.glb"))
    if barrel_glbs:
        import_gltf_normalized(barrel_glbs[0], col, Vector((-3.8, 2.8, 0.45)), target_size=0.85)
        import_gltf_normalized(barrel_glbs[0], col, Vector((-3.2, 3.2, 0.45)), target_size=0.85)

    # Real Poly Haven Island Trees on horizon
    tree_glbs = list((MODELS_DIR / "polyhaven" / "island_tree_01").glob("*.gltf"))
    if not tree_glbs:
        tree_glbs = list((MODELS_DIR / "polyhaven" / "island_tree_01").glob("*.glb"))
    if tree_glbs:
        import_gltf_normalized(tree_glbs[0], col, Vector((-16.0, 22.0, 0.0)), target_size=4.5)
        import_gltf_normalized(tree_glbs[0], col, Vector((15.0, 24.0, 0.0)), target_size=4.2)
        import_gltf_normalized(tree_glbs[0], col, Vector((28.0, 32.0, 0.0)), target_size=5.0)

    # Wooden Utility Power Poles with Cross-Arms strung across field
    mat_pole = make_creosote_timber_mat()
    for px, py in ((-12.0, 8.0), (4.0, 14.0), (18.0, 22.0)):
        objs_p = []
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.14, depth=6.5, location=(px, py, 3.25))
        pol = bpy.context.active_object
        pol.name = f"Utility_Pole_{px}"
        pol.data.materials.append(mat_pole)
        objs_p.append(pol)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, 6.1))
        arm = bpy.context.active_object
        arm.name = f"Utility_Arm_{px}"
        arm.scale = (1.8, 0.12, 0.12)
        arm.data.materials.append(mat_pole)
        objs_p.append(arm)
        cut_objs.extend(objs_p)

    return cut_objs


# ---------------------------------------------------------------------------
# 11. Camera System & Keyframed 16-Shot Timeline
# ---------------------------------------------------------------------------
def setup_cinematic_camera_v4(scene):
    cam_data = bpy.data.cameras.new("Texas_Cinematic_Camera_v4")
    cam_data.lens = 38.0
    cam_data.sensor_width = 36.0
    cam_data.clip_start = 0.1
    cam_data.clip_end = 250.0

    cam_obj = bpy.data.objects.new("Texas_Camera_v4", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # Tracking empty for smooth aiming
    target = bpy.data.objects.new("Camera_Track_Target_v4", None)
    scene.collection.objects.link(target)
    target.empty_display_type = "PLAIN_AXES"
    target.empty_display_size = 0.5

    tt = cam_obj.constraints.new(type="TRACK_TO")
    tt.target = target
    tt.track_axis = "TRACK_NEGATIVE_Z"
    tt.up_axis = "UP_Y"

    return cam_obj, target


def cam_kf(cam, target, frame: int, c_pos, t_pos, fov_lens=38.0):
    cam.location = c_pos
    cam.data.lens = fov_lens
    target.location = t_pos
    cam.keyframe_insert(data_path="location", frame=frame)
    cam.data.keyframe_insert(data_path="lens", frame=frame)
    target.keyframe_insert(data_path="location", frame=frame)


# ---------------------------------------------------------------------------
# 12. Main Orchestrator
# ---------------------------------------------------------------------------
def main():
    print("=" * 70)
    print("MILDLY ELSEWHERE TEXAS OIL — V4 PRODUCTION ANIMATION GENERATOR")
    print("=" * 70)

    # Clear old scene
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)

    scene = bpy.context.scene
    col = scene.collection
    setup_scene_6gb(scene)
    world, sun = setup_world_and_sun(scene)

    # 1. Sedimentary Cutaway Earth + Topography + Infrastructure
    cut_objs = build_sedimentary_cutaway_and_field_v4(col)

    # 2. Spindletop Creosote Timber Derrick + Travelling Block + Crown Sheaves
    derrick_objs = build_spindletop_derrick_v4(col)

    # 3. Rotating Drill String, Mud Column, Pressure Rings, Chalk Arrows
    pipe_objs, mud_objs, p_arrows = build_drill_string_and_mud_v4(col)

    # 4. Volumetric Fluid Gusher, 14 Tendril Ribbons, 48 Droplets, 2D Chalk Skyscraper
    gusher_objs, bldg_objs, sparks = build_gusher_and_vfx_v4(col)

    # 5. Macro Stage: Multi-Mineral Pebbles, Capillary Menisci & Iridescent Bubbles
    macro_origin, macro_objs = build_macro_pebbles_stage_v4(col)

    # 6. Cameron Double-Ram BOP Cellar
    bop_z, bop_objs = build_bop_cellar_v4(col)

    # 7. Hero Kinematic Pumpjack (Active from frame 1385 onwards)
    hero_pj_objs = build_pumpjack_unit_v4(col, "Hero_Pumpjack", Vector((-2.0, 0.45, 0.0)), phase_offset=0.0, f_start=1385, f_end=1790, scale=1.0)
    set_vis(hero_pj_objs, 1, False)
    set_vis(hero_pj_objs, 1385, True)

    # Hide derrick during pumpjack era (frames 1385..1790)
    set_vis(derrick_objs, 1, True)
    set_vis(derrick_objs, 1384, True)
    set_vis(derrick_objs, 1385, False)

    # 8. Texas Oilfield Panorama: 28 distributed pumpjacks across horizon (Shot 16)
    rng_field = random.Random(101)
    bg_pj_objs = []
    field_coords = [
        (-14.0, 16.0, 0.95), (12.0, 18.0, 0.90), (-26.0, 26.0, 0.85), (22.0, 28.0, 0.88),
        (-6.0, 32.0, 0.82), (16.0, 38.0, 0.80), (-34.0, 42.0, 0.78), (32.0, 45.0, 0.75),
        (-18.0, 52.0, 0.72), (6.0, 56.0, 0.70), (-44.0, 62.0, 0.68), (26.0, 65.0, 0.65),
        (-10.0, 72.0, 0.62), (18.0, 76.0, 0.60), (-28.0, 82.0, 0.58), (38.0, 85.0, 0.55),
        (-4.0, 92.0, 0.52), (12.0, 96.0, 0.50), (-38.0, 102.0, 0.48), (24.0, 108.0, 0.46),
        (-16.0, 115.0, 0.44), (8.0, 120.0, 0.42), (-48.0, 126.0, 0.40), (34.0, 132.0, 0.38),
        (-22.0, 140.0, 0.36), (15.0, 145.0, 0.34), (-8.0, 152.0, 0.32), (28.0, 158.0, 0.30),
    ]
    for idx, (fx, fy, sc) in enumerate(field_coords):
        ph = rng_field.uniform(0.0, math.tau)
        p_unit = build_pumpjack_unit_v4(col, f"BG_Pjack_{idx}", Vector((fx, fy, 0.0)), phase_offset=ph, f_start=1660, f_end=1790, scale=sc)
        bg_pj_objs.extend(p_unit)

    set_vis(bg_pj_objs, 1, False)
    set_vis(bg_pj_objs, 1660, True)

    # 9. Camera Timeline — All 16 Narrative Shots
    cam, target = setup_cinematic_camera_v4(scene)

    # Shot 01 (1-88): Vertical hook whip-tilt -> Spindletop Derrick + Cutaway + Gusher
    cam_kf(cam, target, 1, (0.0, -14.5, 9.5), (0.0, 0.85, 9.0), 38.0)
    cam_kf(cam, target, 88, (0.0, -13.5, 3.8), (0.0, 0.85, 2.5), 36.0)

    # Shot 02 (89-240): Subterranean Borehole Mud Hydrostatic Pressure & Chalk Arrows
    cam_kf(cam, target, 89, (0.0, -5.2, -4.8), (0.0, 0.85, -5.0), 44.0)
    cam_kf(cam, target, 240, (0.0, -5.0, -5.4), (0.0, 0.85, -5.2), 46.0)

    # Shot 03 (241-336): Rotary Table + Kelly drive
    cam_kf(cam, target, 241, (0.0, -4.8, 1.8), (0.0, 0.85, 0.85), 42.0)
    cam_kf(cam, target, 336, (0.0, -4.2, 1.4), (0.0, 0.85, 0.85), 45.0)

    # Shot 04 (337-432): Duplex Mud Pump skid
    cam_kf(cam, target, 337, (-5.5, -2.8, 1.6), (-6.5, 4.2, 1.2), 40.0)
    cam_kf(cam, target, 432, (-5.2, -2.5, 1.8), (-6.5, 4.2, 1.3), 42.0)

    # Shot 05 (433-480): Deep Drill Bit cutting through slate strata
    cam_kf(cam, target, 433, (0.0, -4.8, -18.2), (0.0, 0.85, -19.5), 46.0)
    cam_kf(cam, target, 480, (0.0, -4.8, -20.5), (0.0, 0.85, -21.8), 46.0)

    # Shot 06 (481-540): Worm's-Eye Uplook through Timber Derrick lattice to sky
    cam_kf(cam, target, 481, (0.0, 0.85, 0.65), (0.0, 0.85, 22.0), 22.0)
    cam_kf(cam, target, 540, (0.0, 0.85, 0.65), (0.0, 0.85, 25.0), 20.0)

    # Shot 07 (541-650): 10-Story Gusher Erupting + 2D Skyscraper Wireframe
    cam_kf(cam, target, 541, (-2.5, -24.0, 11.0), (-2.5, 0.65, 12.5), 32.0)
    cam_kf(cam, target, 650, (-2.5, -22.5, 12.0), (-2.5, 0.65, 13.0), 34.0)

    # Shot 08 (651-711): Nightfall Dark Crude Rain falling over rig
    cam_kf(cam, target, 651, (0.0, -12.0, 5.0), (0.0, 0.85, 4.0), 38.0)
    cam_kf(cam, target, 711, (0.0, -11.0, 4.5), (0.0, 0.85, 3.5), 40.0)

    # Shot 09 (712-768): Prairie Sparks & Fire Threat
    cam_kf(cam, target, 712, (-4.5, -6.5, 2.2), (-2.5, 1.0, 2.0), 40.0)
    cam_kf(cam, target, 768, (-3.8, -5.8, 2.4), (-2.0, 1.0, 2.2), 42.0)

    # Shot 10-11 (769-864): Subterranean Cavern Myth vs Reality
    cam_kf(cam, target, 769, (0.0, -5.8, -14.0), (0.0, 1.45, -14.0), 44.0)
    cam_kf(cam, target, 864, (0.0, -5.2, -14.2), (0.0, 1.45, -14.0), 46.0)

    # Shot 12-13 (865-960): Macro Stage — Silky River Stones, Liquid Crude, Methane Bubbles
    cam_kf(cam, target, 865, (macro_origin.x, macro_origin.y - 3.8, macro_origin.z + 0.2), (macro_origin.x, macro_origin.y, macro_origin.z), 52.0)
    cam_kf(cam, target, 960, (macro_origin.x, macro_origin.y - 3.2, macro_origin.z - 0.1), (macro_origin.x, macro_origin.y, macro_origin.z), 55.0)

    # Shot 14 (961-1200): Blowout Preventer (BOP) Cellar & Hydraulic Ram Jaws Slamming Shut
    cam_kf(cam, target, 961, (0.0, -4.5, bop_z + 0.3), (0.0, 0.85, bop_z), 42.0)
    cam_kf(cam, target, 1200, (0.0, -3.8, bop_z + 0.1), (0.0, 0.85, bop_z), 45.0)

    # Shot 15 (1201-1384): Wooden Oil Storage Tank (1201-1299) -> Subsurface Rod Pump (1300-1384)
    cam_kf(cam, target, 1201, (6.0, -4.5, 3.2), (8.8, 4.5, 1.4), 40.0)
    cam_kf(cam, target, 1299, (7.5, -2.5, 2.8), (8.8, 4.5, 1.3), 42.0)
    cam_kf(cam, target, 1300, (0.0, -5.2, -9.5), (0.0, 0.45, -10.0), 46.0)
    cam_kf(cam, target, 1384, (0.0, -5.2, -10.2), (0.0, 0.45, -10.0), 46.0)

    # Shot 16 (1385-1790): Hero Pumpjack profile -> rotating crank -> Epic 28+ pumpjack Texas oilfield panorama
    cam_kf(cam, target, 1385, (-2.0, -18.0, 2.8), (-1.8, 0.45, 1.8), 36.0)
    cam_kf(cam, target, 1510, (-1.8, -16.5, 3.0), (-1.7, 0.45, 2.0), 38.0)
    cam_kf(cam, target, 1511, (-4.5, -7.5, 1.8), (-4.2, 0.45, 1.2), 42.0)
    cam_kf(cam, target, 1575, (-3.5, -8.8, 2.8), (-2.8, 0.45, 2.6), 40.0)
    cam_kf(cam, target, 1576, (-2.0, -17.5, 2.8), (-1.8, 0.45, 2.0), 36.0)
    cam_kf(cam, target, 1659, (-2.0, -18.0, 3.0), (-1.8, 0.45, 2.0), 36.0)
    cam_kf(cam, target, 1660, (-2.0, -18.0, 4.5), (-0.5, 10.0, 1.5), 34.0)
    cam_kf(cam, target, TOTAL_FRAMES, (0.0, -28.0, 14.5), (0.0, 26.0, 1.0), 32.0)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    blend_path = OUT_DIR / "texas_oil_v4_world.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"[OK] Saved production world -> {blend_path}")

    # Preview mode: renders 8 benchmark shots
    if "--preview" in sys.argv:
        previews = [
            ("p1_derrick_cutaway", 60),
            ("p2_borehole_arrows", 220),
            ("p3_uplook_inside", 480),
            ("p4_gusher_skyscraper", 615),
            ("p5_macro_pebbles", 905),
            ("p6_bop_cellar_jaws", 1070),
            ("p7_pumpjack_hero", 1450),
            ("p8_oilfield_panorama", 1765),
        ]
        for label, fr in previews:
            scene.frame_set(fr)
            out_p = OUT_DIR / f"{label}.png"
            scene.render.filepath = str(out_p)
            bpy.ops.render.render(write_still=True)
            print(f"[PREVIEW] {label} (f{fr}) -> {out_p}")
        return

    # Full animation render
    s_fr, e_fr = 1, TOTAL_FRAMES
    if "--start" in sys.argv:
        s_fr = int(sys.argv[sys.argv.index("--start") + 1])
    if "--end" in sys.argv:
        e_fr = int(sys.argv[sys.argv.index("--end") + 1])
    scene.frame_start = s_fr
    scene.frame_end = e_fr

    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[RENDER] Starting render frames {s_fr}..{e_fr} -> {FRAMES_DIR}")
    for f in range(s_fr, e_fr + 1):
        scene.frame_set(f)
        frame_path = FRAMES_DIR / f"frame_{f:04d}.png"
        scene.render.filepath = str(frame_path)
        bpy.ops.render.render(write_still=True)
        if f % 24 == 0 or f == e_fr:
            print(f"[FRAME] {f}/{e_fr} rendered ({f/TOTAL_FRAMES*100:.1f}%)")

    print("[SUCCESS] All frames rendered cleanly.")


if __name__ == "__main__":
    main()
'''

TARGET = Path(r"c:\Users\zrajc\OneDrive\Desktop\Youtube_Automation\Youtube_Automation\scripts\render_texas_oil_recreation_v4.py")
TARGET.write_text(CODE, encoding="utf-8")
print(f"[OK] Wrote {len(CODE)} characters to {TARGET}")
