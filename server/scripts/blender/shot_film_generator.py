#!/usr/bin/env python3
"""
Master 16-Shot Film Generator for Blender 5.0+ (Upgraded Architecture)
Faithfully reproduces all 16 shots of "Mildly Elsewhere" Texas Oil Drilling & Pumpjack Explainer
using modular parametric 3D props, multi-layered sedimentary PBR shaders, calibrated camera rigs,
and visual effects overlays.

Shots breakdown (Total 1790 frames @ 24.0 fps = 74.583s):
- Shot 01: Hook & Cutaway Tilt (frames 1-43, 1.79s)
- Shot 02: Derrick Oil Well (frames 1-45, 1.88s)
- Shot 03: Sandy Sides Caving In (frames 1-39, 1.62s)
- Shot 04: Mud Pump Ground Piston (frames 1-29, 1.21s)
- Shot 05: Mud Column Pressure Descent (frames 1-297, 12.38s)
- Shot 06: Inside Derrick Looking Up (frames 1-14, 0.58s)
- Shot 07: Violent Pipe Ejection (frames 1-13, 0.54s)
- Shot 08: Pipe Breaking Crown (frames 1-22, 0.92s)
- Shot 09: 10-Story Gusher 9-Day Sky (frames 1-235, 9.79s)
- Shot 10: Deep Strata Plunge (frames 1-21, 0.88s)
- Shot 11: Underground Reservoir Myth (frames 1-24, 1.00s)
- Shot 12: Macro Pores Zoom (frames 1-13, 0.54s)
- Shot 13: Micro Rock Sponge Pebbles (frames 1-148, 6.17s)
- Shot 14: Casing Pipe Travel Up (frames 1-17, 0.71s)
- Shot 15: Cellar BOP Hydraulic Clamp (frames 1-441, 18.38s)
- Shot 16: Walking Beam Pump Jack (frames 1-389, 16.21s)
"""

import sys
import os
import math
import argparse
import bpy

# Ensure local blender lib is importable
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from lib.materials import (
    create_pbr_material,
    create_rich_strata_material,
    create_weathered_timber_material,
    create_industrial_metal_material,
    create_prairie_ground_material,
    create_crude_oil_material,
    create_river_pebble_material,
)
from lib.props import (
    build_timber_derrick,
    build_cutaway_block,
    build_prairie_environment,
    build_mud_pump,
    build_blowout_preventer,
    build_pumpjack,
    build_rock_sponge,
    add_beam_between_points,
    add_smooth_subdiv,
)
from lib.lighting import (
    setup_lighting,
    setup_world_background,
)
from lib.cameras import (
    create_camera,
    setup_camera_derrick_wide,
    setup_camera_derrick_upward,
    setup_camera_borehole_closeup,
    setup_camera_subterranean,
    setup_camera_macro_sponge,
    setup_camera_cellar_bop,
    setup_camera_pumpjack_profile,
)
from lib.vfx import (
    build_dynamic_gusher,
    build_chalk_underground_lake,
    build_sand_cavein,
)

# =============================================================================
# ARGUMENT PARSING & CONFIGURATION
# =============================================================================

def parse_args():
    import json
    argv = sys.argv
    if "--" in argv:
        raw_args = argv[argv.index("--") + 1:]
    else:
        raw_args = []
        
    if raw_args and raw_args[0].strip().startswith("{"):
        try:
            return json.loads(raw_args[0])
        except Exception:
            pass
            
    parser = argparse.ArgumentParser(description="Master 16-Shot Film Generator")
    parser.add_argument("--shot", type=int, default=1, choices=list(range(1, 17)))
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--output_path", type=str, required=True)
    parser.add_argument("--samples", type=int, default=8)
    return vars(parser.parse_args(raw_args))

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_render_engine(scene, fps, total_frames, output_path, samples=8):
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    
    scene.frame_start = 1
    scene.frame_end = total_frames
    scene.view_settings.view_transform = 'Standard'
    
    try:
        engine_items = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
        if 'BLENDER_EEVEE_NEXT' in engine_items:
            scene.render.engine = 'BLENDER_EEVEE_NEXT'
        elif 'BLENDER_EEVEE' in engine_items:
            scene.render.engine = 'BLENDER_EEVEE'
        else:
            scene.render.engine = 'CYCLES'
    except Exception:
        scene.render.engine = 'BLENDER_EEVEE'
        
    if hasattr(scene, 'eevee'):
        scene.eevee.taa_render_samples = samples
        if hasattr(scene.eevee, 'use_shadows'):
            scene.eevee.use_shadows = True
            
    if hasattr(scene.render.image_settings, 'media_type'):
        scene.render.image_settings.media_type = 'VIDEO'
        
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'HIGH'
    scene.render.ffmpeg.ffmpeg_preset = 'REALTIME'
    scene.render.filepath = os.path.abspath(output_path)

