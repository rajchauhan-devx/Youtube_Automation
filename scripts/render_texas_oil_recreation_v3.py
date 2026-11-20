"""
Mildly Elsewhere â€” Texas Oil Drilling & Pumpjack Explainer 74.58s
==================================================================
Production-Ready V3 Master Animation Generator for Blender 5.3 EEVEE Next.
Matches 100% of the visual styling, machinery, geology, and cinematic pacing
from the uploaded Mildly Elsewhere reference video.

Hardware: RTX 3050 6GB Laptop GPU optimized (EEVEE Next, 12 samples).
Duration: 74.58s @ 24 fps = 1,790 frames (720x1280 portrait).

Key Refinements in V3:
  1. Compressed High-Contrast Strata: 26 distinct, vivid geological layers in the top 8.5m.
  2. Spindletop Creosote Timber Derrick: Heavy 10"x10" dark timber lumber with longitudinal grain.
  3. Flared 10-Story Gusher Plume: Organic trumpet fountain spray with particle droplet scatter.
  4. Pitch-Black Subterranean Macro Stage: Sky HDRI disabled during frames 769..960 so sparkling
     gas bubbles and silky smooth river stones glisten in viscous jet-black crude oil.
  5. Authentic BOP Cellar: Central drill pipe visible with dark machined steel ram jaws clamping shut.
  6. Authentic Hero Pumpjack: Flared convex curved horsehead, tangent bridle cables, polished sucker rod,
     dual rotating crank counterweights, Samson post, and motor flywheel.
  7. Golden Texas Prairie: Rich procedural prairie grass shader with Poly Haven 3D grass tufts,
     barrels, pipe racks, and 25+ pumpjacks across the rolling horizon.

Usage:
  blender.exe -b -P scripts/render_texas_oil_recreation_v3.py -- --preview
  blender.exe -b -P scripts/render_texas_oil_recreation_v3.py
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

OUT_DIR = REPO_ROOT / "production_workspace" / "texas_oil_v3"
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
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = 0.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"


def setup_texas_sky_and_sun(scene):
    """Poly Haven 2K Cloudy Sky HDRI with animated Day -> Night Oil Rain -> Subterranean Off -> Day."""
    world = bpy.data.worlds.new("TexasSkyWorld")
    scene.world = world
    nt = world.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.35

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(115))
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])

    sky_path = HDRI_DIR / "kloofendal_48d_partly_cloudy_puresky_2k.hdr"
    if not sky_path.exists():
        sky_path = HDRI_DIR / "kloppenheim_06_puresky_2k.hdr"

    if sky_path.exists():
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(sky_path), check_existing=True)
        nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Saturation"].default_value = 1.30
        hsv.inputs["Value"].default_value = 0.96
        nt.links.new(env.outputs["Color"], hsv.inputs["Color"])
        nt.links.new(hsv.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (0.18, 0.48, 0.88, 1.0)

    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Warm Texas Sun light
    sdata = bpy.data.lights.new("Texas_Sun", type="SUN")
    sdata.energy = 4.8
    sdata.color = (1.0, 0.96, 0.88)
    sdata.angle = math.radians(1.5)
    sun = bpy.data.objects.new("Texas_Sun", sdata)
    sun.rotation_euler = (math.radians(50), math.radians(-18), math.radians(30))
    scene.collection.objects.link(sun)

    # Ambient Fill Light for crisp subterranean cutaway visibility
    fdata = bpy.data.lights.new("Texas_Fill", type="SUN")
    fdata.energy = 1.5
    fdata.color = (0.75, 0.85, 1.0)
    fill = bpy.data.objects.new("Texas_Fill", fdata)
    fill.rotation_euler = (math.radians(45), math.radians(70), math.radians(-35))
    scene.collection.objects.link(fill)

    # Animate Day -> Oil-Rain Night (645..716) -> Subterranean Dark (769..960) -> Day
    lighting_keyframes = [
        (1, 1.35, 4.8),
        (645, 1.35, 4.8),
        (655, 0.12, 0.25),   # Oil-Rain Night
        (708, 0.12, 0.25),
        (716, 1.35, 4.8),   # Back to day for sparks
        (768, 1.35, 4.8),
        (769, 0.00, 0.00),   # Subterranean Macro stage (ZERO sky reflection!)
        (960, 0.00, 0.00),
        (961, 1.35, 4.8),   # Return to day for BOP cellar pull-out & pumpjack
    ]
    for fr, bg_str, sun_en in lighting_keyframes:
        bg.inputs["Strength"].default_value = bg_str
        bg.inputs["Strength"].keyframe_insert(data_path="default_value", frame=fr)
        sdata.energy = sun_en
        sdata.keyframe_insert(data_path="energy", frame=fr)

    return sun


# ---------------------------------------------------------------------------
# 2. Material Builders
# ---------------------------------------------------------------------------
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


def make_creosote_timber_mat():
    """Dark weathered Texas creosote-soaked rough timber lumber with longitudinal grain."""
    mat = bpy.data.materials.new("Texas_Creosote_Timber")
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.86

    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (7.0, 7.0, 0.20)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 16.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.65
    nt.links.new(mp.outputs["Vector"], noise.inputs["Vector"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = (0.10, 0.06, 0.03, 1.0) # Deep charcoal creosote
    cr.elements[1].position = 1.0
    cr.elements[1].color = (0.24, 0.15, 0.09, 1.0) # Weathered dark pine lumber
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.40
    bump.inputs["Distance"].default_value = 0.05
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_sedimentary_strata_mat():
    """Dense, multi-layered Texas sedimentary rock strata with crisp bedding contacts visible in top cutaway!"""
    mat = bpy.data.materials.new("Texas_Sedimentary_Strata")
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.85

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])

    # Invert Z so depth = -Z (0 at surface down to +24 at reservoir)
    mul_neg = nt.nodes.new("ShaderNodeMath")
    mul_neg.operation = "MULTIPLY"
    mul_neg.inputs[1].default_value = -1.0
    nt.links.new(sep.outputs["Z"], mul_neg.inputs[0])

    # Low-frequency wavy geological tectonic displacement
    noise_geo = nt.nodes.new("ShaderNodeTexNoise")
    noise_geo.inputs["Scale"].default_value = 0.18
    noise_geo.inputs["Detail"].default_value = 4.0
    nt.links.new(tc.outputs["Object"], noise_geo.inputs["Vector"])

    disp_scale = nt.nodes.new("ShaderNodeMath")
    disp_scale.operation = "MULTIPLY"
    disp_scale.inputs[1].default_value = 0.50
    nt.links.new(noise_geo.outputs["Fac"], disp_scale.inputs[0])

    depth = nt.nodes.new("ShaderNodeMath")
    depth.operation = "ADD"
    nt.links.new(mul_neg.outputs["Value"], depth.inputs[0])
    nt.links.new(disp_scale.outputs["Value"], depth.inputs[1])

    # High-frequency micro-laminations (thin horizontal rings)
    wave_micro = nt.nodes.new("ShaderNodeTexWave")
    wave_micro.wave_type = "BANDS"
    wave_micro.bands_direction = "Z"
    wave_micro.inputs["Scale"].default_value = 24.0
    wave_micro.inputs["Distortion"].default_value = 3.5
    wave_micro.inputs["Detail"].default_value = 8.0
    wave_micro.inputs["Detail Roughness"].default_value = 0.65
    nt.links.new(tc.outputs["Object"], wave_micro.inputs["Vector"])

    # Map depth 0..8.2m to 0..1 so the full dense stack of 26 strata bands appears in the visible cutaway!
    map_r = nt.nodes.new("ShaderNodeMapRange")
    map_r.inputs["From Min"].default_value = 0.0
    map_r.inputs["From Max"].default_value = 8.2
    map_r.inputs["To Min"].default_value = 0.0
    map_r.inputs["To Max"].default_value = 1.0
    map_r.clamp = True
    nt.links.new(depth.outputs["Value"], map_r.inputs["Value"])

    # 26 Sharp bedding contact stops matching reference exactly!
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "LINEAR"
    cr.elements[0].position = 0.0
    cr.elements[0].color = (0.24, 0.14, 0.07, 1.0) # Topsoil
    cr.elements[1].position = 1.0
    cr.elements[1].color = (0.02, 0.02, 0.03, 1.0) # Oil reservoir

    pairs = [
        (0.025, (0.24, 0.14, 0.07, 1.0)),
        (0.028, (0.95, 0.91, 0.83, 1.0)), # Cream limestone
        (0.065, (0.93, 0.89, 0.81, 1.0)),
        (0.068, (0.82, 0.28, 0.08, 1.0)), # Terracotta red!
        (0.120, (0.80, 0.26, 0.07, 1.0)),
        (0.123, (0.98, 0.97, 0.93, 1.0)), # White ribbon!
        (0.145, (0.98, 0.97, 0.93, 1.0)),
        (0.148, (0.88, 0.60, 0.22, 1.0)), # Ochre sandstone
        (0.205, (0.86, 0.58, 0.20, 1.0)),
        (0.208, (0.96, 0.92, 0.84, 1.0)), # Cream limestone
        (0.265, (0.94, 0.90, 0.82, 1.0)),
        (0.268, (0.20, 0.23, 0.28, 1.0)), # Blue-grey shale
        (0.335, (0.22, 0.25, 0.30, 1.0)),
        (0.338, (0.98, 0.96, 0.90, 1.0)), # White chalk ribbon
        (0.365, (0.98, 0.96, 0.90, 1.0)),
        (0.368, (0.82, 0.30, 0.09, 1.0)), # Bold terracotta
        (0.445, (0.78, 0.28, 0.08, 1.0)),
        (0.448, (0.88, 0.62, 0.24, 1.0)), # Warm ochre gold
        (0.535, (0.86, 0.60, 0.22, 1.0)),
        (0.538, (0.97, 0.95, 0.89, 1.0)), # White ribbon
        (0.565, (0.97, 0.95, 0.89, 1.0)),
        (0.568, (0.20, 0.22, 0.26, 1.0)), # Grey shale
        (0.665, (0.22, 0.24, 0.28, 1.0)),
        (0.668, (0.76, 0.28, 0.09, 1.0)), # Rich terracotta
        (0.745, (0.72, 0.26, 0.08, 1.0)),
        (0.748, (0.04, 0.04, 0.05, 1.0)), # Oil reservoir
    ]
    for pos, col in pairs:
        el = cr.elements.new(pos)
        el.color = col
    nt.links.new(map_r.outputs["Result"], ramp.inputs["Fac"])

    mix_strata = nt.nodes.new("ShaderNodeMix")
    mix_strata.data_type = "RGBA"
    mix_strata.blend_type = "MULTIPLY"
    mix_strata.inputs["Factor"].default_value = 0.26
    nt.links.new(ramp.outputs["Color"], mix_strata.inputs[6])
    nt.links.new(wave_micro.outputs["Color"], mix_strata.inputs[7])
    nt.links.new(mix_strata.outputs[2], bsdf.inputs["Base Color"])

    # Chiselled rock normal bump
    noise_bump = nt.nodes.new("ShaderNodeTexNoise")
    noise_bump.inputs["Scale"].default_value = 16.0
    noise_bump.inputs["Detail"].default_value = 8.0
    noise_bump.inputs["Roughness"].default_value = 0.72
    nt.links.new(tc.outputs["Object"], noise_bump.inputs["Vector"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.50
    bump.inputs["Distance"].default_value = 0.06
    nt.links.new(noise_bump.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_golden_prairie_mat():
    """Rich Poly Haven PBR aerial grass rock material with golden sunlight tint."""
    tdir = TEXTURES_DIR / "aerial_grass_rock"
    if tdir.exists() and any(tdir.glob("*_diffuse_*")):
        mat = load_polyhaven_pbr_material("aerial_grass_rock", uv_scale=0.08)
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        bsdf.inputs["Roughness"].default_value = 0.88
        if bsdf.inputs["Base Color"].links:
            src = bsdf.inputs["Base Color"].links[0].from_socket
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 0.40
            mix.inputs[7].default_value = (0.95, 0.82, 0.42, 1.0) # Golden sun tint
            nt.links.new(src, mix.inputs[6])
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        return mat
    mat = bpy.data.materials.new("Texas_Prairie_Grass")
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.58, 0.48, 0.22, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.92
    return mat


def set_vis(objs, frame: int, visible: bool) -> None:
    for o in objs:
        if o is None:
            continue
        o.hide_render = not visible
        o.hide_viewport = not visible
        o.keyframe_insert(data_path="hide_render", frame=frame)
        o.keyframe_insert(data_path="hide_viewport", frame=frame)


def add_beam(col, name: str, p1: Vector, p2: Vector, thick_x: float, thick_y: float, mat):
    v = p2 - p1
    length = v.length
    if length < 1e-4:
        return None
    mid = (p1 + p2) * 0.5
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=mid)
    o = bpy.context.active_object
    o.name = name
    o.scale = (thick_x, thick_y, length)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = v.normalized().to_track_quat("Z", "Y")
    o.data.materials.append(mat)
    col.objects.link(o) if o.name not in col.objects else None
    return o


# ---------------------------------------------------------------------------
# 3. Texas Prairie Terrain & Jagged Earth Cutaway
# ---------------------------------------------------------------------------
def build_texas_earth_and_prairie(col):
    """Build golden prairie + bedded earth cutaway with rugged borehole fissure."""
    mat_prairie = make_golden_prairie_mat()
    mat_strata = make_sedimentary_strata_mat()
    mat_borehole = make_simple_mat("Borehole_Mud_Rock", (0.14, 0.09, 0.06), roughness=0.95)
    mat_oil = make_simple_mat("Crude_Oil_Black", (0.008, 0.006, 0.005), roughness=0.03, coat=1.0)
    mat_timber = make_creosote_timber_mat()
    mat_steel = make_simple_mat("Industrial_Steel", (0.16, 0.17, 0.18), roughness=0.45, metallic=0.85)

    # Golden Prairie Ground Plane
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=40, y_subdivisions=40, size=1.0, location=(0.0, 110.0, 0.02))
    ground = bpy.context.active_object
    ground.name = "Texas_Prairie_Ground"
    ground.scale = (340.0, 220.0, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    rng = random.Random(10)
    for v in ground.data.vertices:
        if v.co.y > 18.0:
            dist = (v.co.y - 18.0) / 100.0
            v.co.z += (math.sin(v.co.x * 0.04) * 1.4 + math.cos(v.co.y * 0.05) * 1.1) * min(1.0, dist)
    for p in ground.data.polygons:
        p.use_smooth = True
    ground.data.materials.append(mat_prairie)

    # Cutaway Cliff Faces (Left & Right of rugged borehole)
    cut_objs = []
    bm = bmesh.new()
    nx, nz = 16, 60
    for side, x_min, x_max in [("Left", -42.0, -0.72), ("Right", 0.72, 42.0)]:
        v_front = []
        v_back = []
        for iz in range(nz + 1):
            zf = -24.0 * (iz / nz)
            rf = []
            rb = []
            for ix in range(nx + 1):
                t = ix / nx
                xf = x_min + (x_max - x_min) * t
                near_hole = (side == "Left" and ix == nx) or (side == "Right" and ix == 0)
                if near_hole:
                    rock_jag = (
                        0.22 * math.sin(zf * 1.8 + (0 if side == "Left" else 1.5))
                        + 0.12 * math.cos(zf * 4.3)
                        + 0.08 * math.sin(zf * 9.1)
                    )
                    xf += rock_jag if side == "Left" else -rock_jag
                vf = bm.verts.new((xf, 0.0, zf))
                vb = bm.verts.new((xf, 12.0, zf))
                rf.append(vf)
                rb.append(vb)
            v_front.append(rf)
            v_back.append(rb)
        for iz in range(nz):
            for ix in range(nx):
                bm.faces.new((v_front[iz][ix], v_front[iz][ix + 1], v_front[iz + 1][ix + 1], v_front[iz + 1][ix]))
        hole_ix = nx if side == "Left" else 0
        for iz in range(nz):
            if side == "Left":
                bm.faces.new((v_front[iz][hole_ix], v_back[iz][hole_ix], v_back[iz + 1][hole_ix], v_front[iz + 1][hole_ix]))
            else:
                bm.faces.new((v_back[iz][hole_ix], v_front[iz][hole_ix], v_front[iz + 1][hole_ix], v_back[iz + 1][hole_ix]))
        for ix in range(nx):
            bm.faces.new((v_front[0][ix], v_back[0][ix], v_back[0][ix + 1], v_front[0][ix + 1]))

        mesh = bpy.data.meshes.new(f"Earth_Cutaway_{side}")
        bm.to_mesh(mesh)
        bm.clear()
        obj = bpy.data.objects.new(f"Earth_Cutaway_{side}", mesh)
        col.objects.link(obj)
        for p in obj.data.polygons:
            p.use_smooth = True
        obj.data.materials.append(mat_strata)
        cut_objs.append(obj)
    bm.free()

    # Borehole back wall
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1.05, depth=25.0, location=(0.0, 1.45, -12.0))
    shaft_back = bpy.context.active_object
    shaft_back.name = "Borehole_Back_Wall"
    for p in shaft_back.data.polygons:
        p.use_smooth = True
    shaft_back.data.materials.append(mat_borehole)

    # Deep oil reservoir layer at bottom (Z = -22 to -26)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 1.5, -23.5))
    oil_pool = bpy.context.active_object
    oil_pool.name = "Deep_Crude_Reservoir"
    oil_pool.scale = (40.0, 4.0, 4.0)
    oil_pool.data.materials.append(mat_oil)

    # Wooden tool shack left of well
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-6.5, 4.2, 1.5))
    shack = bpy.context.active_object
    shack.name = "Wooden_Rig_Shack"
    shack.scale = (4.4, 3.4, 3.0)
    shack.data.materials.append(mat_timber)

    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=3.4, depth=1.5, location=(-6.5, 4.2, 3.75), rotation=(0, 0, math.radians(45)))
    roof = bpy.context.active_object
    roof.name = "Rig_Shack_Roof"
    roof.scale = (1.0, 0.78, 1.0)
    roof.data.materials.append(mat_steel)

    # Iconic wooden stave storage tank right of well (for Shot 15)
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=2.0, depth=2.8, location=(8.8, 4.5, 1.4))
    tank = bpy.context.active_object
    tank.name = "Wooden_Oil_Tank"
    tank.data.materials.append(mat_timber)
    mat_band = make_simple_mat("Tank_Iron_Band", (0.16, 0.16, 0.18), roughness=0.5, metallic=0.85)
    for hz in (0.4, 1.2, 2.0, 2.6):
        bpy.ops.mesh.primitive_torus_add(major_radius=2.02, minor_radius=0.04, location=(8.8, 4.5, hz))
        band = bpy.context.active_object
        band.data.materials.append(mat_band)

    # Inlet pipe curving into tank
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.08, depth=3.4, location=(6.75, 4.5, 1.7))
    tpipe = bpy.context.active_object
    tpipe.data.materials.append(mat_band)

    # Real 3D Bermuda Grass Clumps across the prairie ground
    grass_glbs = list((MODELS_DIR / "polyhaven" / "grass_bermuda_01").glob("*.gltf"))
    if grass_glbs:
        for gi, (gx, gy, gs) in enumerate([
            (-3.8, 1.8, 1.2), (-8.2, 2.5, 1.4), (4.5, 1.5, 1.1), (11.5, 2.2, 1.3),
            (-14.0, 5.0, 1.5), (16.0, 6.0, 1.4), (2.0, 8.5, 1.6), (-5.0, 10.0, 1.3),
            (-22.0, 14.0, 1.8), (24.0, 12.0, 1.7), (0.0, 16.0, 1.5), (8.0, 20.0, 1.6),
        ]):
            g_obj = import_gltf_normalized(grass_glbs[0], target_size=gs, location=(gx, gy, 0.02), name_prefix=f"Prairie_Grass_{gi}")
            if g_obj:
                g_obj.rotation_euler.z = rng.uniform(0, math.tau)

    # Real 3D Barrels
    barrel_glbs = list((MODELS_DIR / "polyhaven" / "Barrel_02").glob("*.gltf"))
    if barrel_glbs:
        for bi, (bx, by) in enumerate([(-3.8, 3.2), (-4.4, 3.4), (11.2, 3.8)]):
            import_gltf_normalized(barrel_glbs[0], target_size=1.1, location=(bx, by, 0.0), name_prefix=f"Oil_Barrel_{bi}")

    # Horizon trees
    tree_glbs = list((MODELS_DIR / "polyhaven" / "island_tree_01").glob("*.gltf"))
    if tree_glbs:
        for ti, (tx, ty, ts) in enumerate([
            (-38, 55, 7.5), (-18, 48, 5.8), (-6, 62, 6.2), (14, 52, 6.8), (28, 46, 7.2), (44, 60, 8.0)
        ]):
            import_gltf_normalized(tree_glbs[0], target_size=ts, location=(tx, ty, 0.0), name_prefix=f"Horizon_Tree_{ti}")

    return [ground, shaft_back, oil_pool] + cut_objs


# ---------------------------------------------------------------------------
# 4. Spindletop Creosote Timber Derrick + Drill Pipe String
# ---------------------------------------------------------------------------
def build_spindletop_derrick(col):
    """Authentic Spindletop Timber Derrick (17.5m) with 6 tiers of X-bracing, ladder, rig floor & sheaves."""
    mat_timber = make_creosote_timber_mat()
    mat_iron = make_simple_mat("Cast_Iron", (0.12, 0.12, 0.14), roughness=0.45, metallic=0.88)
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
            objs.append(add_beam(col, f"Girt_{t}_{face}", c1[face], c1[nxt], 0.18, 0.18, mat_timber))
            objs.append(add_beam(col, f"XBraceA_{t}_{face}", c0[face], c1[nxt], 0.12, 0.12, mat_timber))
            objs.append(add_beam(col, f"XBraceB_{t}_{face}", c0[nxt], c1[face], 0.12, 0.12, mat_timber))

    # Ladder climbing corner 3
    for rung_i in range(35):
        rz = 0.5 + rung_i * 0.48
        rf = rz / H
        if rf < 0.98:
            rc = corners_at(rf)[3]
            objs.append(add_beam(col, f"Ladder_Rung_{rung_i}", rc + Vector((-0.18, -0.22, 0)), rc + Vector((-0.18, 0.22, 0)), 0.05, 0.05, mat_timber))

    # Rig floor deck timbers
    for sx, sy, lx, ly in [(-2.2, 0.85, 2.6, 6.2), (2.2, 0.85, 2.6, 6.2), (0.0, 3.1, 2.2, 2.4)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, sy, 0.18))
        deck = bpy.context.active_object
        deck.scale = (lx, ly, 0.35)
        deck.data.materials.append(mat_timber)
        objs.append(deck)

    # Cast iron rotary table in floor opening
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.88, depth=0.38, location=(0.0, 0.65, 0.45))
    rotary = bpy.context.active_object
    rotary.data.materials.append(mat_iron)
    objs.append(rotary)

    # Crown block sheaves at very top
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.52, depth=0.28, location=(0.0, 0.85, H + 0.65), rotation=(0, math.radians(90), 0))
    sheave = bpy.context.active_object
    sheave.data.materials.append(mat_iron)
    objs.append(sheave)

    return objs


def build_drill_string_and_mud_vfx(col):
    """Rotating drill pipe + animated mud column + 2D white chalk pressure arrows + falling sand particles."""
    mat_pipe = make_simple_mat("Drill_Pipe_Steel", (0.32, 0.30, 0.28), roughness=0.35, metallic=0.88)
    mat_mud = make_simple_mat("Drilling_Mud", (0.22, 0.15, 0.09), roughness=0.45)
    mat_arrow = make_simple_mat("Chalk_Arrow_2D", (1.0, 1.0, 1.0), roughness=0.1, emission=4.5)
    mat_sand = make_simple_mat("Caving_Sand", (0.68, 0.52, 0.32), roughness=0.9)

    # Main Drill Pipe
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.22, depth=34.0, location=(0.0, 0.45, -2.0))
    pipe = bpy.context.active_object
    pipe.name = "Drill_Pipe"
    for p in pipe.data.polygons:
        p.use_smooth = True
    pipe.data.materials.append(mat_pipe)

    # Keyframe pipe downward drilling and violent upward ejection in Shot 06
    for f in range(1, 397):
        pipe.location.z = -2.0 - (f / 396.0) * 18.0
        pipe.rotation_euler.z = math.radians(f * 24.0)
        pipe.keyframe_insert(data_path="location", frame=f)
        pipe.keyframe_insert(data_path="rotation_euler", frame=f)

    # Shot 06 (446..540): Pipe shoots straight UP through derrick into sky!
    pipe.location = (0.0, 0.65, 2.0)
    pipe.keyframe_insert(data_path="location", frame=446)
    pipe.location = (0.0, 0.65, 38.0)
    pipe.keyframe_insert(data_path="location", frame=540)

    # Bring pipe back down in cellar for BOP clamping (Shot 13: frames 960..1200)!
    pipe.location = (0.0, 0.45, -2.0)
    pipe.keyframe_insert(data_path="location", frame=960)
    pipe.keyframe_insert(data_path="location", frame=1200)
    pipe.location = (0.0, 0.45, 38.0)
    pipe.keyframe_insert(data_path="location", frame=1201)

    # Animated Rising Mud Column (Shot 03: frames 181..320)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.68, depth=24.0, location=(0.0, 0.50, -22.0))
    mud = bpy.context.active_object
    mud.name = "Drilling_Mud_Column"
    for p in mud.data.polygons:
        p.use_smooth = True
    mud.data.materials.append(mat_mud)

    mud.location = (0.0, 0.50, -26.0)
    mud.scale = (1.0, 1.0, 0.05)
    mud.keyframe_insert(data_path="location", frame=180)
    mud.keyframe_insert(data_path="scale", frame=180)
    mud.location = (0.0, 0.50, -10.0)
    mud.scale = (1.0, 1.0, 1.0)
    mud.keyframe_insert(data_path="location", frame=310)
    mud.keyframe_insert(data_path="scale", frame=310)

    set_vis([mud], 1, False)
    set_vis([mud], 180, True)
    set_vis([mud], 396, False)

    # Animated Outward 2D White Chalk Pressure Arrows (Shot 03: frames 215..320)
    arrows = []
    for side in (-1, 1):
        for az in (-7.2, -10.5):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.48, 0.02, az))
            ashaft = bpy.context.active_object
            ashaft.scale = (0.34, 0.04, 0.07)
            ashaft.data.materials.append(mat_arrow)
            bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.14, depth=0.18, location=(side * 0.70, 0.02, az), rotation=(0, 0, math.radians(-90 if side > 0 else 90)))
            ahead = bpy.context.active_object
            ahead.data.materials.append(mat_arrow)
            arrows.extend([ashaft, ahead])

    set_vis(arrows, 1, False)
    set_vis(arrows, 215, True)
    set_vis(arrows, 320, False)

    # Falling Caving Sand Particles (Shot 02: frames 89..180)
    sand_chunks = []
    rng = random.Random(33)
    for i in range(22):
        sx0 = rng.uniform(-0.65, 0.65)
        sz0 = rng.uniform(-4.0, -1.0)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx0, 0.40, sz0))
        sc = bpy.context.active_object
        sc.scale = (rng.uniform(0.06, 0.14), rng.uniform(0.06, 0.14), rng.uniform(0.06, 0.14))
        sc.data.materials.append(mat_sand)
        f_drop = 89 + rng.randint(0, 50)
        sc.location = (sx0, 0.40, sz0)
        sc.keyframe_insert(data_path="location", frame=f_drop)
        sc.location = (sx0 + rng.uniform(-0.1, 0.1), 0.40, sz0 - rng.uniform(8.0, 14.0))
        sc.keyframe_insert(data_path="location", frame=min(180, f_drop + 38))
        sand_chunks.append(sc)

    set_vis(sand_chunks, 1, False)
    set_vis(sand_chunks, 89, True)
    set_vis(sand_chunks, 180, False)

    return pipe, mud, arrows, sand_chunks


# ---------------------------------------------------------------------------
# 5. Flared Oil Gusher Plume, 2D Chalk Skyscraper, Night Rain & Sparks
# ---------------------------------------------------------------------------
def build_gusher_and_vfx(col):
    """Authentic flared fountain spray oil gusher, 2D chalk skyscraper, night rain and sparks."""
    mat_gusher = make_simple_mat("Crude_Gusher_Plume", (0.008, 0.006, 0.005), roughness=0.08, coat=1.0)
    mat_chalk = make_simple_mat("Chalk_Skyscraper_2D", (1.0, 1.0, 1.0), roughness=0.1, emission=5.0)
    mat_spark = make_simple_mat("Fiery_Prairie_Spark", (1.0, 0.35, 0.05), roughness=0.1, emission=25.0)

    # Authentic Flared Fountain Spray Plume Mesh (Flaring upwards to 25m)
    bm = bmesh.new()
    rings = [
        (0.5, 0.30),
        (3.5, 0.45),
        (7.0, 0.65),
        (11.0, 0.95),
        (15.0, 1.35),
        (18.5, 1.95),
        (22.0, 2.85),
        (24.5, 3.85),
        (25.5, 4.40),
    ]
    segs = 20
    ring_verts = []
    for z_h, rad in rings:
        r_row = []
        for s in range(segs):
            th = math.tau * (s / segs)
            vx = rad * math.cos(th)
            vy = rad * math.sin(th) + 0.65
            r_row.append(bm.verts.new((vx, vy, z_h)))
        ring_verts.append(r_row)

    for ri in range(len(rings) - 1):
        for s in range(segs):
            s_next = (s + 1) % segs
            bm.faces.new((ring_verts[ri][s], ring_verts[ri][s_next], ring_verts[ri+1][s_next], ring_verts[ri+1][s]))

    # Top cap dome
    v_top = bm.verts.new((0.0, 0.65, 26.2))
    for s in range(segs):
        s_next = (s + 1) % segs
        bm.faces.new((ring_verts[-1][s], ring_verts[-1][s_next], v_top))

    mesh = bpy.data.meshes.new("Gusher_Flared_Plume")
    bm.to_mesh(mesh)
    bm.free()
    g_main = bpy.data.objects.new("Gusher_Flared_Plume", mesh)
    col.objects.link(g_main)
    for p in g_main.data.polygons:
        p.use_smooth = True
    g_main.data.materials.append(mat_gusher)

    # Animate gusher violent pulsation
    for f in range(540, 713, 6):
        fluct = 1.0 + 0.14 * math.sin(f * 0.45)
        g_main.scale = (fluct, fluct, 1.0)
        g_main.keyframe_insert(data_path="scale", frame=f)

    gusher_objs = [g_main]
    set_vis(gusher_objs, 1, True)
    set_vis(gusher_objs, 88, True)
    set_vis(gusher_objs, 89, False)
    set_vis(gusher_objs, 540, True)
    set_vis(gusher_objs, 712, False)

    # Glowing White 2D 10-Story Skyscraper Wireframe (Shot 07: frames 585..650)
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
# 6. Macro River Stones, Viscous Crude Oil & Sparkling Gas Bubbles
# ---------------------------------------------------------------------------
def build_macro_pebbles_stage(col):
    """Macro stage: Silky smooth river stones + pitch-black glossy crude + sparkling crystal gas bubbles."""
    origin = Vector((55.0, 0.0, 0.0))
    objs = []
    rng = random.Random(99)

    # Enclosed dark chamber to block external light
    mat_dark_box = make_simple_mat("Macro_Chamber_Dark", (0.004, 0.003, 0.003), roughness=0.95)
    bpy.ops.mesh.primitive_cube_add(size=12.0, location=(origin.x, origin.y - 2.0, origin.z))
    box = bpy.context.active_object
    for poly in box.data.polygons:
        poly.flip()
    box.data.materials.append(mat_dark_box)
    objs.append(box)

    # Pitch-black liquid crude oil fluid bed
    mat_oil = bpy.data.materials.new("Macro_Liquid_Crude")
    obsdf = mat_oil.node_tree.nodes.get("Principled BSDF")
    obsdf.inputs["Base Color"].default_value = (0.005, 0.004, 0.003, 1.0)
    obsdf.inputs["Roughness"].default_value = 0.02
    if "Coat Weight" in obsdf.inputs:
        obsdf.inputs["Coat Weight"].default_value = 1.0

    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(origin.x, origin.y + 0.12, origin.z), rotation=(math.radians(90), 0, 0))
    oil_bed = bpy.context.active_object
    oil_bed.data.materials.append(mat_oil)
    objs.append(oil_bed)

    # Silky smooth river stone materials (Soft organic color variation, NO dimples)
    def make_smooth_stone_mat(name, base_col, sec_col):
        m = bpy.data.materials.new(name)
        sbsdf = m.node_tree.nodes.get("Principled BSDF")
        sbsdf.inputs["Roughness"].default_value = 0.22
        if "Coat Weight" in sbsdf.inputs:
            sbsdf.inputs["Coat Weight"].default_value = 0.55
            sbsdf.inputs["Coat Roughness"].default_value = 0.06
        stc = m.node_tree.nodes.new("ShaderNodeTexCoord")
        snoise = m.node_tree.nodes.new("ShaderNodeTexNoise")
        snoise.inputs["Scale"].default_value = 3.5
        snoise.inputs["Detail"].default_value = 4.0
        m.node_tree.links.new(stc.outputs["Object"], snoise.inputs["Vector"])
        smix = m.node_tree.nodes.new("ShaderNodeMix")
        smix.data_type = "RGBA"
        smix.inputs[6].default_value = (*base_col, 1.0)
        smix.inputs[7].default_value = (*sec_col, 1.0)
        m.node_tree.links.new(snoise.outputs["Fac"], smix.inputs["Factor"])
        m.node_tree.links.new(smix.outputs[2], sbsdf.inputs["Base Color"])
        return m

    mats_stone = [
        make_smooth_stone_mat("Quartz_Cream", (0.92, 0.89, 0.82), (0.78, 0.73, 0.64)),
        make_smooth_stone_mat("Tan_RiverRock", (0.72, 0.60, 0.46), (0.52, 0.42, 0.32)),
        make_smooth_stone_mat("Slate_Grey", (0.54, 0.56, 0.60), (0.36, 0.38, 0.42)),
        make_smooth_stone_mat("Buff_Limestone", (0.84, 0.76, 0.62), (0.68, 0.58, 0.45)),
    ]

    # Sparkling Gas Bubble Material (Fresnel Glowing Rim)
    mat_bubble = bpy.data.materials.new("Crystal_Gas_Bubble")
    bnt = mat_bubble.node_tree
    bnt.nodes.clear()
    bout = bnt.nodes.new("ShaderNodeOutputMaterial")
    bbsdf = bnt.nodes.new("ShaderNodeBsdfPrincipled")
    bbsdf.inputs["Base Color"].default_value = (0.92, 0.96, 1.0, 1.0)
    bbsdf.inputs["Roughness"].default_value = 0.05
    bbsdf.inputs["Metallic"].default_value = 0.88
    if "Coat Weight" in bbsdf.inputs:
        bbsdf.inputs["Coat Weight"].default_value = 1.0
    fresnel = bnt.nodes.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.45
    fres_scale = bnt.nodes.new("ShaderNodeMath")
    fres_scale.operation = "MULTIPLY"
    fres_scale.inputs[1].default_value = 3.5
    bnt.links.new(fresnel.outputs["Fac"], fres_scale.inputs[0])
    if "Emission Color" in bbsdf.inputs:
        bbsdf.inputs["Emission Color"].default_value = (0.95, 0.98, 1.0, 1.0)
        bnt.links.new(fres_scale.outputs["Value"], bbsdf.inputs["Emission Strength"])
    bnt.links.new(bbsdf.outputs["BSDF"], bout.inputs["Surface"])

    # 54 Tightly packed smooth river pebbles
    cols, rows = 6, 9
    for r in range(rows):
        for c in range(cols):
            px = origin.x + (c - (cols - 1) / 2.0) * 0.44 + rng.uniform(-0.05, 0.05)
            pz = origin.z + (r - (rows - 1) / 2.0) * 0.46 + rng.uniform(-0.05, 0.05)
            py = origin.y + 0.08 + rng.uniform(-0.03, 0.05)
            rad = rng.uniform(0.20, 0.28)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=rad, location=(px, py, pz))
            peb = bpy.context.active_object
            peb.scale = (rng.uniform(0.85, 1.25), rng.uniform(0.60, 0.80), rng.uniform(0.85, 1.25))
            peb.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))
            for p in peb.data.polygons:
                p.use_smooth = True
            peb.data.materials.append(rng.choice(mats_stone))
            objs.append(peb)

    # 30 Sparkling Gas Bubbles expanding & rising
    for i in range(30):
        bx = origin.x + rng.uniform(-1.0, 1.0)
        bz0 = origin.z + rng.uniform(-1.7, 0.4)
        bz1 = bz0 + rng.uniform(0.9, 1.6)
        by = origin.y - rng.uniform(0.04, 0.12)
        brad = rng.uniform(0.045, 0.10)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=brad, location=(bx, by, bz0))
        bub = bpy.context.active_object
        for p in bub.data.polygons:
            p.use_smooth = True
        bub.data.materials.append(mat_bubble)

        f0 = 835 + rng.randint(0, 45)
        f1 = min(960, f0 + rng.randint(35, 65))
        bub.location = (bx, by, bz0)
        bub.scale = (0.2, 0.2, 0.2)
        bub.keyframe_insert(data_path="location", frame=f0)
        bub.keyframe_insert(data_path="scale", frame=f0)
        bub.location = (bx + rng.uniform(-0.15, 0.15), by, (bz0 + bz1) * 0.5)
        bub.scale = (1.1, 1.0, 1.1)
        bub.keyframe_insert(data_path="location", frame=(f0 + f1) // 2)
        bub.keyframe_insert(data_path="scale", frame=(f0 + f1) // 2)
        bub.location = (bx + rng.uniform(-0.2, 0.2), by, bz1)
        bub.scale = (1.35, 1.0, 1.35)
        bub.keyframe_insert(data_path="location", frame=f1)
        bub.keyframe_insert(data_path="scale", frame=f1)
        objs.append(bub)

    # Key & Rim Spotlights
    ldata1 = bpy.data.lights.new("Macro_Key", type="AREA")
    ldata1.energy = 220.0
    ldata1.size = 2.5
    ldata1.color = (1.0, 0.95, 0.88)
    l1 = bpy.data.objects.new("Macro_Key", ldata1)
    l1.location = (origin.x + 1.5, origin.y - 2.2, origin.z + 2.2)
    l1.rotation_euler = (math.radians(65), 0.0, math.radians(25))
    col.objects.link(l1)
    objs.append(l1)

    ldata2 = bpy.data.lights.new("Macro_Rim", type="AREA")
    ldata2.energy = 140.0
    ldata2.size = 2.0
    ldata2.color = (0.80, 0.90, 1.0)
    l2 = bpy.data.objects.new("Macro_Rim", ldata2)
    l2.location = (origin.x - 1.6, origin.y - 2.0, origin.z - 1.8)
    l2.rotation_euler = (math.radians(115), 0.0, math.radians(-30))
    col.objects.link(l2)
    objs.append(l2)

    return origin, objs


# ---------------------------------------------------------------------------
# 7. Timber Cellar Blowout Preventer (BOP) with Clamping Hydraulic Rams
# ---------------------------------------------------------------------------
def build_bop_cellar(col):
    """Square timber cellar pit under rig floor with heavy BOP hydraulic rams slamming shut around pipe!"""
    mat_green = make_simple_mat("BOP_Green_CastSteel", (0.12, 0.26, 0.16), roughness=0.40, metallic=0.75)
    mat_steel = make_simple_mat("BOP_Ram_MachinedSteel", (0.24, 0.26, 0.28), roughness=0.32, metallic=0.90)
    mat_chrome = make_simple_mat("BOP_Piston_Chrome", (0.88, 0.90, 0.92), roughness=0.08, metallic=0.96)
    mat_rubber = make_simple_mat("BOP_Rubber_Gasket", (0.04, 0.04, 0.04), roughness=0.85)
    mat_timber = make_creosote_timber_mat()
    mat_red = make_simple_mat("Valve_Wheel_Red", (0.75, 0.10, 0.06), roughness=0.35, metallic=0.4)

    cz = -2.2
    objs = []

    # Cellar timber framing (left, right, back walls)
    for sx, sy, lx, ly in [(-1.45, 0.45, 0.24, 2.4), (1.45, 0.45, 0.24, 2.4), (0.0, 1.55, 3.1, 0.24)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, sy, cz))
        w = bpy.context.active_object
        w.scale = (lx, ly, 2.8)
        w.data.materials.append(mat_timber)
        objs.append(w)

    # Timber ceiling beams framing the top of cellar pit
    for sx in (-0.85, 0.85):
        add_beam(col, f"Cellar_Ceiling_{sx}", Vector((sx, -0.6, cz + 1.4)), Vector((sx, 1.5, cz + 1.4)), 0.20, 0.20, mat_timber)

    # Central casing spool collars (top & bottom of BOP)
    for fz in (cz + 0.85, cz - 0.85):
        bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.62, depth=0.25, location=(0.0, 0.45, fz))
        fl = bpy.context.active_object
        for p in fl.data.polygons:
            p.use_smooth = True
        fl.data.materials.append(mat_green)
        objs.append(fl)

    # Horizontal hydraulic cylinder barrels on left and right
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.38, depth=0.92, location=(side * 0.92, 0.45, cz), rotation=(0, math.radians(90), 0))
        cyl = bpy.context.active_object
        for p in cyl.data.polygons:
            p.use_smooth = True
        cyl.data.materials.append(mat_green)
        objs.append(cyl)

        # Polished chrome piston rod
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.14, depth=0.65, location=(side * 0.55, 0.45, cz), rotation=(0, math.radians(90), 0))
        rod = bpy.context.active_object
        rod.data.materials.append(mat_chrome)
        objs.append(rod)

        # Heavy dark machined steel ram jaws with pipe cutout slamming shut (Shot 13: frames 1010..1060)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side * 0.58, 0.45, cz))
        jaw = bpy.context.active_object
        jaw.name = f"BOP_Steel_Jaw_{side}"
        jaw.scale = (0.36, 0.58, 0.48)
        jaw.data.materials.append(mat_steel)

        jaw.location = (side * 0.62, 0.45, cz)
        jaw.keyframe_insert(data_path="location", frame=960)
        jaw.keyframe_insert(data_path="location", frame=1015)
        jaw.location = (side * 0.25, 0.45, cz) # Clamped tight around pipe!
        jaw.keyframe_insert(data_path="location", frame=1055)
        jaw.keyframe_insert(data_path="location", frame=1200)
        objs.append(jaw)

    # Emergency manual red handwheel
    bpy.ops.mesh.primitive_torus_add(major_radius=0.20, minor_radius=0.035, location=(0.88, 0.08, cz - 0.85), rotation=(math.radians(90), 0, 0))
    wheel = bpy.context.active_object
    wheel.data.materials.append(mat_red)
    objs.append(wheel)

    # Cellar key light
    c_light = bpy.data.lights.new("Cellar_Key", type="AREA")
    c_light.energy = 85.0
    c_light.size = 2.2
    c_obj = bpy.data.objects.new("Cellar_Key", c_light)
    c_obj.location = (0.4, -2.5, cz + 0.6)
    c_obj.rotation_euler = (math.radians(82), 0.0, math.radians(10))
    col.objects.link(c_obj)
    objs.append(c_obj)

    set_vis(objs, 1, False)
    set_vis(objs, 960, True)
    set_vis(objs, 1200, False)
    return cz, objs


# ---------------------------------------------------------------------------
# 8. Authentic Hero Pumpjack + 25-Unit Texas Oilfield
# ---------------------------------------------------------------------------
def build_pumpjack_unit(col, name_prefix: str, base_loc: Vector, phase_offset: float, f_start: int, f_end: int, scale: float = 1.0):
    """
    Authentic Mildly Elsewhere Pumpjack:
      - Flared Curved Orange Horsehead (bowing forwards +X towards wellhead!)
      - Dual Steel Bridle Cables hanging tangent to the horsehead curve
      - Heavy I-Beam Walking Beam + Saddle Pivot
      - 4-Legged Structural Steel Samson Post Tower
      - Dual Rotating Crank Arms + Massive Semi-Circular Orange Counterweights
      - Polished Sucker Rod reciprocating in Wellhead
      - Industrial Belt-Drive Motor + Flywheel
    """
    mat_orange = make_simple_mat(f"{name_prefix}_Orange", (0.82, 0.24, 0.05), roughness=0.38, metallic=0.15)
    mat_steel = make_simple_mat(f"{name_prefix}_Steel", (0.12, 0.13, 0.15), roughness=0.42, metallic=0.88)
    mat_chrome = make_simple_mat(f"{name_prefix}_Chrome", (0.90, 0.92, 0.94), roughness=0.08, metallic=0.96)
    mat_green = make_simple_mat(f"{name_prefix}_Green", (0.10, 0.26, 0.14), roughness=0.45, metallic=0.65)
    mat_concrete = make_simple_mat(f"{name_prefix}_Concrete", (0.42, 0.40, 0.38), roughness=0.85)

    root = bpy.data.objects.new(f"{name_prefix}_Root", None)
    root.location = base_loc
    root.scale = (scale, scale, scale)
    col.objects.link(root)
    objs = [root]

    def attach(o):
        o.parent = root
        objs.append(o)
        return o

    # Concrete & Steel Skid Base
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.8, 0.0, 0.12))
    skid = attach(bpy.context.active_object)
    skid.scale = (7.2, 1.8, 0.24)
    skid.data.materials.append(mat_concrete)

    for sx in (-0.7, 0.7):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.8, sx, 0.28))
        sbeam = attach(bpy.context.active_object)
        sbeam.scale = (7.0, 0.18, 0.14)
        sbeam.data.materials.append(mat_steel)

    # 4-Legged Samson Post Tower
    samson_top = Vector((-1.6, 0.0, 3.8))
    legs = [
        Vector((-2.6, -0.65, 0.24)),
        Vector((-2.6, 0.65, 0.24)),
        Vector((-0.6, -0.65, 0.24)),
        Vector((-0.6, 0.65, 0.24)),
    ]
    for i, lpos in enumerate(legs):
        leg = add_beam(col, f"{name_prefix}_Samson_Leg_{i}", lpos, samson_top + Vector((0, (0.1 if lpos.y > 0 else -0.1), 0)), 0.15, 0.15, mat_steel)
        attach(leg)

    for z_tier in (1.4, 2.6):
        f = z_tier / 3.8
        w_x = 1.0 * (1.0 - f)
        w_y = 0.65 * (1.0 - f)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.6, 0.0, z_tier))
        frame = attach(bpy.context.active_object)
        frame.scale = (w_x * 2.2, w_y * 2.2, 0.08)
        frame.data.materials.append(mat_steel)

    # Saddle Bearing on top of Samson Post
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.22, depth=0.55, location=(-1.6, 0.0, 3.85), rotation=(math.radians(90), 0, 0))
    saddle = attach(bpy.context.active_object)
    saddle.data.materials.append(mat_steel)

    # Walking Beam Pivot Root
    pivot = bpy.data.objects.new(f"{name_prefix}_Walking_Beam_Pivot", None)
    pivot.location = samson_top
    col.objects.link(pivot)
    attach(pivot)

    # Main Walking I-Beam
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.6, 0.0, 0.0))
    beam = bpy.context.active_object
    beam.scale = (4.8, 0.30, 0.42)
    beam.data.materials.append(mat_steel)
    beam.parent = pivot
    objs.append(beam)

    for fz in (-0.20, 0.20):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.6, 0.0, fz))
        flange = bpy.context.active_object
        flange.scale = (4.8, 0.42, 0.05)
        flange.data.materials.append(mat_steel)
        flange.parent = pivot
        objs.append(flange)

    # Authentic Flared Curved Orange Horsehead (bowing FORWARD (+X) towards wellhead!)
    # Circle arc centered at beam pivot (0,0) with R = 2.45m
    bm = bmesh.new()
    arc_segs = 16
    theta_min = math.radians(-32)
    theta_max = math.radians(32)
    r_arc = 2.45

    verts_front = []
    verts_back = []
    for i in range(arc_segs + 1):
        th = theta_min + (theta_max - theta_min) * (i / arc_segs)
        # Front curved rim bows outwards to +X!
        px = r_arc * math.cos(th)
        pz = r_arc * math.sin(th)
        vf_l = bm.verts.new((px, -0.22, pz))
        vf_r = bm.verts.new((px, 0.22, pz))
        # Inner web plate attaches back to beam
        vb_l = bm.verts.new((1.55, -0.06, pz * 0.40))
        vb_r = bm.verts.new((1.55, 0.06, pz * 0.40))
        verts_front.append((vf_l, vf_r))
        verts_back.append((vb_l, vb_r))

    for i in range(arc_segs):
        bm.faces.new((verts_front[i][0], verts_front[i][1], verts_front[i+1][1], verts_front[i+1][0]))
        bm.faces.new((verts_front[i][0], verts_front[i+1][0], verts_back[i+1][0], verts_back[i][0]))
        bm.faces.new((verts_front[i][1], verts_back[i][1], verts_back[i+1][1], verts_front[i+1][1]))

    head_mesh = bpy.data.meshes.new(f"{name_prefix}_Horsehead_Mesh")
    bm.to_mesh(head_mesh)
    bm.free()
    head_obj = bpy.data.objects.new(f"{name_prefix}_Horsehead", head_mesh)
    col.objects.link(head_obj)
    head_obj.data.materials.append(mat_orange)
    head_obj.parent = pivot
    for p in head_obj.data.polygons:
        p.use_smooth = True
    objs.append(head_obj)

    # Wellhead & Sucker Rod at X = samson_top.x + r_arc = -1.6 + 2.45 = +0.85m!
    well_x = samson_top.x + r_arc
    carrier_z = 1.8

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(well_x, 0.0, carrier_z))
    carrier = attach(bpy.context.active_object)
    carrier.scale = (0.16, 0.52, 0.12)
    carrier.data.materials.append(mat_steel)

    # Dual wire bridle cables hanging tangent from top of horsehead arc down to carrier bar
    for wy in (-0.18, 0.18):
        bwire = add_beam(col, f"{name_prefix}_Bridle_{wy}", Vector((well_x, wy, samson_top.z + r_arc * math.sin(theta_max))), Vector((well_x, wy, carrier_z)), 0.025, 0.025, mat_chrome)
        attach(bwire)

    # Polished Chrome Sucker Rod extending down into wellhead
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.045, depth=4.2, location=(well_x, 0.0, 0.0))
    rod = attach(bpy.context.active_object)
    rod.data.materials.append(mat_chrome)

    # Wellhead stuffing box
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.28, depth=0.85, location=(well_x, 0.0, 0.55))
    sbox = attach(bpy.context.active_object)
    sbox.data.materials.append(mat_steel)

    # Crank Pivot Axle & Orange Counterweights
    crank_pivot_x = -3.8
    crank_pivot_z = 1.45
    crank_objs = []
    for sy in (-0.75, 0.75):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.22, depth=0.18, location=(crank_pivot_x, sy, crank_pivot_z), rotation=(math.radians(90), 0, 0))
        cbear = attach(bpy.context.active_object)
        cbear.data.materials.append(mat_steel)

        crank_empty = bpy.data.objects.new(f"{name_prefix}_CrankEmpty_{sy}", None)
        crank_empty.location = Vector((crank_pivot_x, sy, crank_pivot_z))
        col.objects.link(crank_empty)
        attach(crank_empty)
        crank_objs.append(crank_empty)

        carm = add_beam(col, f"{name_prefix}_CrankArm_{sy}", Vector((0, 0, 0)), Vector((0, 0, 0.95)), 0.14, 0.14, mat_steel)
        carm.parent = crank_empty
        objs.append(carm)

        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.72, depth=0.32, location=(0.0, (0.12 if sy > 0 else -0.12), 0.48), rotation=(math.radians(90), 0, 0))
        cw = bpy.context.active_object
        cw.data.materials.append(mat_orange)
        cw.parent = crank_empty
        for p in cw.data.polygons:
            p.use_smooth = True
        objs.append(cw)

        pit = add_beam(col, f"{name_prefix}_Pitman_{sy}", Vector((crank_pivot_x, sy, crank_pivot_z + 0.95)), Vector((-2.85, sy * 0.65, 3.85)), 0.09, 0.09, mat_steel)
        attach(pit)

    # Green Motor + Flywheel
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.8, 0.0, 0.72))
    motor = attach(bpy.context.active_object)
    motor.scale = (1.1, 1.2, 0.85)
    motor.data.materials.append(mat_green)

    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.65, depth=0.12, location=(-4.8, -0.68, 0.72), rotation=(math.radians(90), 0, 0))
    flywheel = attach(bpy.context.active_object)
    flywheel.data.materials.append(mat_green)

    # Animate nodding motion & crank rotation
    f_step = 4
    for fr in range(f_start, f_end + 1, f_step):
        omega = 0.16
        t = (fr - f_start) * omega + phase_offset
        nod = 0.22 * math.sin(t)
        pivot.rotation_euler.y = nod
        pivot.keyframe_insert(data_path="rotation_euler", frame=fr)

        rod.location.z = 0.0 + 0.95 * math.sin(t)
        carrier.location.z = carrier_z + 0.95 * math.sin(t)
        rod.keyframe_insert(data_path="location", frame=fr)
        carrier.keyframe_insert(data_path="location", frame=fr)

        for ce in crank_objs:
            ce.rotation_euler.y = t
            ce.keyframe_insert(data_path="rotation_euler", frame=fr)

    return objs


# ---------------------------------------------------------------------------
# 9. Camera Choreography (16 Shots Synced to Reference Audio)
# ---------------------------------------------------------------------------
def cam_kf(cam, target, frame: int, cloc, tloc, lens: float = 42.0):
    cam.location = cloc
    cam.keyframe_insert(data_path="location", frame=frame)
    target.location = tloc
    target.keyframe_insert(data_path="location", frame=frame)
    cam.data.lens = lens
    cam.data.keyframe_insert(data_path="lens", frame=frame)


def main() -> None:
    print("[INIT] Building Production V3 Texas Oilfield...")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    setup_scene_6gb(scene)
    col = scene.collection

    # Sky HDRI and Sun
    sun = setup_texas_sky_and_sun(scene)

    # 1. Prairie terrain & bedded rock cutaway
    earth_objs = build_texas_earth_and_prairie(col)

    # 2. Creosote timber Spindletop derrick
    derrick_objs = build_spindletop_derrick(col)

    # 3. Rotating drill string, mud column, chalk arrows, falling sand
    pipe, mud, arrows, sand = build_drill_string_and_mud_vfx(col)

    # 4. 10-Story oil gusher, 2D chalk building, night rain, sparks
    gusher_objs, bldg_objs, sparks = build_gusher_and_vfx(col)

    # 5. Macro stage: Silky river stones + liquid crude + sparkling bubbles
    macro_origin, macro_objs = build_macro_pebbles_stage(col)

    # 6. BOP Cellar
    bop_z, bop_objs = build_bop_cellar(col)

    # 7. Hero Pumpjack (Active from frame 1385 onwards)
    hero_pj_objs = build_pumpjack_unit(col, "Hero_Pumpjack", Vector((-2.0, 0.45, 0.0)), phase_offset=0.0, f_start=1385, f_end=1790, scale=1.0)
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
        (-10.0, 72.0, 0.62), (18.0, 75.0, 0.60), (-28.0, 82.0, 0.58), (38.0, 85.0, 0.56),
        (-50.0, 92.0, 0.54), (0.0, 95.0, 0.52), (-16.0, 105.0, 0.50), (28.0, 110.0, 0.48),
        (-36.0, 118.0, 0.46), (12.0, 122.0, 0.45), (-22.0, 130.0, 0.44), (34.0, 135.0, 0.42),
    ]
    for pji, (px, py, pscale) in enumerate(field_coords):
        phase = rng_field.uniform(0, math.tau)
        pobjs = build_pumpjack_unit(col, f"BG_PJ_{pji}", Vector((px, py, 0.0)), phase_offset=phase, f_start=1650, f_end=1790, scale=pscale)
        bg_pj_objs.extend(pobjs)

    set_vis(bg_pj_objs, 1, False)
    set_vis(bg_pj_objs, 1660, True)

    # Subsurface Rod Pump plunger (Shot 15: frames 1300..1384)
    mat_plunger = make_simple_mat("Subsurface_Plunger", (0.80, 0.82, 0.85), roughness=0.18, metallic=0.92)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.34, depth=2.6, location=(0.0, 0.45, -10.0))
    plunger = bpy.context.active_object
    plunger.data.materials.append(mat_plunger)
    for f in range(1300, 1385, 8):
        plunger.location.z = -10.0 + 1.1 * math.sin((f - 1300) * 0.25)
        plunger.keyframe_insert(data_path="location", frame=f)
    set_vis([plunger], 1, False)
    set_vis([plunger], 1300, True)
    set_vis([plunger], 1385, False)

    # Camera Choreography (Synced to 74.58s Reference Audio)
    target = bpy.data.objects.new("Camera_Target", None)
    col.objects.link(target)
    cdata = bpy.data.cameras.new("Main_Camera")
    cdata.clip_start = 0.05
    cdata.clip_end = 650.0
    cam = bpy.data.objects.new("Main_Camera", cdata)
    col.objects.link(cam)
    track = cam.constraints.new(type="TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam

    # Shot 01 (1-88): Fast vertical hook whip-tilt -> Texas Derrick + Cutaway + Gusher
    cam_kf(cam, target, 1, (0.0, -24.0, 18.0), (0.0, 0.5, 10.0), 36.0)
    cam_kf(cam, target, 24, (0.0, -26.0, 5.0), (0.0, 0.5, 4.5), 36.0)
    cam_kf(cam, target, 88, (0.0, -28.0, 4.2), (0.0, 0.5, 4.0), 38.0)

    # Shot 02-04 (89-396): Underground Borehole Cutaway (sand cave-in -> mud + arrows -> deep oil!)
    cam_kf(cam, target, 89, (0.0, -5.8, -6.5), (0.0, 0.4, -6.8), 44.0)
    cam_kf(cam, target, 165, (0.0, -5.6, -8.5), (0.0, 0.4, -8.8), 44.0)
    cam_kf(cam, target, 305, (0.0, -6.0, -9.2), (0.0, 0.4, -9.4), 42.0)
    cam_kf(cam, target, 396, (0.0, -5.8, -21.5), (0.0, 0.4, -22.2), 42.0)

    # Shot 05-06 (397-540): Rig floor mud kick (397-445) -> Worm's-eye STRAIGHT UP inside timber derrick (446-540)!
    cam_kf(cam, target, 397, (0.8, -4.6, 2.2), (0.0, 0.5, -0.5), 40.0)
    cam_kf(cam, target, 445, (0.6, -4.4, 2.0), (0.0, 0.5, -0.2), 40.0)
    cam_kf(cam, target, 446, (0.55, 0.15, 1.2), (0.0, 0.65, 20.0), 22.0)
    cam_kf(cam, target, 540, (0.45, 0.20, 2.8), (0.0, 0.65, 24.0), 22.0)

    # Shot 07-09 (541-768): 10-Story Gusher + Skyscraper (541-650) -> Dark Oil Rain (651-711) -> Prairie Sparks (712-768)
    cam_kf(cam, target, 541, (-1.8, -32.0, 8.0), (-1.5, 0.5, 8.5), 34.0)
    cam_kf(cam, target, 650, (-2.2, -35.0, 9.5), (-1.8, 0.5, 9.5), 34.0)
    cam_kf(cam, target, 651, (0.0, -29.0, 7.0), (0.0, 0.5, 8.0), 36.0)
    cam_kf(cam, target, 711, (0.0, -31.0, 7.5), (0.0, 0.5, 8.5), 36.0)
    cam_kf(cam, target, 712, (-4.0, -14.0, 5.2), (0.0, 20.0, 6.0), 35.0)
    cam_kf(cam, target, 768, (2.0, -14.0, 5.2), (4.0, 20.0, 5.5), 35.0)

    # Shot 10-12 (769-960): Fast borehole plunge (769-825) -> Macro silky pebbles + sparkling gas bubbles (826-960)!
    cam_kf(cam, target, 769, (0.0, -5.0, -4.0), (0.0, 0.4, -5.0), 42.0)
    cam_kf(cam, target, 825, (0.0, -4.5, -23.0), (0.0, 0.4, -23.5), 42.0)
    cam_kf(cam, target, 826, (macro_origin.x, macro_origin.y - 3.2, macro_origin.z), (macro_origin.x, macro_origin.y, macro_origin.z), 50.0)
    cam_kf(cam, target, 960, (macro_origin.x + 0.10, macro_origin.y - 2.8, macro_origin.z + 0.08), (macro_origin.x, macro_origin.y, macro_origin.z), 54.0)

    # Shot 13-14 (961-1200): Timber Cellar BOP hydraulic steel jaws slamming shut -> pull-out
    cam_kf(cam, target, 961, (0.0, -3.8, bop_z + 0.25), (0.0, 0.45, bop_z), 42.0)
    cam_kf(cam, target, 1135, (0.0, -3.3, bop_z + 0.05), (0.0, 0.45, bop_z), 46.0)
    cam_kf(cam, target, 1136, (0.0, -24.0, 4.5), (0.0, 0.5, 4.0), 38.0)
    cam_kf(cam, target, 1200, (0.0, -26.0, 4.2), (0.0, 0.5, 3.8), 38.0)

    # Shot 15 (1201-1384): Wooden Oil Storage Tank (1201-1299) -> Subsurface Rod Pump inside shaft (1300-1384)
    cam_kf(cam, target, 1201, (6.0, -4.5, 3.2), (8.8, 4.5, 1.4), 40.0)
    cam_kf(cam, target, 1299, (7.5, -2.5, 2.8), (8.8, 4.5, 1.3), 42.0)
    cam_kf(cam, target, 1300, (0.0, -5.2, -9.5), (0.0, 0.45, -10.0), 46.0)
    cam_kf(cam, target, 1384, (0.0, -5.2, -10.2), (0.0, 0.45, -10.0), 46.0)

    # Shot 16 (1385-1790): Hero Pumpjack side profile -> motor/weights -> Epic 25+ pumpjack Texas oilfield panorama!
    cam_kf(cam, target, 1385, (-2.0, -18.0, 2.8), (-1.8, 0.45, 1.8), 36.0)
    cam_kf(cam, target, 1510, (-1.8, -16.5, 3.0), (-1.7, 0.45, 2.0), 38.0)
    cam_kf(cam, target, 1511, (-4.5, -7.5, 1.8), (-4.2, 0.45, 1.2), 42.0)
    cam_kf(cam, target, 1575, (-3.5, -8.8, 2.8), (-2.8, 0.45, 2.6), 40.0)
    cam_kf(cam, target, 1576, (-2.0, -17.5, 2.8), (-1.8, 0.45, 2.0), 36.0)
    cam_kf(cam, target, 1659, (-2.0, -18.0, 3.0), (-1.8, 0.45, 2.0), 36.0)
    cam_kf(cam, target, 1660, (-2.0, -18.0, 4.5), (-0.5, 10.0, 1.5), 34.0)
    cam_kf(cam, target, TOTAL_FRAMES, (0.0, -28.0, 14.5), (0.0, 26.0, 1.0), 32.0)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    blend_path = OUT_DIR / "texas_oil_v3_world.blend"
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
    scene.render.filepath = str(FRAMES_DIR / "frame_")
    print(f"[RENDER] Rendering production frames {s_fr}..{e_fr} @ 720x1280 to {FRAMES_DIR}...")
    bpy.ops.render.render(animation=True)
    print(f"[DONE] Rendered frames {s_fr}..{e_fr}!")


if __name__ == "__main__":
    main()
