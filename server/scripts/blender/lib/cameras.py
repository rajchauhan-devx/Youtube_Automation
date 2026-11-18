"""
Camera Rigs and Presets for 9:16 Vertical Video Explainer Automation
Provides calibrated camera rigs for:
- Derrick Wide Cutaway
- Worm's-Eye Derrick Interior (looking up through lattice)
- Borehole Close-up & Caving
- Subterranean Deep Plunge
- Macro Rock Sponge Matrix
- Cellar BOP Cutaway
- Walking Beam Pump Jack Profile
"""

import math
import bpy

def create_camera(name, location, rotation_euler, lens=35.0, clip_start=0.05, clip_end=250.0):
    """Creates and configures a camera object as the active scene camera."""
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.name = name
    cam.rotation_euler = rotation_euler
    cam.data.lens = lens
    cam.data.clip_start = clip_start
    cam.data.clip_end = clip_end
    
    # 9:16 vertical sensor fitting
    cam.data.sensor_fit = 'VERTICAL'
    bpy.context.scene.camera = cam
    return cam

def setup_camera_derrick_wide(z_offset=0.0):
    """Wide 9:16 view showing full derrick tower, prairie horizon, and cutaway earth."""
    return create_camera(
        name="Cam_Derrick_Wide",
        location=(0.0, -21.5, 0.5 + z_offset),
        rotation_euler=(math.radians(89), 0, 0),
        lens=35.0
    )

def setup_camera_derrick_upward(location=(0.0, 1.55, 0.25)):
    """
    Worm's-eye view from rig floor looking straight UP through the hollow timber
    lattice to the crown sheaves and blue sky.
    Euler rotation (180°, 0°, 180°) points forward along +Z with +Y up.
    """
    return create_camera(
        name="Cam_Derrick_Upward",
        location=location,
        rotation_euler=(math.radians(180), 0, math.radians(180)),
        lens=22.0 # Wide angle to capture towering corner legs
    )

def setup_camera_borehole_closeup(location=(0.0, -2.8, -1.8)):
    """Close-up view of borehole wall, drill bit, and caving sand."""
    return create_camera(
        name="Cam_Borehole_Closeup",
        location=location,
        rotation_euler=(math.radians(86), 0, 0),
        lens=48.0,
        clip_start=0.05
    )

def setup_camera_subterranean(z_level=-6.5):
    """Framing for deep rock strata and subterranean reservoir."""
    return create_camera(
        name="Cam_Subterranean",
        location=(0.0, -6.8, z_level),
        rotation_euler=(math.radians(90), 0, 0),
        lens=42.0
    )

def setup_camera_macro_sponge():
    """55mm macro lens focused on packed river pebble matrix."""
    cam = create_camera(
        name="Cam_Macro_Sponge",
        location=(0.0, -5.8, 0.0),
        rotation_euler=(math.radians(90), 0, 0),
        lens=42.0,
        clip_start=0.05
    )
    # Shallow depth of field
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 5.8
    cam.data.dof.aperture_fstop = 2.8
    return cam

def setup_camera_cellar_bop():
    """Cutaway framing of the cellar pit and clamping BOP."""
    return create_camera(
        name="Cam_Cellar_BOP",
        location=(0.0, -4.8, -1.2),
        rotation_euler=(math.radians(88), 0, 0),
        lens=42.0
    )

def setup_camera_pumpjack_profile():
    """Profile 9:16 view of rocking walking beam pumpjack."""
    return create_camera(
        name="Cam_Pumpjack_Profile",
        location=(-7.5, -3.2, 3.6),
        rotation_euler=(math.radians(75), math.radians(4), math.radians(-55)),
        lens=35.0
    )
