"""
Mildly Elsewhere — Texas Oil Drilling & Pumpjack 74.58s Full 3D Recreation
==========================================================================
Built with Blender 5.3 EEVEE Next (RTX 3050 6GB optimized) using downloaded
Poly Haven Sky HDRI, PBR Textures, 3D Props, and Articulated Hero Machinery:

  0.0 -  3.7s (   1 -  88): Hook whip-tilt -> Texas Derrick, cloudy sky, prairie, earth cutaway
  3.7 - 16.5s (  89 - 396): Jagged borehole cutaway -> sand caving -> mud fill + white arrows -> oil layer
 16.5 - 22.5s ( 397 - 540): Rig floor mud kick -> worm's-eye uplook inside timber derrick + pipe ejection
 22.5 - 32.0s ( 541 - 768): 10-story oil gusher + white wireframe skyscraper -> dark oil rain -> prairie sparks
 32.0 - 40.0s ( 769 - 960): Subsurface plunge -> dark cavern myth -> macro glossy pebbles + glass gas bubbles
 40.0 - 50.0s ( 961 -1200): Timber-lined cellar Blowout Preventer (BOP) hydraulic steel jaws slamming shut
 50.0 - 58.0s (1201 -1392): Years go by -> weathered wooden tank -> subsurface rod pump inside casing
 58.0 - 74.58s(1393 -1790): Iconic Orange-Horsehead Pumpjack (motor/beam/weights) -> 20+ pumpjack Texas field

Usage:
  blender -b -P scripts/render_texas_oil_recreation.py -- --preview
  blender -b -P scripts/render_texas_oil_recreation.py
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

OUT_DIR = REPO_ROOT / "production_workspace" / "texas_oil_v2"
FRAMES_DIR = OUT_DIR / "frames"
FPS = 24
TOTAL_FRAMES = 1790


# ---------------------------------------------------------------------------
# Helpers: Render Config, Sky HDRI, PBR Shaders
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
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = -0.1
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"


def setup_texas_sky_and_sun(scene):
    """Vivid Poly Haven cloudy Texas sky HDRI with animated day -> oil-rain twilight -> day."""
    world = bpy.data.worlds.new("TexasSkyWorld")
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.35

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(110))
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])

    # Prefer cloudy blue sky HDRI
    sky_candidates = [
        HDRI_DIR / "kloofendal_48d_partly_cloudy_puresky_2k.hdr",
        HDRI_DIR / "kloppenheim_06_puresky_2k.hdr",
    ]
    sky_path = next((p for p in sky_candidates if p.exists()), None)
    if sky_path:
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(sky_path), check_existing=True)
        nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
        # Slight saturation boost for iconic Mildly Elsewhere crisp blue sky
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = 1.35
        hsv.inputs["Value"].default_value = 0.95
        nt.links.new(env.outputs["Color"], hsv.inputs["Color"])
        nt.links.new(hsv.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (0.12, 0.45, 0.85, 1.0)

    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Warm Texas Sun light
    sdata = bpy.data.lights.new("Texas_Sun", type="SUN")
    sdata.energy = 4.2
    sdata.color = (1.0, 0.95, 0.86)
    sdata.angle = math.radians(1.5)
    sun = bpy.data.objects.new("Texas_Sun", sdata)
    sun.rotation_euler = (math.radians(48), math.radians(-18), math.radians(32))
    scene.collection.objects.link(sun)

    # Animate Oil-Rain Night darkening between frames 648-708 (27.0s - 29.5s)
    for fr, bg_str, sun_en in [
        (1, 1.35, 4.2),
        (640, 1.35, 4.2),
        (658, 0.14, 0.35),
        (704, 0.14, 0.35),
        (714, 1.35, 4.2),
    ]:
        bg.inputs["Strength"].default_value = bg_str
        bg.inputs["Strength"].keyframe_insert(data_path="default_value", frame=fr)
        sdata.energy = sun_en
        sdata.keyframe_insert(data_path="energy", frame=fr)

    return sun


def safe_pbr(name: str, fallback_color, roughness: float = 0.65, metallic: float = 0.0, uv_scale: float = 1.0, tint=None):
    """Load downloaded Poly Haven PBR texture if available, else crisp procedural Principled BSDF."""
    tdir = TEXTURES_DIR / name
    if tdir.exists() and any(tdir.glob("*_diffuse_*")):
        mat = load_polyhaven_pbr_material(name, uv_scale=uv_scale)
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        bsdf.inputs["Metallic"].default_value = metallic
        if tint is not None and bsdf.inputs["Base Color"].links:
            src = bsdf.inputs["Base Color"].links[0].from_socket
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 0.55
            mix.inputs[7].default_value = (*tint, 1.0)
            nt.links.new(src, mix.inputs[6])
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        return mat
    mat = bpy.data.materials.new(f"Mat_{name}")
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*fallback_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def make_simple_mat(name: str, color, roughness: float = 0.4, metallic: float = 0.0, emission: float = 0.0, coat: float = 0.0):
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0 and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    if coat > 0 and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    return mat


def make_sedimentary_strata_mat():
    """Authentic Mildly Elsewhere multi-layered sedimentary rock cutaway shader with cliff PBR micro-detail."""
    mat = bpy.data.materials.new("Texas_Sedimentary_Strata")
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.86

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Gentle wavy tectonic distortion on Z
    noise_wave = nt.nodes.new("ShaderNodeTexNoise")
    noise_wave.inputs["Scale"].default_value = 0.16
    noise_wave.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], noise_wave.inputs["Vector"])

    # High-freq micro-lamination bands
    noise_fine = nt.nodes.new("ShaderNodeTexNoise")
    noise_fine.inputs["Scale"].default_value = 2.8
    noise_fine.inputs["Detail"].default_value = 10.0
    noise_fine.inputs["Roughness"].default_value = 0.65
    nt.links.new(tc.outputs["Object"], noise_fine.inputs["Vector"])

    # High-frequency geological strata bands visible right from Z=0 down to Z=-30!
    m_mul = nt.nodes.new("ShaderNodeMath")
    m_mul.operation = "MULTIPLY"
    m_mul.inputs[1].default_value = 1.1
    nt.links.new(noise_wave.outputs["Fac"], m_mul.inputs[0])

    m_add = nt.nodes.new("ShaderNodeMath")
    m_add.operation = "ADD"
    nt.links.new(sep.outputs["Z"], m_add.inputs[0])
    nt.links.new(m_mul.outputs["Value"], m_add.inputs[1])

    # Wrap/repeat rich geological strata every 12m (plus dark oil shale below -22m)
    m_mod = nt.nodes.new("ShaderNodeMath")
    m_mod.operation = "PINGPONG"
    m_mod.inputs[1].default_value = 10.5
    nt.links.new(m_add.outputs["Value"], m_mod.inputs[0])

    map_r = nt.nodes.new("ShaderNodeMapRange")
    map_r.inputs["From Min"].default_value = 0.0
    map_r.inputs["From Max"].default_value = 10.5
    nt.links.new(m_mod.outputs["Value"], map_r.inputs["Value"])

    # Vivid Stratigraphic ColorRamp matching Mildly Elsewhere reference
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position = 0.00
    cr.elements[0].color = (0.48, 0.38, 0.22, 1.0)      # Golden sandy topsoil
    cr.elements[1].position = 1.00
    cr.elements[1].color = (0.34, 0.36, 0.40, 1.0)      # Dark grey shale
    stops = [
        (0.12, (0.76, 0.66, 0.46, 1.0)),                # Buff sandstone
        (0.24, (0.58, 0.48, 0.32, 1.0)),                # Ochre clay
        (0.36, (0.64, 0.22, 0.09, 1.0)),                # Deep terracotta red clay!
        (0.46, (0.78, 0.68, 0.52, 1.0)),                # Pale limestone
        (0.56, (0.48, 0.54, 0.60, 1.0)),                # Blue-grey shale
        (0.68, (0.56, 0.20, 0.09, 1.0)),                # Red-brown ironstone
        (0.80, (0.74, 0.66, 0.50, 1.0)),                # Sandstone
        (0.90, (0.42, 0.34, 0.24, 1.0)),                # Dark mudstone
    ]
    for pos, col in stops:
        el = cr.elements.new(pos)
        el.color = col
    nt.links.new(map_r.outputs["Result"], ramp.inputs["Fac"])

    # Add fine horizontal sedimentary micro-striations!
    wave_fine = nt.nodes.new("ShaderNodeTexWave")
    wave_fine.wave_type = "BANDS"
    wave_fine.bands_direction = "Z"
    wave_fine.inputs["Scale"].default_value = 4.5
    wave_fine.inputs["Distortion"].default_value = 3.2
    wave_fine.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], wave_fine.inputs["Vector"])

    mix_col = nt.nodes.new("ShaderNodeMix")
    mix_col.data_type = "RGBA"
    mix_col.blend_type = "MULTIPLY"
    mix_col.inputs["Factor"].default_value = 0.28
    nt.links.new(ramp.outputs["Color"], mix_col.inputs[6])
    nt.links.new(wave_fine.outputs["Color"], mix_col.inputs[7])
    nt.links.new(mix_col.outputs[2], bsdf.inputs["Base Color"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.65
    bump.inputs["Distance"].default_value = 0.14
    nt.links.new(noise_fine.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def set_vis(objs, frame: int, visible: bool) -> None:
    for o in objs:
        if o is None:
            continue
        o.hide_render = not visible
        o.hide_viewport = not visible
        o.keyframe_insert(data_path="hide_render", frame=frame)
        o.keyframe_insert(data_path="hide_viewport", frame=frame)


# ---------------------------------------------------------------------------
# 1. Texas Prairie Environment & Jagged 3D Sedimentary Earth Cutaway
# ---------------------------------------------------------------------------
def build_texas_earth_and_prairie(col):
    """Build golden Texas prairie ground + deep 3D stratified earth cutaway with jagged borehole shaft."""
    mat_prairie = safe_pbr("aerial_grass_rock", (0.56, 0.48, 0.22), roughness=0.92, uv_scale=0.12, tint=(0.95, 0.85, 0.45))
    mat_strata = make_sedimentary_strata_mat()
    mat_borehole = safe_pbr("brown_mud_02", (0.24, 0.15, 0.08), roughness=0.72, uv_scale=0.6)
    mat_oil = make_simple_mat("Crude_Oil_Black", (0.012, 0.010, 0.008), roughness=0.04, coat=1.0)

    # Golden Prairie Terrain (extends from Y=0 back to Y=240, X=[-180..180])
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=40, y_subdivisions=40, size=1.0, location=(0.0, 110.0, 0.02))
    ground = bpy.context.active_object
    ground.name = "Texas_Prairie_Ground"
    ground.scale = (340.0, 220.0, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    # Gentle rolling prairie hills far behind the well (keep Y < 12 flat!)
    rng = random.Random(10)
    for v in ground.data.vertices:
        if v.co.y > 18.0:
            dist = (v.co.y - 18.0) / 100.0
            v.co.z += (math.sin(v.co.x * 0.04) * 1.4 + math.cos(v.co.y * 0.05) * 1.1) * min(1.0, dist)
    for p in ground.data.polygons:
        p.use_smooth = True
    ground.data.materials.append(mat_prairie)

    # Deep Stratified Earth Cutaway Block (Y=[0..24], Z=[-30..0]) Split cleanly into Left & Right walls
    # around a rugged, jagged central borehole shaft (radius ~0.85m)!
    cut_objs = []
    for side, x_min, x_max in [("Left", -42.0, -0.82), ("Right", 0.82, 42.0)]:
        bm = bmesh.new()
        nx, nz = 18, 48
        verts_front = []
        verts_back = []
        for iz in range(nz + 1):
            zf = -30.0 * (iz / nz)
            row_f = []
            row_b = []
            for ix in range(nx + 1):
                t = ix / nx
                xf = x_min + (x_max - x_min) * t
                # Make the inner borehole edge jagged & organic!
                near_hole = (side == "Left" and ix == nx) or (side == "Right" and ix == 0)
                jag = 0.0
                if near_hole:
                    jag = 0.22 * math.sin(zf * 2.1 + (0 if side == "Left" else 2.2)) + 0.11 * math.cos(zf * 5.7)
                    xf += jag if side == "Left" else -jag
                vf = bm.verts.new((xf, 0.0 + (0.08 * math.sin(zf * 3.1) if near_hole else 0.0), zf))
                vb = bm.verts.new((xf, 14.0, zf))
                row_f.append(vf)
                row_b.append(vb)
            verts_front.append(row_f)
            verts_back.append(row_b)

        # Front stratified cliff face
        for iz in range(nz):
            for ix in range(nx):
                bm.faces.new((verts_front[iz][ix], verts_front[iz][ix + 1], verts_front[iz + 1][ix + 1], verts_front[iz + 1][ix]))
        # Borehole inner vertical wall
        hole_ix = nx if side == "Left" else 0
        for iz in range(nz):
            if side == "Left":
                bm.faces.new((verts_front[iz][hole_ix], verts_back[iz][hole_ix], verts_back[iz + 1][hole_ix], verts_front[iz + 1][hole_ix]))
            else:
                bm.faces.new((verts_back[iz][hole_ix], verts_front[iz][hole_ix], verts_front[iz + 1][hole_ix], verts_back[iz + 1][hole_ix]))
        # Top cap
        for ix in range(nx):
            bm.faces.new((verts_front[0][ix], verts_back[0][ix], verts_back[0][ix + 1], verts_front[0][ix + 1]))

        mesh = bpy.data.meshes.new(f"Earth_Cutaway_{side}")
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(f"Earth_Cutaway_{side}", mesh)
        col.objects.link(obj)
        for p in obj.data.polygons:
            p.use_smooth = True
        obj.data.materials.append(mat_strata)
        cut_objs.append(obj)

    # Back wall of borehole shaft positioned BEHIND pipe & BOP (front edge at Y=+0.75!)
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=1.05, depth=30.0, location=(0.0, 1.80, -15.0))
    shaft_back = bpy.context.active_object
    shaft_back.name = "Borehole_Back_Wall"
    for p in shaft_back.data.polygons:
        p.use_smooth = True
    shaft_back.data.materials.append(mat_borehole)

    # Deep Oil Reservoir Pool at bottom of cutaway (Z = -24 to -30)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 1.5, -27.5))
    oil_pool = bpy.context.active_object
    oil_pool.name = "Deep_Crude_Reservoir"
    oil_pool.scale = (20.0, 3.0, 5.0)
    oil_pool.data.materials.append(mat_oil)

    # Real Poly Haven Horizon Trees & Wooden Barrels + Weathered Rig Shack!
    tree_glbs = list((MODELS_DIR / "polyhaven" / "island_tree_01").glob("*.gltf"))
    if tree_glbs:
        base_tree = import_gltf_normalized(tree_glbs[0], target_size=6.5, location=(-26.0, 42.0, 0.0), name_prefix="Horizon_Tree")
        tree_spots = [(-38, 55, 7.5), (-18, 48, 5.8), (-6, 62, 6.2), (14, 52, 6.8), (28, 46, 7.2), (44, 60, 8.0)]
        for i, (tx, ty, ts) in enumerate(tree_spots):
            t_dup = import_gltf_normalized(tree_glbs[0], target_size=ts, location=(tx, ty, 0.0), name_prefix=f"Horizon_Tree_{i}")
            t_dup.rotation_euler.z = rng.uniform(0, math.tau)

    # Weathered Dark-Brown Wooden Rig Shack (Left of Derrick) & Wooden Stave Tank (Right of Derrick)
    mat_wood = safe_pbr("distressed_painted_planks", (0.28, 0.18, 0.10), roughness=0.84, uv_scale=0.8, tint=(0.36, 0.22, 0.11))
    mat_iron = safe_pbr("corrugated_iron", (0.26, 0.24, 0.22), roughness=0.58, metallic=0.65, uv_scale=1.2, tint=(0.55, 0.48, 0.42))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-6.2, 4.5, 1.4))
    shack = bpy.context.active_object
    shack.name = "Wooden_Rig_Shack"
    shack.scale = (4.2, 3.2, 2.8)
    shack.data.materials.append(mat_wood)

    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=3.2, depth=1.4, location=(-6.2, 4.5, 3.5), rotation=(0, 0, math.radians(45)))
    roof = bpy.context.active_object
    roof.name = "Rig_Shack_Roof"
    roof.scale = (1.0, 0.78, 1.0)
    roof.data.materials.append(mat_iron)

    # Iconic Wooden Stave Oil Storage Tank (for Shot G "the squeeze runs out" + background!)
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=1.8, depth=2.6, location=(8.5, 4.2, 1.3))
    tank = bpy.context.active_object
    tank.name = "Wooden_Oil_Tank"
    tank.data.materials.append(mat_wood)
    mat_band = safe_pbr("rusty_metal_02", (0.22, 0.16, 0.12), roughness=0.55, metallic=0.8)
    for hz in (0.4, 1.1, 1.8, 2.4):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.82, minor_radius=0.04, location=(8.5, 4.2, hz))
        band = bpy.context.active_object
        band.data.materials.append(mat_band)
    # Oil inlet pipe curving over rim of wooden tank
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.09, depth=3.2, location=(6.55, 4.2, 1.6))
    tpipe = bpy.context.active_object
    tpipe.data.materials.append(mat_band)

    return [ground, shaft_back, oil_pool] + cut_objs


# ---------------------------------------------------------------------------
# 2. Authentic Spindletop Wooden Lattice Oil Derrick + Drill Pipe + Gusher
# ---------------------------------------------------------------------------
def add_beam(col, name: str, p1: Vector, p2: Vector, thickness: float, mat):
    v = p2 - p1
    length = v.length
    if length < 1e-4:
        return None
    mid = (p1 + p2) * 0.5
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=mid)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (thickness, thickness, length)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = v.normalized().to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    return obj


def build_spindletop_derrick(col):
    """Authentic 16m tapered dark-brown wooden Spindletop oil derrick with 6 tiers of X-bracing, crown sheaves & rig floor."""
    mat_timber = safe_pbr("distressed_painted_planks", (0.30, 0.19, 0.10), roughness=0.84, uv_scale=1.2, tint=(0.35, 0.21, 0.10))
    mat_steel = safe_pbr("rusty_metal_02", (0.24, 0.20, 0.17), roughness=0.5, metallic=0.85)
    objs = []

    H = 16.5
    w_bot = 2.6
    w_top = 0.72
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
    # 4 tapered corner legs
    for i in range(4):
        objs.append(add_beam(col, f"Derrick_Leg_{i}", c_bot[i], c_top[i], 0.19, mat_timber))

    # 6 tiers of horizontal girts + diagonal X cross-bracing on all 4 faces
    for t in range(tiers):
        c0 = corners_at(t / tiers)
        c1 = corners_at((t + 1) / tiers)
        for face in range(4):
            nxt = (face + 1) % 4
            objs.append(add_beam(col, f"Girt_{t}_{face}", c1[face], c1[nxt], 0.12, mat_timber))
            objs.append(add_beam(col, f"XBraceA_{t}_{face}", c0[face], c1[nxt], 0.085, mat_timber))
            objs.append(add_beam(col, f"XBraceB_{t}_{face}", c0[nxt], c1[face], 0.085, mat_timber))

    # Wooden rig floor deck with central rotary table (opening around pipe!)
    for sx, sy, lx, ly in [(-1.8, 0.85, 2.0, 5.6), (1.8, 0.85, 2.0, 5.6), (0.0, 2.6, 1.8, 2.0)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, sy, 0.18))
        deck = bpy.context.active_object
        deck.scale = (lx, ly, 0.32)
        deck.data.materials.append(mat_timber)
        objs.append(deck)

    # Rotary table collar & iron crown block sheaves
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.85, depth=0.36, location=(0.0, 0.55, 0.45))
    rotary = bpy.context.active_object
    rotary.name = "Rotary_Table"
    rotary.data.materials.append(mat_steel)
    objs.append(rotary)

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.45, depth=0.22, location=(0.0, 0.85, H + 0.65), rotation=(0, math.radians(90), 0))
    sheave = bpy.context.active_object
    sheave.name = "Crown_Sheave"
    sheave.data.materials.append(mat_steel)
    objs.append(sheave)

    return objs


def build_drill_string_and_mud_vfx(col):
    """Rotating drill pipe + tricone bit + animated mud fill + 2D white outward pressure arrows."""
    mat_pipe = safe_pbr("rusty_metal_02", (0.28, 0.22, 0.17), roughness=0.45, metallic=0.82)
    mat_mud = safe_pbr("brown_mud_02", (0.28, 0.19, 0.10), roughness=0.35, uv_scale=0.8)
    mat_arrow = make_simple_mat("White_Arrow_2D", (1.0, 1.0, 1.0), roughness=0.1, emission=4.0)

    # Main Drill Pipe (extends down into borehole, animated downward then shooting UP through derrick!)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.22, depth=34.0, location=(0.0, 0.45, -2.0))
    pipe = bpy.context.active_object
    pipe.name = "Drill_Pipe"
    for p in pipe.data.polygons:
        p.use_smooth = True
    pipe.data.materials.append(mat_pipe)

    # Flared drill bit at bottom of pipe
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.48, radius2=0.24, depth=0.85, location=(0.0, 0.45, -19.2), rotation=(math.radians(180), 0, 0))
    bit = bpy.context.active_object
    bit.name = "Drill_Bit"
    bit.data.materials.append(mat_pipe)
    bit.parent = pipe
    bpy.context.view_layer.update()
    bit.matrix_parent_inverse = pipe.matrix_world.inverted()

    # Drill pipe keyframes:
    # 1..88: drilling gently at Z=-2
    # 89..396: pushing deeper down Z=+8 -> Z=-9 so drill bit visibly cuts deeper!
    # 397..540: violent blowout EJECTION shooting straight UP +22m through derrick!
    # 541..1200: settled back at Z=-2 for BOP clamp
    pipe_keys = [
        (1, 7.0, 0.0),
        (88, 7.0, 14.0),
        (170, 5.0, 32.0),
        (396, -7.0, 88.0),
        (440, -6.5, 92.0),
        (540, 22.0, 110.0),
        (541, 4.0, 110.0),
        (1200, 4.0, 110.0),
    ]
    for fr, pz, rz in pipe_keys:
        pipe.location = (0.0, 0.45, pz)
        pipe.rotation_euler = (0.0, 0.0, rz)
        pipe.keyframe_insert(data_path="location", frame=fr)
        pipe.keyframe_insert(data_path="rotation_euler", frame=fr)

    # Rising Thick Brown Mud Column filling borehole during frames 155..396 (behind drill pipe)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.68, depth=24.0, location=(0.0, 0.92, -24.0))
    mud = bpy.context.active_object
    mud.name = "Drilling_Mud_Column"
    mud.data.materials.append(mat_mud)
    for fr, mz in [(1, -36.0), (150, -34.0), (260, -14.0), (396, -12.0), (440, -10.5)]:
        mud.location = (0.0, 0.92, mz)
        mud.keyframe_insert(data_path="location", frame=fr)
    set_vis([mud], 1, False)
    set_vis([mud], 150, True)
    set_vis([mud], 541, False)

    # Animated 2D White Outward Hydrostatic Pressure Arrows (<- -> pointing OUTWARD into rock walls!)
    arrows = []
    for row_idx, az in enumerate([-5.5, -8.0, -10.5, -13.0]):
        for side in (-1, 1):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.44, -0.18, az))
            sh = bpy.context.active_object
            sh.scale = (0.30, 0.04, 0.07)
            sh.data.materials.append(mat_arrow)

            bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.13, depth=0.20, location=(side * 0.65, -0.18, az), rotation=(0, math.radians(90 * side), 0))
            hd = bpy.context.active_object
            hd.scale = (1.0, 0.2, 1.0)
            hd.data.materials.append(mat_arrow)

            for k in range(8):
                fk = 175 + k * 16
                push = 0.16 if k % 2 == 1 else 0.0
                sh.location.x = side * (0.42 + push)
                hd.location.x = side * (0.64 + push)
                sh.keyframe_insert(data_path="location", frame=fk)
                hd.keyframe_insert(data_path="location", frame=fk)
            arrows.extend([sh, hd])
    set_vis(arrows, 1, False)
    set_vis(arrows, 175, True)
    set_vis(arrows, 315, False)

    # Falling sandy rubble chunks (Shot B sand cave-in, frames 89..160)
    rubble = []
    rng = random.Random(21)
    mat_sand = safe_pbr("sand_01", (0.68, 0.58, 0.36), roughness=0.92)
    for i in range(28):
        side = -1 if i % 2 == 0 else 1
        rx = side * rng.uniform(0.55, 0.85)
        rz0 = rng.uniform(-3.0, -11.0)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rng.uniform(0.06, 0.15), location=(rx, 0.25, rz0))
        r = bpy.context.active_object
        r.data.materials.append(mat_sand)
        f0 = 89 + rng.randint(0, 32)
        f1 = min(165, f0 + rng.randint(18, 35))
        r.location = (rx, 0.25, rz0)
        r.keyframe_insert(data_path="location", frame=f0)
        r.location = (rx * 0.4, 0.35, rz0 - rng.uniform(2.5, 5.5))
        r.keyframe_insert(data_path="location", frame=f1)
        rubble.append(r)
    set_vis(rubble, 1, False)
    set_vis(rubble, 89, True)
    set_vis(rubble, 168, False)

    return pipe, mud, arrows, rubble


# ---------------------------------------------------------------------------
# 3. 10-Story Oil Gusher Plume + Neon Chalk Skyscraper Overlay + Prairie Sparks
# ---------------------------------------------------------------------------
def build_gusher_skyscraper_and_sparks(col):
    mat_oil = make_simple_mat("Gusher_Oil", (0.015, 0.012, 0.010), roughness=0.06, coat=1.0)
    mat_chalk = make_simple_mat("Chalk_Building_2D", (0.85, 0.96, 1.0), roughness=0.1, emission=4.5)
    mat_spark = make_simple_mat("Prairie_Spark", (1.0, 0.55, 0.12), roughness=0.1, emission=14.0)

    # Turbulent layered oil gusher jet + 40 animated flying black oil blobs
    gusher_objs = []
    rng = random.Random(33)
    # Core high-pressure jet column from rig floor up to 34m!
    bpy.ops.mesh.primitive_cone_add(vertices=18, radius1=0.28, radius2=1.45, depth=26.0, location=(0.0, 0.65, 22.0))
    jet = bpy.context.active_object
    jet.name = "Oil_Gusher_Core"
    for p in jet.data.polygons:
        p.use_smooth = True
    jet.data.materials.append(mat_oil)
    gusher_objs.append(jet)

    # Pulsing scale on core jet
    for f in range(540, 720, 6):
        s = rng.uniform(0.88, 1.22)
        jet.scale = (s, s, rng.uniform(0.95, 1.12))
        jet.keyframe_insert(data_path="scale", frame=f)

    # 40 smooth animated black oil spray streaks arcing outward from crown block!
    for i in range(40):
        ang = rng.uniform(0, math.tau)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=rng.uniform(0.10, 0.24), location=(0, 0.65, 17.0))
        drop = bpy.context.active_object
        drop.scale = (0.7, 0.7, rng.uniform(2.6, 4.8))
        for p in drop.data.polygons:
            p.use_smooth = True
        drop.data.materials.append(mat_oil)
        f0 = 540 + (i * 4) % 90
        f_peak = f0 + 18
        f_fall = f0 + 46
        rad_out = rng.uniform(1.2, 5.2)
        drop.location = (0.0, 0.65, 16.5)
        drop.keyframe_insert(data_path="location", frame=f0)
        drop.location = (math.cos(ang) * rad_out * 0.45, 0.65 + math.sin(ang) * rad_out * 0.3, rng.uniform(22.0, 32.0))
        drop.keyframe_insert(data_path="location", frame=f_peak)
        drop.location = (math.cos(ang) * rad_out, 0.65 + math.sin(ang) * rad_out * 0.6, rng.uniform(2.0, 10.0))
        drop.keyframe_insert(data_path="location", frame=f_fall)
        gusher_objs.append(drop)

    # Visible during Hook (1..88) and Gusher (540..712)
    set_vis(gusher_objs, 1, True)
    set_vis(gusher_objs, 88, True)
    set_vis(gusher_objs, 89, False)
    set_vis(gusher_objs, 540, True)
    set_vis(gusher_objs, 712, False)

    # Glowing White 2D 10-Story Skyscraper Wireframe Overlay (next to derrick, X=-6.5, Z=0..22m!)
    bldg_objs = []
    bx = -6.2
    by = -0.2
    bw = 4.6
    bh = 21.5
    th = 0.14
    # Outer wireframe outline
    bldg_objs.append(add_beam(col, "Bldg_L", Vector((bx - bw/2, by, 0)), Vector((bx - bw/2, by, bh)), th, mat_chalk))
    bldg_objs.append(add_beam(col, "Bldg_R", Vector((bx + bw/2, by, 0)), Vector((bx + bw/2, by, bh)), th, mat_chalk))
    bldg_objs.append(add_beam(col, "Bldg_T", Vector((bx - bw/2, by, bh)), Vector((bx + bw/2, by, bh)), th, mat_chalk))
    bldg_objs.append(add_beam(col, "Bldg_B", Vector((bx - bw/2, by, 0.1)), Vector((bx + bw/2, by, 0.1)), th, mat_chalk))
    # 10 stories of glowing window grid lines
    for fl in range(1, 10):
        fz = bh * (fl / 10.0)
        bldg_objs.append(add_beam(col, f"Bldg_Floor_{fl}", Vector((bx - bw/2, by, fz)), Vector((bx + bw/2, by, fz)), 0.08, mat_chalk))
    for w_i in range(1, 4):
        wx = (bx - bw/2) + bw * (w_i / 4.0)
        bldg_objs.append(add_beam(col, f"Bldg_Col_{w_i}", Vector((wx, by, 0.2)), Vector((wx, by, bh)), 0.07, mat_chalk))

    set_vis(bldg_objs, 1, False)
    set_vis(bldg_objs, 588, True)
    set_vis(bldg_objs, 650, False)

    # Flying glowing fiery sparks across golden prairie (frames 712..768)
    sparks = []
    for i in range(18):
        sx0 = rng.uniform(-9.0, 2.0)
        sz0 = rng.uniform(5.0, 12.0)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx0, 2.0, sz0))
        sp = bpy.context.active_object
        sp.scale = (0.45, 0.05, 0.08)
        sp.rotation_euler = (0.0, math.radians(24), 0.0)
        sp.data.materials.append(mat_spark)
        sp.location = (sx0, 2.0, sz0)
        sp.keyframe_insert(data_path="location", frame=712)
        sp.location = (sx0 + rng.uniform(6.0, 12.0), 2.0, sz0 - rng.uniform(3.5, 6.5))
        sp.keyframe_insert(data_path="location", frame=768)
        sparks.append(sp)
    set_vis(sparks, 1, False)
    set_vis(sparks, 712, True)
    set_vis(sparks, 769, False)

    return gusher_objs, bldg_objs, sparks


# ---------------------------------------------------------------------------
# 4. Macro Oil-Soaked Porous Rock Sponge + Rising Clear Glass Gas Bubbles
# ---------------------------------------------------------------------------
def build_macro_pebbles_stage(col):
    """Dedicated macro stage at X=45: 45 tightly packed smooth river pebbles + black oil + clear glass gas bubbles."""
    origin = Vector((45.0, 0.0, 0.0))
    objs = []
    rng = random.Random(55)

    # Dark enclosed subterranean chamber box so sky clouds NEVER reflect inside the underground rock!
    mat_dark_box = make_simple_mat("Subterranean_Black", (0.005, 0.004, 0.003), roughness=0.9)
    bpy.ops.mesh.primitive_cube_add(size=10.0, location=(origin.x, origin.y - 2.0, origin.z))
    box = bpy.context.active_object
    box.name = "Macro_Dark_Chamber"
    # Flip normals inward so interior walls block sky HDRI
    for poly in box.data.polygons:
        poly.flip()
    box.data.materials.append(mat_dark_box)
    objs.append(box)

    # Jet-black glossy crude oil backdrop plane
    mat_oil = make_simple_mat("Macro_Oil_Pool", (0.006, 0.005, 0.004), roughness=0.04, coat=1.0)
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(origin.x, origin.y + 0.45, origin.z), rotation=(math.radians(90), 0, 0))
    back = bpy.context.active_object
    back.name = "Macro_Oil_Backdrop"
    back.data.materials.append(mat_oil)
    objs.append(back)

    # 3 distinct warm smooth river-pebble materials (cream, sandstone tan, warm clay)
    peb_mats = [
        make_simple_mat("Pebble_Cream", (0.76, 0.70, 0.60), roughness=0.28, coat=0.5),
        make_simple_mat("Pebble_Tan", (0.62, 0.50, 0.36), roughness=0.32, coat=0.45),
        make_simple_mat("Pebble_WarmGrey", (0.55, 0.48, 0.40), roughness=0.30, coat=0.5),
    ]

    # Tightly packed 2D matrix of 54 smooth organic river pebbles
    cols, rows = 6, 9
    for r in range(rows):
        for c in range(cols):
            px = origin.x + (c - (cols - 1) / 2.0) * 0.48 + rng.uniform(-0.07, 0.07)
            pz = origin.z + (r - (rows - 1) / 2.0) * 0.50 + rng.uniform(-0.07, 0.07)
            py = origin.y + rng.uniform(-0.08, 0.14)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=rng.uniform(0.18, 0.25), location=(px, py, pz))
            peb = bpy.context.active_object
            peb.scale = (rng.uniform(0.85, 1.22), rng.uniform(0.65, 0.95), rng.uniform(0.82, 1.25))
            peb.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))
            for v in peb.data.vertices:
                v.co *= 1.0 + 0.09 * math.sin(v.co.x * 7.0 + r) * math.cos(v.co.z * 6.0 + c)
            for p in peb.data.polygons:
                p.use_smooth = True
            peb.data.materials.append(rng.choice(peb_mats))
            objs.append(peb)

    # Crystal-clear glossy silver/glass gas bubbles expanding & rising between pebbles (frames 835..960)!
    mat_bubble = make_simple_mat("Gas_Bubble_Glass", (0.90, 0.94, 0.98), roughness=0.05, metallic=0.75, coat=1.0)
    for i in range(26):
        bx = origin.x + rng.uniform(-0.95, 0.95)
        bz0 = origin.z + rng.uniform(-1.6, 0.4)
        bz1 = bz0 + rng.uniform(0.9, 1.7)
        by = origin.y - rng.uniform(0.16, 0.26)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=rng.uniform(0.04, 0.10), location=(bx, by, bz0))
        bub = bpy.context.active_object
        for p in bub.data.polygons:
            p.use_smooth = True
        bub.data.materials.append(mat_bubble)
        f0 = 835 + rng.randint(0, 50)
        f1 = min(960, f0 + rng.randint(35, 70))
        bub.location = (bx, by, bz0)
        bub.scale = (0.15, 0.15, 0.15)
        bub.keyframe_insert(data_path="location", frame=f0)
        bub.keyframe_insert(data_path="scale", frame=f0)
        bub.location = (bx + rng.uniform(-0.18, 0.18), by, (bz0 + bz1) * 0.5)
        bub.scale = (1.15, 1.0, 1.15)
        bub.keyframe_insert(data_path="location", frame=(f0 + f1) // 2)
        bub.keyframe_insert(data_path="scale", frame=(f0 + f1) // 2)
        bub.location = (bx + rng.uniform(-0.22, 0.22), by, bz1)
        bub.scale = (1.35, 1.0, 1.35)
        bub.keyframe_insert(data_path="location", frame=f1)
        bub.keyframe_insert(data_path="scale", frame=f1)
        objs.append(bub)

    # Crisp directional spotlight for macro oil specular highlights
    ldata = bpy.data.lights.new("Macro_Key_Light", type="AREA")
    ldata.energy = 120.0
    ldata.size = 2.5
    lobj = bpy.data.objects.new("Macro_Key_Light", ldata)
    lobj.location = (origin.x + 1.4, origin.y - 3.0, origin.z + 1.8)
    lobj.rotation_euler = (math.radians(65), 0.0, math.radians(22))
    col.objects.link(lobj)
    objs.append(lobj)

    return origin, objs


# ---------------------------------------------------------------------------
# 5. Hydraulic Blowout Preventer (BOP) Inside Timber Cellar Pit
# ---------------------------------------------------------------------------
def build_bop_cellar(col):
    """Detailed green-steel Blowout Preventer with animated hydraulic steel ram jaws clamping shut!"""
    mat_green = safe_pbr("green_metal_rust", (0.14, 0.28, 0.19), roughness=0.42, metallic=0.78, tint=(0.45, 0.72, 0.50))
    mat_steel = safe_pbr("rusty_metal_02", (0.48, 0.50, 0.52), roughness=0.25, metallic=0.92)
    mat_wood = safe_pbr("distressed_painted_planks", (0.34, 0.24, 0.15), roughness=0.85, uv_scale=1.0)
    mat_red = make_simple_mat("Valve_Wheel_Red", (0.65, 0.08, 0.06), roughness=0.35, metallic=0.5)

    cz = -2.2
    objs = []

    # Timber-lined underground cellar walls framing the BOP (left, right, back)
    for sx, sy, lx, ly in [(-1.35, 0.45, 0.22, 2.2), (1.35, 0.45, 0.22, 2.2), (0.0, 1.45, 2.9, 0.22)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, sy, cz))
        wall = bpy.context.active_object
        wall.scale = (lx, ly, 2.6)
        wall.data.materials.append(mat_wood)
        objs.append(wall)

    # Central heavy steel flange body (top & bottom collars around drill pipe)
    for fz in (cz + 0.75, cz - 0.75):
        bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.58, depth=0.22, location=(0.0, 0.45, fz))
        fl = bpy.context.active_object
        for p in fl.data.polygons:
            p.use_smooth = True
        fl.data.materials.append(mat_green)
        objs.append(fl)

    # Left & Right Hydraulic Ram Cylinder Housings + Red Valve Handwheel
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.36, depth=0.85, location=(side * 0.85, 0.45, cz), rotation=(0, math.radians(90), 0))
        cyl = bpy.context.active_object
        for p in cyl.data.polygons:
            p.use_smooth = True
        cyl.data.materials.append(mat_green)
        objs.append(cyl)

        # Animated Steel Ram Jaw + Piston Rod slamming shut around pipe during frames 1010..1085!
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.58, 0.45, cz))
        jaw = bpy.context.active_object
        jaw.name = f"BOP_Steel_Jaw_{side}"
        jaw.scale = (0.38, 0.56, 0.44)
        jaw.data.materials.append(mat_steel)

        jaw.location = (side * 0.62, 0.45, cz)
        jaw.keyframe_insert(data_path="location", frame=960)
        jaw.keyframe_insert(data_path="location", frame=1020)
        jaw.location = (side * 0.26, 0.45, cz)  # Slammed tightly against pipe!
        jaw.keyframe_insert(data_path="location", frame=1052)
        jaw.keyframe_insert(data_path="location", frame=1200)
        objs.append(jaw)

    # Iconic small red valve wheel in lower-right cellar corner
    bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.03, location=(0.82, 0.10, cz - 0.85), rotation=(math.radians(90), 0, 0))
    wheel = bpy.context.active_object
    wheel.data.materials.append(mat_red)
    objs.append(wheel)

    # Cellar worklight so green steel jaws & timber pop crisply!
    ldata = bpy.data.lights.new("Cellar_Key", type="AREA")
    ldata.energy = 85.0
    ldata.size = 2.0
    lobj = bpy.data.objects.new("Cellar_Key", ldata)
    lobj.location = (0.4, -2.5, cz + 0.5)
    lobj.rotation_euler = (math.radians(82), 0.0, math.radians(10))
    col.objects.link(lobj)
    objs.append(lobj)

    set_vis(objs, 1, False)
    set_vis(objs, 960, True)
    set_vis(objs, 1200, False)
    return cz, objs


# ---------------------------------------------------------------------------
# 6. Iconic Orange-Horsehead Kinematic Pumpjack + 20-Unit Texas Oilfield
# ---------------------------------------------------------------------------
def build_pumpjack_unit(col, name_prefix: str, base_loc: Vector, phase_offset: float, f_start: int, f_end: int, scale: float = 1.0):
    """
    Authentic Mildly Elsewhere Pumpjack:
      - Vivid Orange Curved Horsehead + Massive Orange Tail Counterweights
      - Heavy Black/Rusty Steel A-Frame Samson Post & Oscillating Walking Beam
      - Green Industrial Belt-Drive Motor + Spinning Flywheel on left
      - Reciprocating Bridle & Polished Sucker Rod dropping into wellhead!
    """
    mat_orange = make_simple_mat(f"{name_prefix}_Orange", (0.86, 0.26, 0.04), roughness=0.42, metallic=0.25)
    mat_steel = safe_pbr("rusty_metal_02", (0.14, 0.14, 0.15), roughness=0.48, metallic=0.82)
    mat_green = safe_pbr("green_metal_rust", (0.14, 0.34, 0.18), roughness=0.45, metallic=0.65, tint=(0.4, 0.78, 0.45))

    root = bpy.data.objects.new(f"{name_prefix}_Root", None)
    root.location = base_loc
    root.scale = (scale, scale, scale)
    col.objects.link(root)
    objs = [root]

    def attach(o):
        o.parent = root
        objs.append(o)
        return o

    # Concrete & steel skid base
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-2.2, 0.0, 0.12))
    skid = attach(bpy.context.active_object)
    skid.scale = (6.8, 1.4, 0.24)
    skid.data.materials.append(mat_steel)

    # A-Frame Samson Post (centered at X=-1.6, top saddle pivot at Z=3.8)
    samson_top = Vector((-1.6, 0.0, 3.85))
    for lx, ly in [(-2.5, -0.55), (-2.5, 0.55), (-0.7, -0.55), (-0.7, 0.55)]:
        leg = add_beam(col, f"{name_prefix}_Leg", Vector((lx, ly, 0.2)), samson_top + Vector((0, ly * 0.2, 0)), 0.16, mat_steel)
        attach(leg)

    # Oscillating Walking Beam Pivot Empty at top of Samson Post!
    beam_pivot = bpy.data.objects.new(f"{name_prefix}_BeamPivot", None)
    beam_pivot.location = samson_top
    col.objects.link(beam_pivot)
    attach(beam_pivot)

    # Main I-Beam spanning from tail (X=-2.8) to horsehead nose (X=+1.6)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.6, 0.0, 0.0))
    beam = bpy.context.active_object
    beam.scale = (4.6, 0.28, 0.36)
    beam.data.materials.append(mat_steel)
    beam.parent = beam_pivot
    objs.append(beam)

    # Iconic Curved Orange Horsehead at front (+X) of walking beam!
    bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=1.05, depth=0.38, location=(1.45, 0.0, -0.15), rotation=(math.radians(90), 0, 0))
    head = bpy.context.active_object
    head.scale = (0.48, 1.0, 1.0)
    # Clip back half of cylinder vertices so it forms a crisp D-shaped curved horsehead arc!
    for v in head.data.vertices:
        if v.co.x < 0.0:
            v.co.x = -0.15
    head.data.materials.append(mat_orange)
    head.parent = beam_pivot
    objs.append(head)

    # Massive Stacked Orange Counterweights on rear tail (-X) of walking beam!
    for wi in range(3):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-2.45 - wi * 0.28, 0.0, 0.0))
        wt = bpy.context.active_object
        wt.scale = (0.22, 0.72, 1.05)
        wt.data.materials.append(mat_orange)
        wt.parent = beam_pivot
        objs.append(wt)

    # Green Industrial Motor + Spinning Flywheel on far left (X=-4.6)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.6, 0.0, 0.75))
    motor = attach(bpy.context.active_object)
    motor.scale = (1.35, 0.95, 1.05)
    motor.data.materials.append(mat_green)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.68, minor_radius=0.09, location=(-4.2, -0.55, 0.95), rotation=(math.radians(90), 0, 0))
    flywheel = attach(bpy.context.active_object)
    flywheel.data.materials.append(mat_green)

    # Pitman connecting rod + bridle cable + wellhead stuffing box at X=+0.15
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.055, depth=3.6, location=(0.05, 0.0, 1.9))
    rod = attach(bpy.context.active_object)
    rod.data.materials.append(mat_steel)

    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.22, depth=0.95, location=(0.05, 0.0, 0.45))
    wellhead = attach(bpy.context.active_object)
    wellhead.data.materials.append(mat_steel)

    # Smooth Kinematic Nodding Animation (oscillating beam + spinning flywheel + reciprocating rod!)
    for f in range(f_start, f_end + 1, 6):
        ang = (f - f_start) * 0.11 + phase_offset
        tilt = math.radians(17.5) * math.sin(ang)
        beam_pivot.rotation_euler = (0.0, tilt, 0.0)
        beam_pivot.keyframe_insert(data_path="rotation_euler", frame=f)

        flywheel.rotation_euler = (math.radians(90), ang * 2.0, 0.0)
        flywheel.keyframe_insert(data_path="rotation_euler", frame=f)

        rod.location.z = 1.9 - 0.52 * math.sin(ang)
        rod.keyframe_insert(data_path="location", frame=f)

    return root, objs


# ---------------------------------------------------------------------------
# Camera Keyframe Utility
# ---------------------------------------------------------------------------
def cam_kf(cam, target, frame: int, cloc, tloc, lens: float = 42.0):
    cam.location = cloc
    target.location = tloc
    cam.data.lens = lens
    cam.keyframe_insert(data_path="location", frame=frame)
    target.keyframe_insert(data_path="location", frame=frame)
    cam.data.keyframe_insert(data_path="lens", frame=frame)


# ---------------------------------------------------------------------------
# Master Scene Assembly & Render
# ---------------------------------------------------------------------------
def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    setup_scene_6gb(scene)
    setup_texas_sky_and_sun(scene)

    col = scene.collection
    print("[BUILD] 1/6 Building Texas prairie & stratified 3D earth cutaway...")
    build_texas_earth_and_prairie(col)

    print("[BUILD] 2/6 Building Spindletop wooden lattice derrick, drill string & mud VFX...")
    derrick_objs = build_spindletop_derrick(col)
    pipe, mud, arrows, rubble = build_drill_string_and_mud_vfx(col)

    # Hide derrick AND drill pipe during Pumpjack era (frames 1385..1790) so Pumpjack stands cleanly!
    set_vis(derrick_objs + [pipe], 1, True)
    set_vis(derrick_objs + [pipe], 1384, True)
    set_vis(derrick_objs + [pipe], 1385, False)

    print("[BUILD] 3/6 Building 10-story oil gusher, chalk skyscraper & sparks...")
    build_gusher_skyscraper_and_sparks(col)

    print("[BUILD] 4/6 Building macro oil-soaked river pebbles & clear glass gas bubbles...")
    macro_origin, _ = build_macro_pebbles_stage(col)

    print("[BUILD] 5/6 Building Blowout Preventer (BOP) in timber cellar...")
    bop_z, _ = build_bop_cellar(col)

    print("[BUILD] 6/6 Building hero Orange-Horsehead Pumpjack + 18-unit Texas oilfield...")
    _, hero_pj_objs = build_pumpjack_unit(col, "Hero_Pumpjack", Vector((0.0, 0.45, 0.0)), 0.0, 1385, TOTAL_FRAMES, scale=1.0)
    set_vis(hero_pj_objs, 1, False)
    set_vis(hero_pj_objs, 1385, True)

    # 16 background pumpjacks nodding across the golden Texas prairie for the epic aerial finale!
    rng = random.Random(88)
    bg_pj_objs = []
    bg_spots = [
        (-12, 16), (11, 18), (-22, 26), (-4, 28), (18, 25), (30, 32),
        (-30, 42), (-14, 44), (5, 42), (24, 46), (-20, 60), (0, 58),
        (16, 62), (-8, 76), (12, 78), (-26, 72),
    ]
    for idx, (px, py) in enumerate(bg_spots):
        _, objs = build_pumpjack_unit(
            col,
            f"Field_PJ_{idx:02d}",
            Vector((px, py, 0.0)),
            phase_offset=rng.uniform(0, math.tau),
            f_start=1670,
            f_end=TOTAL_FRAMES,
            scale=rng.uniform(0.85, 1.08),
        )
        bg_pj_objs.extend(objs)
    set_vis(bg_pj_objs, 1, False)
    set_vis(bg_pj_objs, 1670, True)

    # Subsurface Rod Pump plunger (visible inside casing during Shot G: 1300..1384)
    mat_plunger = make_simple_mat("Subsurface_Plunger", (0.78, 0.80, 0.82), roughness=0.22, metallic=0.88)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.34, depth=2.6, location=(0.0, 0.45, -10.0))
    plunger = bpy.context.active_object
    plunger.data.materials.append(mat_plunger)
    for f in range(1300, 1385, 8):
        plunger.location.z = -10.0 + 1.1 * math.sin((f - 1300) * 0.25)
        plunger.keyframe_insert(data_path="location", frame=f)
    set_vis([plunger], 1, False)
    set_vis([plunger], 1300, True)
    set_vis([plunger], 1385, False)

    # -----------------------------------------------------------------------
    # Camera Choreography (Synced to Exact 74.58s Mildly Elsewhere Audio!)
    # -----------------------------------------------------------------------
    target = bpy.data.objects.new("Camera_Target", None)
    col.objects.link(target)
    cdata = bpy.data.cameras.new("Main_Camera")
    cdata.clip_start = 0.05
    cdata.clip_end = 600.0
    cam = bpy.data.objects.new("Main_Camera", cdata)
    col.objects.link(cam)
    track = cam.constraints.new(type="TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam

    # Shot A (1-88): Fast vertical hook whip-tilt -> Hero wide Texas Derrick + Cutaway + Gusher
    cam_kf(cam, target, 1, (0.0, -24.0, 18.0), (0.0, 0.5, 10.0), 36.0)
    cam_kf(cam, target, 24, (0.0, -26.0, 5.0), (0.0, 0.5, 4.5), 36.0)
    cam_kf(cam, target, 88, (0.0, -28.0, 4.2), (0.0, 0.5, 4.0), 38.0)

    # Shot B (89-396): Underground Borehole Cutaway (sand cave-in -> mud + arrows -> deep oil!)
    cam_kf(cam, target, 89, (0.0, -5.8, -6.5), (0.0, 0.4, -6.8), 44.0)
    cam_kf(cam, target, 165, (0.0, -5.6, -8.5), (0.0, 0.4, -8.8), 44.0)
    cam_kf(cam, target, 305, (0.0, -6.0, -9.2), (0.0, 0.4, -9.4), 42.0)
    cam_kf(cam, target, 396, (0.0, -5.8, -23.5), (0.0, 0.4, -24.2), 42.0)

    # Shot C (397-540): Rig floor mud kick (397-445) -> Worm's-eye STRAIGHT UP inside derrick (446-540)!
    cam_kf(cam, target, 397, (0.8, -4.6, 2.2), (0.0, 0.5, -0.5), 40.0)
    cam_kf(cam, target, 445, (0.6, -4.4, 2.0), (0.0, 0.5, -0.2), 40.0)
    cam_kf(cam, target, 446, (0.65, -0.35, 1.3), (0.0, 0.85, 16.5), 24.0)
    cam_kf(cam, target, 540, (0.55, -0.25, 2.8), (0.0, 0.85, 19.0), 24.0)

    # Shot D (541-768): 10-Story Gusher + Skyscraper (541-650) -> Dark Oil Rain (651-711) -> Prairie Sparks (712-768)
    cam_kf(cam, target, 541, (-1.8, -32.0, 8.0), (-1.5, 0.5, 8.5), 34.0)
    cam_kf(cam, target, 650, (-2.2, -35.0, 9.5), (-1.8, 0.5, 9.5), 34.0)
    cam_kf(cam, target, 651, (0.0, -29.0, 7.0), (0.0, 0.5, 8.0), 36.0)
    cam_kf(cam, target, 711, (0.0, -31.0, 7.5), (0.0, 0.5, 8.5), 36.0)
    cam_kf(cam, target, 712, (-4.0, -14.0, 5.2), (0.0, 20.0, 6.0), 35.0)
    cam_kf(cam, target, 768, (2.0, -14.0, 5.2), (4.0, 20.0, 5.5), 35.0)

    # Shot E (769-960): Fast borehole plunge (769-825) -> Macro glossy river pebbles + clear glass gas bubbles (826-960)!
    cam_kf(cam, target, 769, (0.0, -5.0, -4.0), (0.0, 0.4, -5.0), 42.0)
    cam_kf(cam, target, 825, (0.0, -4.5, -26.0), (0.0, 0.4, -26.5), 42.0)
    cam_kf(cam, target, 826, (macro_origin.x, macro_origin.y - 3.9, macro_origin.z), (macro_origin.x, macro_origin.y, macro_origin.z), 48.0)
    cam_kf(cam, target, 960, (macro_origin.x + 0.12, macro_origin.y - 3.4, macro_origin.z + 0.10), (macro_origin.x, macro_origin.y, macro_origin.z), 52.0)

    # Shot F (961-1200): Timber Cellar Blowout Preventer (BOP) hydraulic jaws slamming shut -> pull-out to clean well
    cam_kf(cam, target, 961, (0.0, -3.8, bop_z + 0.25), (0.0, 0.45, bop_z), 42.0)
    cam_kf(cam, target, 1135, (0.0, -3.3, bop_z + 0.05), (0.0, 0.45, bop_z), 46.0)
    cam_kf(cam, target, 1136, (0.0, -24.0, 4.5), (0.0, 0.5, 4.0), 38.0)
    cam_kf(cam, target, 1200, (0.0, -26.0, 4.2), (0.0, 0.5, 3.8), 38.0)

    # Shot G (1201-1384): Wooden Oil Storage Tank (1201-1299) -> Subsurface Rod Pump inside shaft (1300-1384)
    cam_kf(cam, target, 1201, (6.0, -4.5, 3.2), (8.5, 4.2, 1.4), 40.0)
    cam_kf(cam, target, 1299, (7.5, -2.5, 2.8), (8.5, 4.2, 1.3), 42.0)
    cam_kf(cam, target, 1300, (0.0, -5.2, -9.5), (0.0, 0.45, -10.0), 46.0)
    cam_kf(cam, target, 1384, (0.0, -5.2, -10.2), (0.0, 0.45, -10.0), 46.0)

    # Shot H (1385-1790): Iconic Orange-Horsehead Pumpjack (full side profile -> motor/weights -> 16-unit Texas field!)
    cam_kf(cam, target, 1385, (-2.2, -15.0, 2.3), (-2.0, 0.45, 1.6), 36.0)
    cam_kf(cam, target, 1510, (-2.0, -13.5, 2.5), (-1.9, 0.45, 1.8), 38.0)
    cam_kf(cam, target, 1511, (-4.2, -6.5, 1.6), (-4.0, 0.45, 1.1), 42.0)
    cam_kf(cam, target, 1575, (-3.2, -7.8, 2.6), (-2.6, 0.45, 2.6), 40.0)
    cam_kf(cam, target, 1576, (-2.2, -14.2, 2.4), (-2.0, 0.45, 1.8), 36.0)
    cam_kf(cam, target, 1669, (-2.2, -14.8, 2.5), (-2.0, 0.45, 1.8), 36.0)
    # Epic aerial crane-up revealing the entire Texas Pumpjack oilfield!
    cam_kf(cam, target, 1670, (-2.0, -14.0, 4.2), (-0.5, 8.0, 1.2), 34.0)
    cam_kf(cam, target, TOTAL_FRAMES, (0.0, -24.0, 13.5), (0.0, 22.0, 0.5), 32.0)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    blend_path = OUT_DIR / "texas_oil_world.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(f"[OK] Saved master Texas Oilfield world -> {blend_path}")

    if "--preview" in sys.argv:
        previews = [
            ("p1_derrick", 60),
            ("p2_borehole_arrows", 220),
            ("p3_uplook", 480),
            ("p4_gusher_bldg", 615),
            ("p5_pebbles_bubbles", 905),
            ("p6_bop_jaws", 1070),
            ("p7_pumpjack_hero", 1450),
            ("p8_pumpjack_field", 1765),
        ]
        for label, fr in previews:
            scene.frame_set(fr)
            out_p = OUT_DIR / f"{label}.png"
            scene.render.filepath = str(out_p)
            bpy.ops.render.render(write_still=True)
            print(f"[PREVIEW] {label} (f{fr}) -> {out_p}")
        return

    # Full 1,790-frame animation render (supports optional --start N --end M)
    s_fr, e_fr = 1, TOTAL_FRAMES
    if "--start" in sys.argv:
        s_fr = int(sys.argv[sys.argv.index("--start") + 1])
    if "--end" in sys.argv:
        e_fr = int(sys.argv[sys.argv.index("--end") + 1])
    scene.frame_start = s_fr
    scene.frame_end = e_fr
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(FRAMES_DIR / "frame_")
    print(f"[RENDER] Rendering frames {s_fr}..{e_fr} @ 720x1280 to {FRAMES_DIR}...")
    bpy.ops.render.render(animation=True)
    print(f"[DONE] Rendered frames {s_fr}..{e_fr}!")


if __name__ == "__main__":
    main()