# =============================================================================
# SHOT IMPLEMENTATIONS (1 to 16)
# =============================================================================

def build_shot_1(duration_frames):
    """Shot 01: Hook & Cutaway Tilt (1-43 frames, 1.79s)"""
    setup_lighting(bpy.context.scene, "daylight")
    build_prairie_environment()
    build_cutaway_block(height=9.2)
    build_timber_derrick(height=9.4, include_crown=True)
    
    # Traveling Block & Hook
    mat_hook = create_industrial_metal_material((0.85, 0.55, 0.12), metallic=0.88, roughness=0.28)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.55, 7.2))
    block = bpy.context.active_object
    block.name = "Traveling_Block"
    block.scale = (0.55, 0.55, 0.95)
    block.data.materials.append(mat_hook)
    
    # Drill Pipe Hanging Down
    mat_pipe = create_industrial_metal_material((0.26, 0.28, 0.30), metallic=0.92, roughness=0.35)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=14.0, location=(0, 1.55, 0.0))
    pipe = bpy.context.active_object
    pipe.name = "Drill_Pipe_String"
    pipe.data.materials.append(mat_pipe)
    
    # Camera Tilt: Starts looking down at prairie/derrick base, tilts down toward cutaway
    cam = setup_camera_derrick_wide(z_offset=0.0)
    cam.location.z = 5.2
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = 2.4
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

def build_shot_2(duration_frames):
    """Shot 02: Derrick Oil Well (1-45 frames, 1.88s)"""
    setup_lighting(bpy.context.scene, "daylight")
    build_prairie_environment()
    build_cutaway_block(height=9.2)
    build_timber_derrick(height=9.4, include_crown=True)
    
    # Drill String with Central Borehole
    mat_pipe = create_industrial_metal_material((0.24, 0.26, 0.28), metallic=0.92, roughness=0.35)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=16.0, location=(0, 0.05, -2.0))
    pipe = bpy.context.active_object
    pipe.name = "Central_Drill_Pipe"
    pipe.data.materials.append(mat_pipe)
    
    # Camera: Steady framing capturing full derrick tower and subterranean rock layers
    cam = setup_camera_derrick_wide(z_offset=0.0)

def build_shot_3(duration_frames):
    """Shot 03: Sandy Sides Caving In (1-39 frames, 1.62s)"""
    setup_lighting(bpy.context.scene, "underground_studio")
    build_cutaway_block(height=7.0, width=8.0, depth=6.0)
    
    # Central Drill Pipe & Drag Bit
    mat_steel = create_industrial_metal_material((0.25, 0.27, 0.30), metallic=0.94, roughness=0.28)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=6.0, location=(0, 0.05, 0.5))
    pipe = bpy.context.active_object
    pipe.name = "Drill_Pipe"
    pipe.data.materials.append(mat_steel)
    
    # Churning Fishtail Bit
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.38, radius2=0.08, depth=0.55, location=(0, 0.05, -2.3))
    bit = bpy.context.active_object
    bit.name = "Fishtail_Bit"
    bit.data.materials.append(mat_steel)
    
    # Animated Rotation of Bit
    bit.rotation_euler = (0, 0, 0)
    bit.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    bit.rotation_euler = (0, 0, math.radians(720))
    bit.keyframe_insert(data_path="rotation_euler", index=2, frame=duration_frames)
    
    # Crumbling Sand & Pebble Particles
    build_sand_cavein(location=(0, 0.05, -1.8), scale=1.0)
    
    # Camera Close-Up on Borehole Wall
    cam = setup_camera_borehole_closeup(location=(0.0, -2.5, -1.5))

def build_shot_4(duration_frames):
    """Shot 04: Mud Pump Ground Piston (1-29 frames, 1.21s)"""
    setup_lighting(bpy.context.scene, "daylight")
    build_prairie_environment()
    
    # Industrial Duplex Mud Pump
    build_mud_pump(location=(0.0, 1.8, 0.0), scale=1.1)
    
    # High-pressure mud hose leading to rig
    mat_hose = create_pbr_material("Mat_MudHose", (0.12, 0.12, 0.14), roughness=0.7)
    add_beam_between_points((-2.4, 1.2, 0.4), (2.8, 1.2, 0.25), 0.14, mat_hose, name="Ground_Mud_Hose")
    
    # Camera Framing Mud Pump
    cam = create_camera(
        name="Cam_Mud_Pump",
        location=(0.0, -3.8, 1.35),
        rotation_euler=(math.radians(76), 0, 0),
        lens=44.0
    )

