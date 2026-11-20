"""
Builds the reusable 9:16 Zack D. Films Master Studio Template (.blend)
optimized for RTX 3050 (6GB VRAM) + Blender 5.3 EEVEE Next.

Run headless:
  blender -b -P scripts/build_zack_d_studio.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "server" / "scripts" / "blender"))

from lib.asset_loader import apply_polyhaven_hdri, HDRI_DIR, TEMPLATES_DIR


def build_studio_template() -> Path:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # 1. Render engine tuned for RTX 3050 6GB (fast, crisp EEVEE Next)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 120
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 32
        scene.eevee.use_raytracing = True
        if hasattr(scene.eevee, "ray_tracing_options"):
            scene.eevee.ray_tracing_options.resolution_scale = "2"  # Half-res GI for 6GB VRAM speed

    # Color management: AgX crisp studio look
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = 0.0

    # 2. World Studio HDRI (uses local Poly Haven studio_small_08 if present)
    studio_hdris = list(HDRI_DIR.glob("studio_small_08*")) + list(HDRI_DIR.glob("*.hdr"))
    if studio_hdris:
        apply_polyhaven_hdri(studio_hdris[0].stem.replace("_2k", ""), strength=0.65)
    else:
        world = bpy.data.worlds.new("StudioWorld")
        scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = (0.12, 0.14, 0.18, 1.0)
            bg.inputs["Strength"].default_value = 0.7

    # 3. Seamless Studio Cyclorama Backdrop
    bpy.ops.mesh.primitive_plane_add(size=18.0, location=(0.0, 2.0, 0.0))
    cyc = bpy.context.active_object
    cyc.name = "Studio_Backdrop"
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    # Curve back edge upward using simple bevelled L-wall mesh
    bpy.data.objects.remove(cyc, do_unlink=True)

    mesh = bpy.data.meshes.new("Studio_Cyclorama_Mesh")
    verts = []
    faces = []
    width = 16.0
    # Floor from y=-6 to y=2, curve up to z=12 at y=6
    profile = [(-6.0, 0.0), (1.0, 0.0)]
    radius = 3.0
    steps = 12
    for i in range(1, steps + 1):
        ang = (math.pi / 2.0) * (i / steps)
        y = 1.0 + radius * math.sin(ang)
        z = radius * (1.0 - math.cos(ang))
        profile.append((y, z))
    profile.append((1.0 + radius, 12.0))

    for idx, (y, z) in enumerate(profile):
        verts.append((-width / 2, y, z))
        verts.append((width / 2, y, z))
        if idx > 0:
            a = (idx - 1) * 2
            b = a + 1
            c = idx * 2 + 1
            d = idx * 2
            faces.append((a, b, c, d))

    mesh.from_pydata(verts, [], faces)
    mesh.update()
    cyc = bpy.data.objects.new("Studio_Cyclorama", mesh)
    scene.collection.objects.link(cyc)
    for poly in cyc.data.polygons:
        poly.use_smooth = True

    cyc_mat = bpy.data.materials.new("Studio_Backdrop_Mat")
    cyc_mat.use_nodes = True
    bsdf = cyc_mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.78, 0.82, 0.88, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    cyc.data.materials.append(cyc_mat)

    # 4. 3-Point High-Key Zack D. Studio Lighting
    def add_area_light(name: str, loc, rot_deg, energy: float, size: float, color=(1.0, 1.0, 1.0)):
        ldata = bpy.data.lights.new(name=name, type="AREA")
        ldata.energy = energy
        ldata.size = size
        ldata.color = color
        lobj = bpy.data.objects.new(name, ldata)
        lobj.location = loc
        lobj.rotation_euler = tuple(math.radians(a) for a in rot_deg)
        scene.collection.objects.link(lobj)
        return lobj

    add_area_light("Key_Light", (3.5, -3.5, 4.5), (50, 0, 40), energy=450.0, size=2.5, color=(1.0, 0.97, 0.93))
    add_area_light("Fill_Light", (-4.0, -2.5, 3.0), (62, 0, -52), energy=220.0, size=3.5, color=(0.88, 0.94, 1.0))
    add_area_light("Rim_Light", (0.0, 3.5, 4.8), (125, 0, 0), energy=320.0, size=2.0, color=(1.0, 0.99, 0.95))

    # 5. Subject Target Empty + 9:16 Vertical Camera with Track-To Constraint
    target = bpy.data.objects.new("Subject_Target", None)
    target.location = (0.0, 0.0, 1.0)
    scene.collection.objects.link(target)

    cam_data = bpy.data.cameras.new("Main_Vertical_Camera")
    cam_data.lens = 50.0
    cam_data.clip_start = 0.05
    cam_data.clip_end = 500.0
    cam_obj = bpy.data.objects.new("Main_Vertical_Camera", cam_data)
    cam_obj.location = (0.0, -5.2, 1.5)
    scene.collection.objects.link(cam_obj)

    track = cam_obj.constraints.new(type="TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam_obj

    # 6. Save Template
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = TEMPLATES_DIR / "zack_d_studio.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(out_path))
    print(f"[DONE] Saved Zack D. Master Studio Template -> {out_path}")
    return out_path


if __name__ == "__main__":
    build_studio_template()
