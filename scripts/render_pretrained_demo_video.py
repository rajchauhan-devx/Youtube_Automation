"""
Zack D. Films-Style 9:16 Vertical Explainer Demo built 100% from Downloaded
Pretrained Blender Assets (RTX 3050 6GB Optimized, Blender 5.3 EEVEE Next):

  - Master Studio: assets/blender_pretrained/templates/zack_d_studio.blend + Poly Haven HDRI
  - Shot 1: MPFB2 Human (MakeHuman skin + eyes + hair + outfit) -> smooth X-ray reveal of Z-Anatomy organs
  - Shot 2: Z-Anatomy Heart (beating), Lungs (breathing), Trachea, Oesophagus + descending glowing pill
  - Shot 3: Z-Anatomy Stomach + Mucosa with Animated Boolean Cutaway + rich emerald acid & fizz bubbles
  - Shot 4: Z-Anatomy Beating Heart & Aorta finale with glowing nutrient particles entering the bloodstream

Usage:
  blender -b assets/blender_pretrained/templates/zack_d_studio.blend -P scripts/render_pretrained_demo_video.py -- --preview
  blender -b assets/blender_pretrained/templates/zack_d_studio.blend -P scripts/render_pretrained_demo_video.py
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "server" / "scripts" / "blender"))

from lib.asset_loader import (
    apply_polyhaven_hdri,
    find_z_anatomy_blend,
)

DEMO_DIR = REPO_ROOT / "production_workspace" / "pretrained_demo"
TIMINGS_PATH = DEMO_DIR / "timings.json"
FRAMES_DIR = DEMO_DIR / "frames"
MPFB_DATA = Path(r"C:\Users\zrajc\AppData\Roaming\Blender Foundation\Blender\5.3\extensions\.user\user_default\mpfb\data")
FPS = 24


def load_timings() -> list[dict]:
    if TIMINGS_PATH.exists():
        data = json.loads(TIMINGS_PATH.read_text(encoding="utf-8"))
        return data["shots"]
    return [
        {"shot": "shot1", "start": 0.0, "end": 4.0, "duration": 4.0},
        {"shot": "shot2", "start": 4.0, "end": 8.0, "duration": 4.0},
        {"shot": "shot3", "start": 8.0, "end": 12.0, "duration": 4.0},
        {"shot": "shot4", "start": 12.0, "end": 16.0, "duration": 4.0},
    ]


def configure_render_6gb(scene, total_frames: int) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = total_frames
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
    scene.view_settings.exposure = -0.42
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"


def make_emissive_mat(name: str, color, emission_strength: float = 1.6, roughness: float = 0.18, alpha: float = 1.0):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
    return mat


def make_organ_mat(name: str, color, roughness: float = 0.28, coat: float = 0.75, sss: float = 0.25):
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.12
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = sss
    return mat


def set_vis(objs, frame: int, visible: bool) -> None:
    for o in objs:
        if o is None:
            continue
        o.hide_render = not visible
        o.hide_viewport = not visible
        o.keyframe_insert(data_path="hide_render", frame=frame)
        o.keyframe_insert(data_path="hide_viewport", frame=frame)


def build_mpfb2_human():
    """Create a realistic textured MPFB2 human using unpacked MakeHuman CC0 packs."""
    from bl_ext.user_default.mpfb.services.humanservice import HumanService

    bpy.ops.mpfb.create_human()
    human = bpy.context.active_object
    human.name = "MPFB2_Human"
    human_parts = [human]

    skin_path = MPFB_DATA / "skins" / "blindsaypatten_uniform_skin_texture" / "blindsaypatten_uniform_skin_texture.mhmat"
    if skin_path.exists():
        HumanService.set_character_skin(str(skin_path), human, skin_type="ENHANCED_SSS")
        print(f"[OK] Applied MPFB2 skin: {skin_path.name}")

    extras = [
        ("Eyes", MPFB_DATA / "eyes" / "high-poly" / "high-poly.mhclo"),
        ("Hair", MPFB_DATA / "hair" / "bob02" / "bob02.mhclo"),
        ("Clothes", MPFB_DATA / "clothes" / "female_casualsuit01" / "female_casualsuit01.mhclo"),
    ]
    for asset_type, mhclo in extras:
        if mhclo.exists():
            obj = HumanService.add_mhclo_asset(
                str(mhclo),
                human,
                asset_type=asset_type,
                subdiv_levels=1,
                set_up_rigging=False,
                import_subrig=False,
                import_weights=False,
            )
            if obj:
                human_parts.append(obj)
                print(f"[OK] Equipped MPFB2 {asset_type}: {mhclo.name}")

    for obj in human_parts:
        if obj.type == "MESH":
            for p in obj.data.polygons:
                p.use_smooth = True
    return human_parts


def animate_human_xray(human_parts, f_opaque: int, f_xray: int, xray_mix: float = 0.86) -> None:
    """
    Wrap EVERY MPFB2 material's Material Output with MixShader(Original, Transparent)
    so even complex MakeHuman node groups fade smoothly into crisp Zack D. X-ray glass!
    """
    seen_mats = set()
    for obj in human_parts:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or mat.name in seen_mats or not mat.node_tree:
                continue
            seen_mats.add(mat.name)
            if hasattr(mat, "surface_render_method"):
                mat.surface_render_method = "DITHERED"
            nt = mat.node_tree
            out_node = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
            if not out_node or not out_node.inputs["Surface"].links:
                continue
            orig_socket = out_node.inputs["Surface"].links[0].from_socket
            nt.links.remove(out_node.inputs["Surface"].links[0])

            transp = nt.nodes.new("ShaderNodeBsdfTransparent")
            mix = nt.nodes.new("ShaderNodeMixShader")
            nt.links.new(orig_socket, mix.inputs[1])
            nt.links.new(transp.outputs["BSDF"], mix.inputs[2])
            nt.links.new(mix.outputs["Shader"], out_node.inputs["Surface"])

            fac = mix.inputs[0]
            fac.default_value = 0.0
            fac.keyframe_insert(data_path="default_value", frame=1)
            fac.keyframe_insert(data_path="default_value", frame=f_opaque)
            fac.default_value = xray_mix
            fac.keyframe_insert(data_path="default_value", frame=f_xray)


def load_z_anatomy_organs():
    """Append real Z-Anatomy chest & digestive organs directly from Startup.blend."""
    bp = find_z_anatomy_blend()
    if not bp:
        raise FileNotFoundError("Z-Anatomy Startup.blend not found!")

    heart_names = [
        "Left ventricle", "Right ventricle", "Right atrium", "Left atrium",
        "Ascending aorta", "Thoracic aorta", "Pulmonary trunk", "Superior vena cava",
    ]
    lung_names = [
        "Superior lobe of right lung", "Middle lobe of right lung", "Inferior lobe of right lung",
        "Superior lobe of left lung", "Inferior lobe of left lung",
    ]
    digestive_names = ["Trachea", "Oesophagus", "Stomach", "Mucosa of stomach"]

    all_wanted = heart_names + lung_names + digestive_names
    with bpy.data.libraries.load(str(bp), link=False) as (df, dt):
        dt.objects = [n for n in all_wanted if n in df.objects]

    col = bpy.data.collections.new("Z_Anatomy_Organs")
    bpy.context.scene.collection.children.link(col)

    groups = {"heart": [], "lungs": [], "trachea": [], "oesophagus": [], "stomach": [], "mucosa": []}
    for obj in dt.objects:
        if obj is None or obj.type != "MESH":
            continue
        col.objects.link(obj)
        obj.hide_render = False
        obj.hide_viewport = False
        obj.hide_set(False)
        for poly in obj.data.polygons:
            poly.use_smooth = True
        lname = obj.name.lower()
        if obj.name in heart_names:
            groups["heart"].append(obj)
        elif obj.name in lung_names:
            groups["lungs"].append(obj)
        elif "trachea" in lname:
            groups["trachea"].append(obj)
        elif "oesophagus" in lname:
            groups["oesophagus"].append(obj)
        elif "mucosa" in lname:
            groups["mucosa"].append(obj)
        elif "stomach" in lname:
            groups["stomach"].append(obj)

    # Rich, glossy anatomical shaders so organs pop with cinematic 3D depth (keep Z-Anatomy's awesome Mucosa texture!)
    mat_heart = make_organ_mat("Organ_Heart_Deep", (0.58, 0.04, 0.05), roughness=0.22, coat=0.9, sss=0.2)
    mat_vessel = make_organ_mat("Organ_Aorta_Red", (0.72, 0.06, 0.07), roughness=0.24, coat=0.85, sss=0.2)
    mat_vein = make_organ_mat("Organ_VenaCava_Blue", (0.10, 0.26, 0.62), roughness=0.26, coat=0.8, sss=0.15)
    mat_lung = make_organ_mat("Organ_Lung_Coral", (0.78, 0.34, 0.38), roughness=0.38, coat=0.4, sss=0.3)
    mat_stomach = make_organ_mat("Organ_Stomach_Wall", (0.68, 0.17, 0.17), roughness=0.26, coat=0.85, sss=0.25)
    mat_tube = make_organ_mat("Organ_Esophagus", (0.80, 0.38, 0.36), roughness=0.34, coat=0.5, sss=0.25)

    for o in groups["heart"]:
        o.data.materials.clear()
        ln = o.name.lower()
        if "vena cava" in ln or "pulmonary" in ln:
            o.data.materials.append(mat_vein)
        elif "aorta" in ln:
            o.data.materials.append(mat_vessel)
        else:
            o.data.materials.append(mat_heart)
    for o in groups["lungs"]:
        o.data.materials.clear()
        o.data.materials.append(mat_lung)
    for o in groups["stomach"]:
        o.data.materials.clear()
        o.data.materials.append(mat_stomach)
    for o in groups["oesophagus"] + groups["trachea"]:
        o.data.materials.clear()
        o.data.materials.append(mat_tube)

    # IMPORTANT: update view_layer BEFORE computing matrix_parent_inverse so pivots don't offset organs!
    heart_pivot = bpy.data.objects.new("Heart_Pivot", None)
    heart_pivot.location = (0.02, -0.03, 1.29)
    col.objects.link(heart_pivot)

    lungs_pivot = bpy.data.objects.new("Lungs_Pivot", None)
    lungs_pivot.location = (0.0, -0.01, 1.31)
    col.objects.link(lungs_pivot)

    organ_root = bpy.data.objects.new("Organs_Root", None)
    organ_root.location = (0.0, 0.0, 0.0)
    col.objects.link(organ_root)

    bpy.context.view_layer.update()

    for o in groups["heart"]:
        o.parent = heart_pivot
        o.matrix_parent_inverse = heart_pivot.matrix_world.inverted()
    for o in groups["lungs"]:
        o.parent = lungs_pivot
        o.matrix_parent_inverse = lungs_pivot.matrix_world.inverted()

    for top in [heart_pivot, lungs_pivot] + groups["trachea"] + groups["oesophagus"] + groups["stomach"] + groups["mucosa"]:
        top.parent = organ_root
        top.matrix_parent_inverse = organ_root.matrix_world.inverted()

    # Now nudge entire organ assembly cleanly inside MPFB2 human torso
    organ_root.location = (0.0, -0.04, -0.02)
    bpy.context.view_layer.update()

    print(f"[OK] Loaded Z-Anatomy organs: heart={len(groups['heart'])}, lungs={len(groups['lungs'])}, esophagus={len(groups['oesophagus'])}, trachea={len(groups['trachea'])}, stomach={len(groups['stomach'])}, mucosa={len(groups['mucosa'])}")
    return organ_root, heart_pivot, lungs_pivot, groups


def animate_heartbeat_and_breath(heart_pivot, lungs_pivot, f_start: int, f_end: int) -> None:
    """Realistic 75 BPM lub-dub heartbeat + calm lung breathing."""
    period = 19
    for f in range(f_start, f_end + 1, 2):
        phase = (f - f_start) % period
        if phase in (0, 1):
            s = 1.075
        elif phase in (4, 5):
            s = 1.045
        else:
            s = 1.0
        heart_pivot.scale = (s, s, s)
        heart_pivot.keyframe_insert(data_path="scale", frame=f)

        b = 1.0 + 0.035 * math.sin(2 * math.pi * (f - f_start) / 60.0)
        lungs_pivot.scale = (b, b, 1.0 + (b - 1.0) * 0.4)
        lungs_pivot.keyframe_insert(data_path="scale", frame=f)


def build_glowing_pill(col):
    """Glossy two-tone crimson & gold medicine capsule."""
    pill_root = bpy.data.objects.new("Swallowed_Pill", None)
    col.objects.link(pill_root)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=0.011, location=(0, 0, 0.008))
    top_cap = bpy.context.active_object
    top_cap.scale = (1.0, 1.0, 1.45)
    for p in top_cap.data.polygons:
        p.use_smooth = True
    top_cap.data.materials.append(make_emissive_mat("Pill_Crimson", (0.92, 0.06, 0.06), emission_strength=0.9, roughness=0.08))
    top_cap.parent = pill_root

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=0.0108, location=(0, 0, -0.008))
    bot_cap = bpy.context.active_object
    bot_cap.scale = (1.0, 1.0, 1.45)
    for p in bot_cap.data.polygons:
        p.use_smooth = True
    bot_cap.data.materials.append(make_emissive_mat("Pill_Gold", (1.0, 0.72, 0.06), emission_strength=1.4, roughness=0.08))
    bot_cap.parent = pill_root

    ldata = bpy.data.lights.new("Pill_Glow", type="POINT")
    ldata.energy = 1.2
    ldata.color = (1.0, 0.78, 0.30)
    ldata.shadow_soft_size = 0.04
    lobj = bpy.data.objects.new("Pill_Glow", ldata)
    col.objects.link(lobj)
    lobj.parent = pill_root

    return pill_root, [pill_root, top_cap, bot_cap, lobj]


def build_stomach_cutaway_and_acid(stomach_objs, mucosa_objs, f_cut_start: int, f_cut_end: int, f_shot3_end: int):
    """
    Zack D. X-Ray Glass Cutaway on the real Z-Anatomy Stomach:
    Outer Stomach wall smoothly fades translucent revealing the detailed wavy Z-Anatomy
    Mucosa of stomach + vivid bubbling emerald stomach acid nestled inside!
    """
    bpy.context.view_layer.update()
    stomach = stomach_objs[0]
    sb = [stomach.matrix_world @ Vector(c) for c in stomach.bound_box]
    center = sum(sb, Vector((0, 0, 0))) / 8.0
    print(f"[INFO] Stomach world center: {center}")

    # Keep outer Stomach rich solid anatomical red so Z-Anatomy's built-in circular cutaway window pops!
    col = bpy.data.collections.get("Z_Anatomy_Organs") or bpy.context.scene.collection

    # Rich translucent emerald stomach acid nestled neatly in the lower cutaway window
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=0.032, location=(center.x + 0.012, center.y - 0.022, center.z - 0.022))
    acid = bpy.context.active_object
    acid.name = "Stomach_Acid_Pool"
    acid.scale = (1.18, 0.62, 0.52)
    for p in acid.data.polygons:
        p.use_smooth = True
    acid.data.materials.append(make_emissive_mat("Acid_Emerald", (0.04, 0.72, 0.14), emission_strength=0.45, roughness=0.06, alpha=0.82))

    # Dedicated green interior glow light
    ldata = bpy.data.lights.new("Stomach_Acid_Light", type="POINT")
    ldata.energy = 1.2
    ldata.color = (0.20, 0.95, 0.28)
    ldata.shadow_soft_size = 0.04
    acid_light = bpy.data.objects.new("Stomach_Acid_Light", ldata)
    acid_light.location = (center.x + 0.01, center.y - 0.065, center.z - 0.01)
    col.objects.link(acid_light)

    # 24 glowing effervescent bubbles rising cleanly inside the stomach cutaway window
    rng = random.Random(42)
    bubbles = []
    bubble_mat = make_emissive_mat("Fizz_Bubble", (0.45, 1.0, 0.25), emission_strength=2.4, roughness=0.05)
    for i in range(24):
        r = rng.uniform(0.0020, 0.0046)
        bx = center.x + rng.uniform(-0.012, 0.038)
        by = center.y - rng.uniform(0.025, 0.040)
        bz0 = center.z - rng.uniform(0.028, 0.012)
        bz1 = center.z + rng.uniform(0.010, 0.032)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=r, location=(bx, by, bz0))
        b = bpy.context.active_object
        b.name = f"Acid_Bubble_{i:02d}"
        for p in b.data.polygons:
            p.use_smooth = True
        b.data.materials.append(bubble_mat)
        f0 = f_cut_start + rng.randint(0, 35)
        f1 = min(f_shot3_end, f0 + rng.randint(24, 48))
        b.location = (bx, by, bz0)
        b.scale = (0.08, 0.08, 0.08)
        b.keyframe_insert(data_path="location", frame=f0)
        b.keyframe_insert(data_path="scale", frame=f0)
        b.location = (bx + rng.uniform(-0.008, 0.008), by, (bz0 + bz1) * 0.5)
        b.scale = (1.15, 1.15, 1.15)
        b.keyframe_insert(data_path="location", frame=(f0 + f1) // 2)
        b.keyframe_insert(data_path="scale", frame=(f0 + f1) // 2)
        b.location = (bx + rng.uniform(-0.01, 0.01), by, bz1)
        b.scale = (0.05, 0.05, 0.05)
        b.keyframe_insert(data_path="location", frame=f1)
        b.keyframe_insert(data_path="scale", frame=f1)
        bubbles.append(b)

    return center, [acid, acid_light] + bubbles


def build_bloodstream_particles(col, stomach_center: Vector, heart_center: Vector, f_start: int, f_end: int):
    """36 glowing golden/cyan medicine molecules surging from the stomach into the beating Heart & Aorta!"""
    rng = random.Random(77)
    gold_mat = make_emissive_mat("Nutrient_Gold", (1.0, 0.72, 0.08), emission_strength=3.5, roughness=0.08)
    cyan_mat = make_emissive_mat("Enzyme_Cyan", (0.12, 0.88, 1.0), emission_strength=3.5, roughness=0.08)
    objs = []
    for i in range(36):
        rad = rng.uniform(0.003, 0.0065)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=rad, location=stomach_center)
        p = bpy.context.active_object
        p.name = f"Bloodstream_Molecule_{i:02d}"
        p.data.materials.append(gold_mat if i % 2 == 0 else cyan_mat)

        # Staggered flow: stomach -> heart -> surging up ascending aorta & spreading outward
        f0 = f_start + rng.randint(0, 32)
        f_mid = min(f_end - 18, f0 + rng.randint(25, 45))
        f1 = min(f_end, f_mid + rng.randint(25, 50))

        p0 = Vector((stomach_center.x + rng.uniform(-0.03, 0.03), stomach_center.y + rng.uniform(-0.03, 0.02), stomach_center.z + rng.uniform(-0.02, 0.02)))
        pm = Vector((heart_center.x + rng.uniform(-0.05, 0.05), heart_center.y + rng.uniform(-0.04, 0.03), heart_center.z + rng.uniform(-0.03, 0.03)))
        ang = rng.uniform(0, math.tau)
        p1 = Vector((heart_center.x + math.cos(ang) * rng.uniform(0.05, 0.14), heart_center.y + rng.uniform(-0.06, 0.04), heart_center.z + rng.uniform(0.04, 0.18)))

        for fr, loc, sc in [(f0, p0, 0.1), ((f0 + f_mid) // 2, (p0 + pm) * 0.5, 1.0), (f_mid, pm, 1.2), (f1, p1, 0.7)]:
            p.location = loc
            p.scale = (sc, sc, sc)
            p.keyframe_insert(data_path="location", frame=fr)
            p.keyframe_insert(data_path="scale", frame=fr)
        objs.append(p)
    return objs


def set_cam_keyframe(cam, target, frame: int, cam_loc, target_loc, lens: float = 50.0):
    cam.location = cam_loc
    target.location = target_loc
    cam.data.lens = lens
    cam.keyframe_insert(data_path="location", frame=frame)
    target.keyframe_insert(data_path="location", frame=frame)
    cam.data.keyframe_insert(data_path="lens", frame=frame)


def main() -> None:
    shots = load_timings()
    ranges = []
    f_cur = 1
    for s in shots:
        n_frames = max(24, int(round(s["duration"] * FPS)))
        ranges.append((f_cur, f_cur + n_frames - 1))
        f_cur += n_frames
    total_frames = ranges[-1][1]
    (s1_a, s1_b), (s2_a, s2_b), (s3_a, s3_b), (s4_a, s4_b) = ranges
    print(f"[INFO] Frame ranges @ {FPS}fps: Shot1={s1_a}-{s1_b}, Shot2={s2_a}-{s2_b}, Shot3={s3_a}-{s3_b}, Shot4={s4_a}-{s4_b} (total={total_frames})")

    scene = bpy.context.scene
    configure_render_6gb(scene, total_frames)
    apply_polyhaven_hdri("studio_small_08", strength=0.6)

    # Sleek modern Zack D. cool-blue studio backdrop (great contrast behind both human & red organs!)
    cyc = bpy.data.objects.get("Studio_Cyclorama")
    if cyc and cyc.data.materials:
        bsdf = cyc.data.materials[0].node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.14, 0.19, 0.28, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.78

    # 1. Build MPFB2 Realistic Human (Shot 1 opaque -> X-ray dissolve; hidden in Shots 2-3; subtle X-ray shell in Shot 4)
    human_parts = build_mpfb2_human()
    animate_human_xray(human_parts, f_opaque=s1_a + 18, f_xray=s1_b - 6, xray_mix=0.84)
    set_vis(human_parts, 1, True)
    set_vis(human_parts, s1_b, True)
    set_vis(human_parts, s2_a, False)
    set_vis(human_parts, s3_b, False)
    set_vis(human_parts, s4_a, True)

    # 2. Load Real Z-Anatomy Organs (aligned inside MPFB2 torso!)
    organ_root, heart_pivot, lungs_pivot, organ_groups = load_z_anatomy_organs()
    animate_heartbeat_and_breath(heart_pivot, lungs_pivot, 1, total_frames)

    # Dedicated close-up organ accent key light so Heart, Lungs, and Stomach gleam cleanly
    col_organs = bpy.data.collections.get("Z_Anatomy_Organs")
    org_light_data = bpy.data.lights.new("Organ_Accent_Key", type="AREA")
    org_light_data.energy = 18.0
    org_light_data.size = 0.5
    org_light_data.color = (1.0, 0.96, 0.92)
    org_light = bpy.data.objects.new("Organ_Accent_Key", org_light_data)
    org_light.location = (0.35, -0.65, 1.48)
    org_light.rotation_euler = (math.radians(65), 0.0, math.radians(28))
    col_organs.objects.link(org_light)

    # 3. Glowing Swallowed Pill racing down Oesophagus -> Stomach
    pill_root, pill_objs = build_glowing_pill(col_organs)
    set_vis(pill_objs, 1, False)
    set_vis(pill_objs, s2_a, True)
    set_vis(pill_objs, s4_a, False)

    # 4. Stomach Boolean Cutaway + Rich Emerald Acid + Fizz Bubbles (Shot 3)
    stomach_center, acid_objs = build_stomach_cutaway_and_acid(
        organ_groups["stomach"],
        organ_groups["mucosa"],
        f_cut_start=s3_a + 4,
        f_cut_end=s3_a + 36,
        f_shot3_end=s3_b,
    )
    set_vis(acid_objs, 1, False)
    set_vis(acid_objs, s3_a, True)
    set_vis(acid_objs, s4_a, False)

    # Pill path: throat -> past beating heart -> stomach cutaway window -> dissolving in emerald acid
    pill_waypoints = [
        (s2_a, (0.004, -0.055, 1.44), (0.2, 0.1, 0.0)),
        ((s2_a + s2_b) // 2, (0.015, -0.068, 1.31), (1.3, 0.4, 0.6)),
        (s2_b, (stomach_center.x + 0.010, stomach_center.y - 0.035, stomach_center.z + 0.045), (2.4, 0.9, 1.2)),
        (s3_a + 28, (stomach_center.x + 0.012, stomach_center.y - 0.036, stomach_center.z - 0.008), (3.6, 1.4, 2.0)),
        (s3_b, (stomach_center.x + 0.012, stomach_center.y - 0.036, stomach_center.z - 0.018), (5.0, 2.2, 3.1)),
    ]
    for fr, loc, rot in pill_waypoints:
        pill_root.location = loc
        pill_root.rotation_euler = rot
        pill_root.keyframe_insert(data_path="location", frame=fr)
        pill_root.keyframe_insert(data_path="rotation_euler", frame=fr)
    pill_root.scale = (1.0, 1.0, 1.0)
    pill_root.keyframe_insert(data_path="scale", frame=s3_a + 28)
    pill_root.scale = (0.28, 0.28, 0.28)
    pill_root.keyframe_insert(data_path="scale", frame=s3_b)

    # 5. Shot 4: Glowing Medicine Molecules surging from Stomach into Beating Heart & Aorta!
    heart_world = Vector((0.02, -0.07, 1.27))
    blood_objs = build_bloodstream_particles(col_organs, stomach_center, heart_world, s4_a, s4_b)
    set_vis(blood_objs, 1, False)
    set_vis(blood_objs, s4_a, True)

    # 6. Camera Choreography (4 sharp Zack D. vertical shots)
    cam = bpy.data.objects.get("Main_Vertical_Camera")
    target = bpy.data.objects.get("Subject_Target")

    # Shot 1: Medium portrait of dressed MPFB2 human -> smooth push-in as body fades to X-ray revealing organs
    set_cam_keyframe(cam, target, s1_a, (0.0, -1.95, 1.32), (0.0, -0.04, 1.26), lens=50.0)
    set_cam_keyframe(cam, target, s1_b, (0.05, -0.95, 1.30), (0.02, -0.05, 1.25), lens=55.0)

    # Shot 2: Clean unobstructed chest cavity — Beating Z-Anatomy Heart, Lungs, Esophagus & glowing Pill
    set_cam_keyframe(cam, target, s2_a, (-0.18, -0.62, 1.38), (0.015, -0.05, 1.30), lens=55.0)
    set_cam_keyframe(cam, target, s2_b, (0.16, -0.54, 1.24), (0.025, -0.06, 1.22), lens=60.0)

    # Shot 3: Crisp macro cutaway of real Z-Anatomy Stomach + Mucosa + bubbling emerald acid
    set_cam_keyframe(cam, target, s3_a, (stomach_center.x - 0.08, stomach_center.y - 0.44, stomach_center.z + 0.03), (stomach_center.x, stomach_center.y, stomach_center.z - 0.005), lens=62.0)
    set_cam_keyframe(cam, target, s3_b, (stomach_center.x + 0.09, stomach_center.y - 0.36, stomach_center.z + 0.01), (stomach_center.x, stomach_center.y, stomach_center.z - 0.008), lens=68.0)

    # Shot 4: Hero pull-back orbit around translucent X-ray torso & beating Heart as glowing particles surge up the Aorta
    set_cam_keyframe(cam, target, s4_a, (0.14, -0.55, 1.26), (0.02, -0.06, 1.26), lens=56.0)
    set_cam_keyframe(cam, target, s4_b, (-0.28, -1.15, 1.34), (0.01, -0.05, 1.26), lens=52.0)

    blend_out = DEMO_DIR / "pretrained_demo_scene.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_out))
    print(f"[OK] Saved demo scene -> {blend_out}")

    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    if "--preview" in sys.argv:
        preview_frames = [
            ("preview_s1_start", s1_a + 4),
            ("preview_s1_xray", s1_b - 4),
            ("preview_s2_chest", (s2_a + s2_b) // 2),
            ("preview_s3_stomach", s3_b - 10),
            ("preview_s4_finale", (s4_a + s4_b) // 2),
        ]
        for label, fr in preview_frames:
            scene.frame_set(fr)
            out_p = DEMO_DIR / f"{label}.png"
            scene.render.filepath = str(out_p)
            bpy.ops.render.render(write_still=True)
            print(f"[PREVIEW] {label} (frame {fr}) -> {out_p}")
        return

    scene.render.filepath = str(FRAMES_DIR / "frame_")
    print(f"[RENDER] Rendering {total_frames} frames @ 720x1280 to {FRAMES_DIR} ...")
    bpy.ops.render.render(animation=True)
    print("[DONE] All frames rendered!")


if __name__ == "__main__":
    main()