def build_shot_5(duration_frames):
    """Shot 05: Mud Column Pressure Descent (1-297 frames, 12.38s)"""
    setup_lighting(bpy.context.scene, "underground_studio")
    build_cutaway_block(height=12.0, width=10.0, depth=6.0)
    
    # Central Pipe & Flowing Mud Fluid
    mat_steel = create_industrial_metal_material((0.26, 0.28, 0.30), metallic=0.92, roughness=0.32)
    mat_mud = create_pbr_material("Mat_ThickMud", (0.42, 0.32, 0.20), roughness=0.45, specular=0.6)
    
    # Drill Pipe
    bpy.ops.mesh.primitive_cylinder_add(radius=0.20, depth=14.0, location=(0, 0.05, -2.0))
    pipe = bpy.context.active_object
    pipe.name = "Central_Pipe"
    pipe.data.materials.append(mat_steel)
    
    # Mud Flow Column in Annular Space
    bpy.ops.mesh.primitive_cylinder_add(radius=0.38, depth=12.0, location=(0, 0.05, -2.0))
    mud_col = bpy.context.active_object
    mud_col.name = "Mud_Annulus"
    mud_col.data.materials.append(mat_mud)
    
    # Camera Tracking Down the Borehole with Mud Descent
    cam = create_camera(
        name="Cam_Mud_Descent",
        location=(0.0, -3.2, 1.5),
        rotation_euler=(math.radians(88), 0, 0),
        lens=45.0
    )
    cam.location.z = 1.5
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = -7.5
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

def build_shot_6(duration_frames):
    """
    Shot 06: Inside Derrick Looking Up (1-14 frames, 0.58s)
    Worm's-eye perspective looking straight UP (+Z) through the hollow timber lattice.
    """
    setup_lighting(bpy.context.scene, "twilight_derrick")
    build_timber_derrick(height=9.4, include_crown=True)
    
    # Rig floor rotary table opening
    bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=0.08, location=(0, 1.55, 0.05))
    table = bpy.context.active_object
    table.data.materials.append(create_industrial_metal_material((0.18, 0.18, 0.18), metallic=0.9))
    
    # Camera placed on rig floor pointing STRAIGHT UP through derrick center
    setup_camera_derrick_upward(location=(0.0, 1.55, 0.25))

def build_shot_7(duration_frames):
    """
    Shot 07: Violent Pipe Ejection (1-13 frames, 0.54s)
    Worm's-eye perspective with drill pipe violently rocketing upward through derrick.
    """
    setup_lighting(bpy.context.scene, "twilight_derrick")
    build_timber_derrick(height=9.4, include_crown=True)
    
    # Drill pipe rocketing upward at high velocity
    mat_pipe = create_industrial_metal_material((0.72, 0.75, 0.80), metallic=0.98, roughness=0.18)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.20, depth=16.0, location=(0, 1.55, -4.0))
    pipe = bpy.context.active_object
    pipe.name = "Rocketing_Pipe"
    pipe.data.materials.append(mat_pipe)
    
    pipe.location.z = -4.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 22.0
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    setup_camera_derrick_upward(location=(0.0, 1.55, 0.25))

