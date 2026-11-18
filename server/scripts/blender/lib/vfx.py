"""
Visual Effects, Dynamic Particles & 2D Chalk Explanatory Overlays for Blender 5.0+
Provides:
- High-velocity crude oil gusher geyser & mist spray
- Rocketing drill pipe blowout with shattered timber splinters
- Falling sand cave-in particles
- Signature 2D chalk / chalkboard explanatory line-art overlays (cavern lake myth, arrows)
"""

import math
import random
import bpy
from .materials import (
    create_pbr_material,
    create_crude_oil_material,
    create_industrial_metal_material,
    create_weathered_timber_material,
)

# =============================================================================
# 1. THE 10-STORY OIL GUSHER GEYSER
# =============================================================================

def build_dynamic_gusher(location=(0, 1.55, 9.4), height=16.0, duration_frames=200):
    """
    Constructs the towering black crude gusher fountain:
    - Turbulent, expanding vertical plume
    - High-velocity particle spray emitting fine droplets into the wind
    """
    mat_crude = create_crude_oil_material()
    
    ox, oy, oz = location
    
    # 1. Primary Turbulent Oil Jet Column
    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=0.25, radius2=1.4, depth=height,
        location=(ox, oy, oz + height / 2)
    )
    plume = bpy.context.active_object
    plume.name = "Gusher_Primary_Plume"
    plume.data.materials.append(mat_crude)
    
    # Add displace modifier with clouds noise for dynamic turbulence
    displace = plume.modifiers.new(name="Plume_Turbulence", type='DISPLACE')
    tex = bpy.data.textures.new("Tex_PlumeNoise", type='CLOUDS')
    tex.noise_scale = 0.45
    displace.texture = tex
    displace.strength = 0.35
    
    # 2. Upper Geyser Crown & Wind-Drift Spray
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=1.8, location=(ox + 0.6, oy + 0.4, oz + height)
    )
    mist = bpy.context.active_object
    mist.name = "Gusher_Mist_Crown"
    mist.scale = (1.4, 1.2, 2.2)
    mist.data.materials.append(mat_crude)
    
    # Displace for billowing turbulent smoke/spray effect
    disp_mist = mist.modifiers.new(name="Mist_Turbulence", type='DISPLACE')
    tex_mist = bpy.data.textures.new("Tex_MistNoise", type='CLOUDS')
    tex_mist.noise_scale = 0.65
    disp_mist.texture = tex_mist
    disp_mist.strength = 0.55
    
    # 3. Particle Emitter for Raining Oil Droplets
    bpy.ops.mesh.primitive_circle_add(radius=0.45, location=(ox, oy, oz + 0.5))
    emitter = bpy.context.active_object
    emitter.name = "Gusher_Particle_Emitter"
    
    ps = emitter.modifiers.new(name="GusherParticles", type='PARTICLE_SYSTEM')
    settings = ps.particle_system.settings
    settings.count = 800
    settings.frame_start = 1
    settings.frame_end = duration_frames
    settings.lifetime = 45
    settings.normal_factor = 14.0 # High upward ejection velocity
    settings.factor_random = 3.5
    settings.particle_size = 0.08
    settings.size_random = 0.5

# =============================================================================
# 2. 2D CHALK / LINE-ART EXPLANATORY OVERLAY (Underground Lake Myth)
# =============================================================================

def build_chalk_underground_lake(location=(0, 0.15, -6.5), scale=1.0):
    """
    Signature Zack D. Films / Mildly Elsewhere 2D animated line-art graphic.
    Draws a white chalkboard-style cartoon cavern with wavy fluid lines
    and a red cross-out / prohibition slash to illustrate:
    'You see, the oil isn't sitting in a lake down there.'
    """
    mat_white_chalk = create_pbr_material(
        "Mat_WhiteChalk", (1.0, 1.0, 1.0), roughness=0.95, specular=0.1
    )
    mat_chalk_glow = create_pbr_material(
        "Mat_ChalkGlow", (0.95, 0.98, 1.0), roughness=0.9, specular=0.2
    )
    
    ox, oy, oz = location
    
    # Cavern Outline (segmented bezier curve or connected cylinders)
    cavern_points = [
        (-1.8, 0.0), (-1.4, 0.6), (-0.6, 0.9), (0.6, 0.85),
        (1.5, 0.5), (1.8, -0.1), (1.4, -0.7), (0.4, -0.9),
        (-0.7, -0.85), (-1.5, -0.6), (-1.8, 0.0)
    ]
    
    for i in range(len(cavern_points) - 1):
        p1 = (ox + cavern_points[i][0] * scale, oy, oz + cavern_points[i][1] * scale)
        p2 = (ox + cavern_points[i+1][0] * scale, oy, oz + cavern_points[i+1][1] * scale)
        
        dx = p2[0] - p1[0]
        dz = p2[2] - p1[2]
        dist = math.sqrt(dx*dx + dz*dz)
        mid = ((p1[0]+p2[0])/2, oy, (p1[2]+p2[2])/2)
        
        bpy.ops.mesh.primitive_cylinder_add(radius=0.035 * scale, depth=dist, location=mid)
        seg = bpy.context.active_object
        seg.name = f"Chalk_Cavern_{i}"
        theta = math.atan2(dx, dz)
        seg.rotation_euler = (0, theta, 0)
        seg.data.materials.append(mat_white_chalk)
        
    # Internal Wavy Fluid Level Line
    wave_pts = [(-1.5, -0.2), (-0.8, -0.1), (0.0, -0.25), (0.8, -0.12), (1.4, -0.2)]
    for i in range(len(wave_pts) - 1):
        p1 = (ox + wave_pts[i][0] * scale, oy, oz + wave_pts[i][1] * scale)
        p2 = (ox + wave_pts[i+1][0] * scale, oy, oz + wave_pts[i+1][1] * scale)
        dx = p2[0] - p1[0]
        dz = p2[2] - p1[2]
        dist = math.sqrt(dx*dx + dz*dz)
        mid = ((p1[0]+p2[0])/2, oy, (p1[2]+p2[2])/2)
        
        bpy.ops.mesh.primitive_cylinder_add(radius=0.025 * scale, depth=dist, location=mid)
        wave_seg = bpy.context.active_object
        wave_seg.name = f"Chalk_Wave_{i}"
        wave_seg.rotation_euler = (0, math.atan2(dx, dz), 0)
        wave_seg.data.materials.append(mat_white_chalk)

# =============================================================================
# 3. CRUMBLING SAND CAVE-IN PARTICLES
# =============================================================================

def build_sand_cavein(location=(0, 0.05, -2.0), scale=1.0):
    """
    Constructs crumbling sandstone debris and sand grain clusters
    sliding inward into the open borehole.
    """
    mat_sand = create_pbr_material("Mat_CrumblingSand", (0.84, 0.72, 0.48), roughness=0.92)
    
    ox, oy, oz = location
    for i in range(16):
        ang = random.uniform(0, math.pi * 2)
        dist = random.uniform(0.18, 0.38) * scale
        px = ox + math.cos(ang) * dist
        pz = oz + random.uniform(-0.8, 0.8) * scale
        
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=random.uniform(0.04, 0.09) * scale,
            location=(px, oy, pz)
        )
        pebble = bpy.context.active_object
        pebble.name = f"Sand_Grain_{i}"
        pebble.scale = (1.0, 0.6, 1.2)
        pebble.data.materials.append(mat_sand)