def build_shot_8(duration_frames):
    """
    Shot 08: Pipe Breaking Crown (1-22 frames, 0.92s)
    Drill pipe crashing through top crown block, shattering wooden beams.
    """
    setup_lighting(bpy.context.scene, "twilight_derrick")
    
    mat_timber = create_weathered_timber_material()
    mat_steel = create_industrial_metal_material((0.26, 0.28, 0.32), metallic=0.95, roughness=0.28)
    
    # Crown Platform at Z=0
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    crown = bpy.context.active_object
    crown.name = "Crown_Platform"
    crown.scale = (1.4, 1.4, 0.25)
    crown.data.materials.append(mat_steel)
    
    # Dual Pulleys / Sheaves
    for sx in [-0.35, 0.35]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=0.12, location=(sx, 0, 0.35))
        sheave = bpy.context.active_object
        sheave.rotation_euler = (0, math.radians(90), 0)
        sheave.data.materials.append(mat_steel)
        
    # Ejecting Drill Pipe
    bpy.ops.mesh.primitive_cylinder_add(radius=0.20, depth=8.0, location=(0, 0, -3.5))
    pipe = bpy.context.active_object
    pipe.data.materials.append(mat_steel)
    pipe.location.z = -3.5
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 6.5
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    # Shattered Timber Splinters Bursting
    for i in range(12):
        ang = (i / 12.0) * math.pi * 2
        bpy.ops.mesh.primitive_cube_add(size=0.15, location=(math.cos(ang) * 0.2, math.sin(ang) * 0.2, 0.1))
        sp = bpy.context.active_object
        sp.name = f"Splinter_{i}"
        sp.scale = (0.25, 0.08, 0.6)
        sp.data.materials.append(mat_timber)
        
        sp.location = (math.cos(ang) * 0.2, math.sin(ang) * 0.2, 0.1)
        sp.keyframe_insert(data_path="location", frame=4)
        sp.location = (math.cos(ang) * 2.8, math.sin(ang) * 2.8, 2.5 + (i % 3) * 0.8)
        sp.keyframe_insert(data_path="location", frame=duration_frames)
        
    # Camera Framing Crown Block
    cam = create_camera(
        name="Cam_Crown_Break",
        location=(0.0, -4.2, 0.5),
        rotation_euler=(math.radians(82), 0, 0),
        lens=48.0
    )

def build_shot_9(duration_frames):
    """
    Shot 09: 10-Story Gusher 9-Day Sky (1-235 frames, 9.79s)
    Towering black crude geyser fountain shooting over 100 feet into the blue sky.
    """
    setup_lighting(bpy.context.scene, "daylight")
    build_prairie_environment()
    build_cutaway_block(height=9.2)
    build_timber_derrick(height=9.4, include_crown=True)
    
    # 10-Story Dynamic Oil Gusher Plume
    build_dynamic_gusher(location=(0, 1.55, 9.4), height=18.0, duration_frames=duration_frames)
    
    # Wide Camera Framing Geyser Towering into Sky
    cam = setup_camera_derrick_wide(z_offset=4.5)

def build_shot_10(duration_frames):
    """Shot 10: Deep Strata Plunge (1-21 frames, 0.88s)"""
    setup_lighting(bpy.context.scene, "underground_studio")
    build_cutaway_block(height=14.0, width=10.0, depth=6.0)
    
    # Fast Camera Plunge Downward through Strata
    cam = setup_camera_subterranean(z_level=-1.5)
    cam.location.z = -1.5
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = -10.5
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

def build_shot_11(duration_frames):
    """
    Shot 11: Underground Reservoir Myth (1-24 frames, 1.00s)
    Dark subterranean rock with signature 2D white chalk line-art overlay
    illustrating the misconception of an 'underground cavern lake'.
    """
    setup_lighting(bpy.context.scene, "underground_studio")
    build_cutaway_block(height=8.0, width=8.0, depth=6.0)
    
    # 2D Chalk Line-Art Cavern Overlay
    build_chalk_underground_lake(location=(0, 0.15, -4.5), scale=1.1)
    
    # Subterranean Framing
    setup_camera_subterranean(z_level=-4.5)

def build_shot_12(duration_frames):
    """Shot 12: Macro Pores Zoom (1-13 frames, 0.54s)"""
    setup_lighting(bpy.context.scene, "macro_studio")
    build_rock_sponge(num_pebbles=28)
    
    # Camera Rapid Zoom into Rock Pores
    cam = setup_camera_macro_sponge()
    cam.location.y = -6.5
    cam.keyframe_insert(data_path="location", index=1, frame=1)
    cam.location.y = -3.4
    cam.keyframe_insert(data_path="location", index=1, frame=duration_frames)

def build_shot_13(duration_frames):
    """
    Shot 13: Micro Rock Sponge Pebbles (1-148 frames, 6.17s)
    Smooth packed river stones with natural quartz colors submerged in glossy black crude.
    """
    setup_lighting(bpy.context.scene, "macro_studio")
    build_rock_sponge(num_pebbles=36)
    
    # Macro Camera with Depth of Field
    setup_camera_macro_sponge()

def build_shot_14(duration_frames):
    """Shot 14: Casing Pipe Travel Up (1-17 frames, 0.71s)"""
    setup_lighting(bpy.context.scene, "underground_studio")
    build_cutaway_block(height=12.0, width=8.0, depth=6.0)
    
    # Steel Casing String
    mat_casing = create_industrial_metal_material((0.35, 0.38, 0.42), metallic=0.96, roughness=0.22)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=14.0, location=(0, 0.05, -4.0))
    casing = bpy.context.active_object
    casing.data.materials.append(mat_casing)
    
    # Camera Ascending rapidly from deep strata to surface
    cam = create_camera(
        name="Cam_Casing_Travel",
        location=(0.0, -3.2, -8.0),
        rotation_euler=(math.radians(88), 0, 0),
        lens=48.0
    )
    cam.location.z = -8.0
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = -1.2
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

def build_shot_15(duration_frames):
    """
    Shot 15: Cellar BOP Hydraulic Clamp (1-441 frames, 18.38s)
    Cellar cutaway showing dual-ram Blowout Preventer clamping shut around drill pipe.
    """
    setup_lighting(bpy.context.scene, "underground_studio")
    build_cutaway_block(height=7.0, width=8.0, depth=6.0)
    
    # Cellar Timber Walls
    mat_timber = create_weathered_timber_material()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.8, -1.2))
    cellar = bpy.context.active_object
    cellar.name = "Cellar_Wall"
    cellar.scale = (3.4, 2.4, 2.2)
    cellar.data.materials.append(mat_timber)
    
    # Cutaway Blowout Preventer with Clamping Rams
    build_blowout_preventer(location=(0, 0.05, -1.2), scale=1.0, cutaway=True, animated=True, total_frames=duration_frames)
    
    # Cellar Framing Camera
    setup_camera_cellar_bop()

def build_shot_16(duration_frames):
    """
    Shot 16: Walking Beam Pump Jack (1-389 frames, 16.21s)
    Complete nodding donkey pumpjack rocking rhythmically over the Texas oilfield.
    """
    setup_lighting(bpy.context.scene, "daylight")
    build_prairie_environment()
    build_cutaway_block(height=7.0, width=16.0, depth=10.0)
    
    # Main Foreground Walking Beam Pumpjack
    build_pumpjack(location=(0.0, 2.4, 0.0), scale=1.2, animated=True, total_frames=duration_frames)
    
    # Secondary Background Nodding Units
    for b_idx, (bx, by) in enumerate([(-7.5, 7.5), (7.8, 8.2), (-11.0, 12.0), (12.5, 11.5)]):
        build_pumpjack(location=(bx, by, 0.0), scale=0.75, animated=True, total_frames=duration_frames)
        
    # Profile Camera Framing Pumpjack
    setup_camera_pumpjack_profile()

# =============================================================================
# MAIN ENTRYPOINT
# =============================================================================

SHOT_DURATIONS = {
    1: 43,   # 1.79s
    2: 45,   # 1.88s
    3: 39,   # 1.62s
    4: 29,   # 1.21s
    5: 297,  # 12.38s
    6: 14,   # 0.58s
    7: 13,   # 0.54s
    8: 22,   # 0.92s
    9: 235,  # 9.79s
    10: 21,  # 0.88s
    11: 24,  # 1.00s
    12: 13,  # 0.54s
    13: 148, # 6.17s
    14: 17,  # 0.71s
    15: 441, # 18.38s
    16: 389  # 16.21s
}

def main():
    args = parse_args()
    shot_idx = args.get("shot", 1)
    fps = args.get("fps", 24)
    output_path = args.get("output_path")
    samples = args.get("samples", 8)
    
    total_frames = SHOT_DURATIONS.get(shot_idx, 48)
    
    clean_scene()
    scene = bpy.context.scene
    setup_render_engine(scene, fps, total_frames, output_path, samples)
    
    shot_builders = {
        1: build_shot_1,
        2: build_shot_2,
        3: build_shot_3,
        4: build_shot_4,
        5: build_shot_5,
        6: build_shot_6,
        7: build_shot_7,
        8: build_shot_8,
        9: build_shot_9,
        10: build_shot_10,
        11: build_shot_11,
        12: build_shot_12,
        13: build_shot_13,
        14: build_shot_14,
        15: build_shot_15,
        16: build_shot_16,
    }
    
    builder = shot_builders.get(shot_idx, build_shot_1)
    print(f"Building Upgraded Shot {shot_idx:02d} ({total_frames} frames @ {fps} fps)...")
    builder(total_frames)
    
    print(f"Rendering Shot {shot_idx:02d} to {output_path}...")
    bpy.ops.render.render(animation=True)
    print(f"Shot {shot_idx:02d} render completed successfully.")

if __name__ == "__main__":
    main()
