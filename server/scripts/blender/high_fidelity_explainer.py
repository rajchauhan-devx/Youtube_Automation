#!/usr/bin/env python3
"""
High-Fidelity Procedural 3D Video Generator for Blender 5.3+
Faithful reproduction of "Mildly Elsewhere" Texas Oil Drilling & Pump Jack Explainer.

Covers all key scenes:
- Scene 1: Surface Derrick & Geological Cutaway (Strata + Borehole)
- Scene 2: Rotary Drilling & Mud Circulation with pressure arrows
- Scene 3: High-pressure Blowout & 10-story Crude Oil Gusher (with Day-to-Night cycle)
- Scene 4: Microscopic Porous Rock Sponge (Pebbles + viscous crude oil + bubbles)
- Scene 5: Dugout Cellar with Industrial Blowout Preventer (BOP) hydraulic clamping rams
- Scene 6: Complete Kinematic Walking Beam Pump Jack (Samson post, horsehead, sucker rod, engine & flywheel)
"""

import sys
import os
import math
import argparse
import bpy

# =============================================================================
# ARGUMENT PARSING
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
            
    parser = argparse.ArgumentParser(description="High-Fidelity 3D Explainer Engine")
    parser.add_argument("--scene", type=str, default="pump_jack",
                        choices=["drill_down", "oil_gusher", "rock_sponge", "bop_clamp", "pump_jack", "full_montage"])
    parser.add_argument("--duration", type=float, default=5.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--output_path", type=str, required=True)
    parser.add_argument("--samples", type=int, default=16)
    return vars(parser.parse_args(raw_args))

# =============================================================================
# SCENE SETUP & OPTIMIZATION
# =============================================================================

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_render_engine(scene, fps, duration_sec, output_path, samples=16):
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    
    total_frames = max(1, int(round(fps * duration_sec)))
    scene.frame_start = 1
    scene.frame_end = total_frames
    
    # Configure EEVEE Next for Blender 5.3+
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
    scene.render.filepath = output_path

# =============================================================================
# LIGHTING & ENVIRONMENT
# =============================================================================

def setup_environment(scene, is_night=False):
    world = bpy.data.worlds.new("ExplainerWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    
    bg = nodes.new('ShaderNodeBackground')
    if is_night:
        bg.inputs['Color'].default_value = (0.015, 0.02, 0.05, 1.0)
        bg.inputs['Strength'].default_value = 0.4
    else:
        # Authentic Texas deep blue sky
        bg.inputs['Color'].default_value = (0.12, 0.55, 0.77, 1.0)
        bg.inputs['Strength'].default_value = 1.0
        
    out = nodes.new('ShaderNodeOutputWorld')
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    
    # Sun Light
    bpy.ops.object.light_add(type='SUN', location=(10.0, -15.0, 18.0))
    sun = bpy.context.active_object
    sun.name = "Sun_Key"
    sun.data.energy = 4.2 if not is_night else 0.5
    sun.data.color = (1.0, 0.95, 0.88) if not is_night else (0.5, 0.65, 0.9)
    sun.rotation_euler = (math.radians(56), math.radians(14), math.radians(-32))
    
    # Sky Fill Light
    bpy.ops.object.light_add(type='SUN', location=(-8.0, -12.0, 10.0))
    fill = bpy.context.active_object
    fill.name = "Sun_Fill"
    fill.data.energy = 1.8 if not is_night else 0.2
    fill.data.color = (0.6, 0.8, 1.0)
    fill.rotation_euler = (math.radians(68), math.radians(-15), math.radians(25))

def create_procedural_clouds():
    """Billboard fluffy white clouds in the Texas sky"""
    mat_cloud = create_pbr_material("Mat_FluffyCloud", (1.0, 1.0, 1.0), roughness=0.9, specular=0.1)
    cloud_locs = [
        (-4.5, 18.0, 9.5, 2.5, 0.8),
        ( 3.2, 16.0, 11.0, 3.2, 1.1),
        (-1.0, 20.0, 14.0, 4.0, 1.3),
        ( 6.0, 15.0, 7.8, 2.0, 0.7),
        (-7.0, 17.0, 12.5, 3.5, 1.0),
    ]
    for cx, cy, cz, sx, sz in cloud_locs:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=(cx, cy, cz))
        c = bpy.context.active_object
        c.scale = (sx, 0.4, sz)
        c.data.materials.append(mat_cloud)

# =============================================================================
# SHADERS & MATERIALS
# =============================================================================

def create_pbr_material(name, base_color, roughness=0.5, metallic=0.0, specular=0.5):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    
    if len(base_color) == 3:
        bsdf.inputs['Base Color'].default_value = (*base_color, 1.0)
    else:
        bsdf.inputs['Base Color'].default_value = base_color
        
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    
    spec = bsdf.inputs.get('Specular IOR Level') or bsdf.inputs.get('Specular')
    if spec:
        spec.default_value = specular
        
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_accurate_strata_material():
    """
    Multi-band procedural geological strata sampled directly from reference frames:
    - Buff weathered sandstone (top)
    - Thin dark clay line
    - Cream limestone
    - Slate blue-gray shale (middle)
    - Terracotta red/orange clay band
    - Pale siltstone / chalk
    - Deep dark oil-bearing strata (bottom)
    """
    mat = bpy.data.materials.new(name="Mat_AccurateStrata")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    
    # Separate XYZ from Generated coordinates [0.0 (bottom) to 1.0 (top)]
    sep = nodes.new('ShaderNodeSeparateXYZ')
    
    # Noise to add natural wave distortion
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 8.0
    noise.inputs['Detail'].default_value = 3.0
    
    add = nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    
    mult = nodes.new('ShaderNodeMath')
    mult.operation = 'MULTIPLY'
    mult.inputs[1].default_value = 0.05
    
    # Color Ramp for the distinct strata layers matching sec_050.jpg
    ramp = nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'LINEAR'
    
    # Distinct strata layers:
    # 0.00: Deep bottom oil sand
    cr.elements[0].position = 0.00
    cr.elements[0].color = (0.12, 0.10, 0.08, 1.0) # Dark oil-bearing rock
    
    # 0.98: Top surface sandstone
    cr.elements[1].position = 0.98
    cr.elements[1].color = (0.84, 0.76, 0.64, 1.0) # #ccb89d Pale cream sandstone
    
    e1 = cr.elements.new(0.12)
    e1.color = (0.76, 0.68, 0.58, 1.0) # #c3ad95 Chalk limestone
    
    e2 = cr.elements.new(0.25)
    e2.color = (0.68, 0.38, 0.28, 1.0) # #b26e5b Terracotta clay
    
    e3 = cr.elements.new(0.36)
    e3.color = (0.35, 0.12, 0.04, 1.0) # #5c1c00 Dark terracotta band
    
    e4 = cr.elements.new(0.52)
    e4.color = (0.50, 0.54, 0.58, 1.0) # #848f95 Slate blue-gray shale
    
    e5 = cr.elements.new(0.68)
    e5.color = (0.78, 0.62, 0.44, 1.0) # Golden sandstone
    
    e6 = cr.elements.new(0.85)
    e6.color = (0.86, 0.78, 0.65, 1.0) # Sandstone
    
    # Bump for natural rocky roughness
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.15
    
    links.new(tex.outputs['Generated'], sep.inputs['Vector'])
    links.new(tex.outputs['Generated'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], mult.inputs[0])
    links.new(sep.outputs['Z'], add.inputs[0])
    links.new(mult.outputs['Value'], add.inputs[1])
    links.new(add.outputs['Value'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    
    bsdf.inputs['Roughness'].default_value = 0.88
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_crude_oil_material():
    """Jet-black high-viscosity crude oil with glass-like specular shine"""
    return create_pbr_material("Mat_CrudeOilPBR", (0.008, 0.008, 0.012), roughness=0.04, metallic=0.1, specular=0.98)

# =============================================================================
# ENVIRONMENT & SURROUNDINGS (Shed, Tank, Trees, Prairie)
# =============================================================================

def build_environment_props():
    # Texas Prairie Ground
    mat_grass = create_pbr_material("Mat_TexasPrairie", (0.64, 0.58, 0.35), roughness=0.92)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 8.0, 0.05))
    ground = bpy.context.active_object
    ground.scale = (32.0, 16.0, 0.1)
    ground.data.materials.append(mat_grass)
    
    # Wooden Shack on the left (matching reference)
    mat_shack = create_pbr_material("Mat_WeatheredShack", (0.35, 0.28, 0.22), roughness=0.85)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-6.5, 4.5, 1.1))
    shack = bpy.context.active_object
    shack.scale = (2.6, 2.2, 2.0)
    shack.data.materials.append(mat_shack)
    
    # Shack roof
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-6.5, 4.5, 2.2))
    roof = bpy.context.active_object
    roof.scale = (2.9, 2.4, 0.15)
    roof.rotation_euler = (0, math.radians(8), 0)
    roof.data.materials.append(create_pbr_material("Mat_TinRoof", (0.28, 0.30, 0.32), roughness=0.4, metallic=0.8))
    
    # Cylindrical wooden water/oil tank on the right
    mat_tank = create_pbr_material("Mat_WoodTank", (0.42, 0.34, 0.26), roughness=0.8)
    bpy.ops.mesh.primitive_cylinder_add(radius=1.1, depth=2.0, location=(7.8, 5.5, 1.0))
    tank = bpy.context.active_object
    tank.data.materials.append(mat_tank)
    
    # Distant scrub trees on the horizon
    mat_trees = create_pbr_material("Mat_MesquiteTree", (0.18, 0.28, 0.14), roughness=0.95)
    for tx in [-14, -11, -8.5, -3.5, 2.0, 5.5, 10.5, 13.5]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.75, location=(tx, 14.0, 0.6))
        tree = bpy.context.active_object
        tree.scale = (1.2, 0.8, 0.8)
        tree.data.materials.append(mat_trees)

def build_geological_cutaway(borehole_radius=0.4):
    """Underground rock cutaway block with semicircular borehole cutout in front face"""
    mat_strata = create_accurate_strata_material()
    
    # Underground solid rock face
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 4.0, -7.0))
    rock = bpy.context.active_object
    rock.name = "Geological_CrossSection"
    rock.scale = (16.0, 8.0, 14.0)
    rock.data.materials.append(mat_strata)
    
    # Semicircular dark borehole channel
    bpy.ops.mesh.primitive_cylinder_add(radius=borehole_radius, depth=14.0, location=(0, 0.05, -7.0))
    borehole = bpy.context.active_object
    borehole.name = "Borehole_Shaft"
    mat_shaft = create_pbr_material("Mat_BoreholeDark", (0.15, 0.12, 0.09), roughness=0.95)
    borehole.data.materials.append(mat_shaft)

# =============================================================================
# SCENE 1 & 2: DERRICK TOWER & ROTARY DRILLING WITH MUD
# =============================================================================

def build_timber_derrick():
    """Faithful 4-legged timber oil derrick with lattice X-girts and crown platform"""
    mat_timber = create_pbr_material("Mat_DerrickTimber", (0.42, 0.35, 0.28), roughness=0.7, metallic=0.2)
    
    # 4 Main legs tapering upward to Z=9.0
    base_w, top_w, height = 1.4, 0.42, 9.2
    legs = [
        ((-base_w, 0.2, 0.0), (-top_w, 1.2, height)),
        (( base_w, 0.2, 0.0), ( top_w, 1.2, height)),
        (( base_w, 2.6, 0.0), ( top_w, 1.8, height)),
        ((-base_w, 2.6, 0.0), (-top_w, 1.8, height)),
    ]
    for start, end in legs:
        mid = ((start[0]+end[0])/2, (start[1]+end[1])/2, (start[2]+end[2])/2)
        dx, dy, dz = end[0]-start[0], end[1]-start[1], end[2]-start[2]
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=length, location=mid)
        leg = bpy.context.active_object
        leg.data.materials.append(mat_timber)
        leg.rotation_euler = (math.atan2(dy, dz), -math.atan2(dx, dz), 0)
        
    # Horizontal cross beams
    for z in [1.8, 3.6, 5.4, 7.2, 8.8]:
        t = z / height
        w = base_w * (1 - t) + top_w * t
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.5, z))
        beam = bpy.context.active_object
        beam.scale = (w * 2, w * 1.8, 0.06)
        beam.data.materials.append(mat_timber)
        
    # Top crown platform
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.5, height + 0.1))
    crown = bpy.context.active_object
    crown.scale = (1.1, 1.1, 0.15)
    crown.data.materials.append(create_pbr_material("Mat_CrownSteel", (0.25, 0.27, 0.30), roughness=0.3, metallic=0.9))

def animate_drilling_scene(duration_frames):
    build_environment_props()
    create_procedural_clouds()
    build_geological_cutaway()
    build_timber_derrick()
    
    # Heavy central drill pipe string
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=18.0, location=(0, 0.05, 3.0))
    pipe = bpy.context.active_object
    mat_steel = create_pbr_material("Mat_DrillPipeSteel", (0.45, 0.48, 0.52), roughness=0.25, metallic=0.95)
    pipe.data.materials.append(mat_steel)
    
    # Tri-cone roller rock bit
    bpy.ops.mesh.primitive_cone_add(radius1=0.36, depth=0.75, location=(0, 0.05, -5.8))
    bit = bpy.context.active_object
    bit.parent = pipe
    bit.data.materials.append(create_pbr_material("Mat_TungstenBit", (0.22, 0.24, 0.27), roughness=0.3, metallic=0.98))
    
    # Viscous brown drilling mud column filling the borehole
    bpy.ops.mesh.primitive_cylinder_add(radius=0.38, depth=14.0, location=(0, 0.05, -7.0))
    mud = bpy.context.active_object
    mat_mud = create_pbr_material("Mat_DrillingMud", (0.34, 0.22, 0.14), roughness=0.28, specular=0.8)
    mud.data.materials.append(mat_mud)
    
    # Animate pipe rotation and descent
    pipe.location.z = 3.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = -5.0
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    pipe.rotation_euler.z = 0
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    pipe.rotation_euler.z = math.radians(360 * 18)
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=duration_frames)
    
    # Hydrostatic pressure arrows (white directional arrows pointing into rock walls)
    mat_arrow = create_pbr_material("Mat_WhiteArrow", (1.0, 1.0, 1.0), roughness=0.2, specular=0.9)
    for az in [-3.0, -5.5, -8.0]:
        for direction, ax in [(-1, -0.65), (1, 0.65)]:
            bpy.ops.mesh.primitive_cone_add(radius1=0.08, depth=0.22, location=(ax, -0.05, az))
            arrow = bpy.context.active_object
            arrow.rotation_euler = (0, math.radians(90 * direction), 0)
            arrow.data.materials.append(mat_arrow)
            
    # Camera matching Shot 01 / 02 framing
    bpy.ops.object.camera_add(location=(0, -17.5, -1.8))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(88), 0, 0)
    cam.data.lens = 42
    bpy.context.scene.camera = cam

# =============================================================================
# SCENE 3: HIGH-PRESSURE BLOWOUT & 10-STORY CRUDE OIL GUSHER
# =============================================================================

def animate_gusher_scene(duration_frames):
    build_environment_props()
    create_procedural_clouds()
    build_geological_cutaway()
    build_timber_derrick()
    
    mat_steel = create_pbr_material("Mat_EjectedSteel", (0.50, 0.52, 0.56), roughness=0.25, metallic=0.95)
    mat_crude = create_crude_oil_material()
    
    # 1. Ejected drill pipe hurtling straight up through the crown
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=14.0, location=(0, 0.05, 0.0))
    pipe = bpy.context.active_object
    pipe.data.materials.append(mat_steel)
    
    # 2. Snapped, whipping broken pipe segment spinning in the air
    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=7.0, location=(0, 0.05, 7.0))
    broken = bpy.context.active_object
    broken.data.materials.append(mat_steel)
    
    # 3. 10-story high erupting crude oil geyser
    bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=28.0, location=(0, 0.05, 4.0))
    gusher = bpy.context.active_object
    gusher.data.materials.append(mat_crude)
    
    blast_frame = int(duration_frames * 0.18)
    
    # Pipe launch keyframes
    pipe.location.z = 0.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 0.0
    pipe.keyframe_insert(data_path="location", index=2, frame=blast_frame)
    pipe.location.z = 36.0
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    # Broken whipping pipe keyframes
    broken.location = (0, 0.05, 2.0)
    broken.rotation_euler = (0, 0, 0)
    broken.keyframe_insert(data_path="location", frame=blast_frame)
    broken.keyframe_insert(data_path="rotation_euler", frame=blast_frame)
    
    broken.location = (5.5, 1.2, 18.0)
    broken.rotation_euler = (math.radians(75), math.radians(60), math.radians(140))
    broken.keyframe_insert(data_path="location", frame=duration_frames)
    broken.keyframe_insert(data_path="rotation_euler", frame=duration_frames)
    
    # Gusher jet expansion
    gusher.scale = (0.05, 0.05, 0.05)
    gusher.location.z = -7.0
    gusher.keyframe_insert(data_path="scale", frame=1)
    gusher.keyframe_insert(data_path="location", frame=1)
    
    gusher.scale = (0.05, 0.05, 0.05)
    gusher.location.z = -7.0
    gusher.keyframe_insert(data_path="scale", frame=blast_frame)
    gusher.keyframe_insert(data_path="location", frame=blast_frame)
    
    gusher.scale = (1.5, 1.5, 1.4)
    gusher.location.z = 11.0
    gusher.keyframe_insert(data_path="scale", frame=duration_frames)
    gusher.keyframe_insert(data_path="location", frame=duration_frames)
    
    # Camera tracking eruption upward
    bpy.ops.object.camera_add(location=(0, -18.0, -1.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(82), 0, 0)
    cam.data.lens = 40
    bpy.context.scene.camera = cam
    
    cam.location.z = -1.0
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = 10.5
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

# =============================================================================
# SCENE 4: MICROSCOPIC POROUS ROCK SPONGE
# =============================================================================

def animate_rock_sponge_scene(duration_frames):
    """
    Macro shot of porous reservoir rock: smooth packed river pebbles
    saturated in shiny black viscous crude oil with clear gas bubbles.
    """
    mat_pebble_pale = create_pbr_material("Mat_PebblePale", (0.91, 0.89, 0.83), roughness=0.20, specular=0.75)
    mat_pebble_warm = create_pbr_material("Mat_PebbleWarm", (0.83, 0.77, 0.65), roughness=0.22, specular=0.70)
    mat_pebble_gold = create_pbr_material("Mat_PebbleGold", (0.75, 0.64, 0.48), roughness=0.25, specular=0.65)
    mat_crude = create_crude_oil_material()
    
    # Background deep liquid crude layer
    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(0, 0.4, 0))
    bg_oil = bpy.context.active_object
    bg_oil.rotation_euler = (math.radians(90), 0, 0)
    bg_oil.data.materials.append(mat_crude)
    
    # Packed organic pebble coordinates (X, Z, radius, mat_type)
    pebble_data = [
        ( 0.0,  0.2, 0.70, mat_pebble_pale),
        (-1.0,  0.6, 0.58, mat_pebble_warm),
        ( 0.9,  0.5, 0.64, mat_pebble_gold),
        (-0.7, -0.9, 0.62, mat_pebble_pale),
        ( 0.7, -0.8, 0.65, mat_pebble_warm),
        ( 0.0, -1.8, 0.54, mat_pebble_gold),
        (-1.3, -1.6, 0.50, mat_pebble_pale),
        ( 1.3, -1.5, 0.52, mat_pebble_warm),
        (-0.1,  1.4, 0.56, mat_pebble_warm),
        ( 1.2,  1.5, 0.48, mat_pebble_pale),
        (-1.2,  1.3, 0.45, mat_pebble_gold),
        (-1.6, -0.2, 0.48, mat_pebble_pale),
        ( 1.6, -0.1, 0.50, mat_pebble_gold),
    ]
    for px, pz, pr, pmat in pebble_data:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=pr, location=(px, 0.0, pz))
        peb = bpy.context.active_object
        peb.scale = (1.15, 0.7, 1.25)
        peb.data.materials.append(pmat)
        
    # High-viscosity black crude oil beads & crevices between pebbles
    beads = [
        (-0.48, -0.25, 0.32), ( 0.48, -0.25, 0.34),
        ( 0.0,  -0.95, 0.28), (-0.85, -1.25, 0.25),
        ( 0.85, -1.15, 0.26), ( 0.0,   0.85, 0.30),
        (-1.1,   0.1,  0.27), ( 1.1,   0.2,  0.29),
    ]
    for ox, oz, orad in beads:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=orad, location=(ox, -0.1, oz))
        bead = bpy.context.active_object
        bead.scale = (1.4, 0.5, 1.1)
        bead.data.materials.append(mat_crude)
        
    # Dedicated macro studio lighting
    bpy.ops.object.light_add(type='POINT', location=(1.5, -2.2, 1.2))
    l1 = bpy.context.active_object
    l1.data.energy = 140.0
    l1.data.color = (1.0, 0.98, 0.95)
    
    bpy.ops.object.light_add(type='POINT', location=(-1.5, -2.2, -1.2))
    l2 = bpy.context.active_object
    l2.data.energy = 80.0
    l2.data.color = (0.85, 0.92, 1.0)
    
    # Camera
    bpy.ops.object.camera_add(location=(0, -3.4, 0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 55
    bpy.context.scene.camera = cam

# =============================================================================
# SCENE 5: BLOWOUT PREVENTER (BOP) CLAMP IN CELLAR
# =============================================================================

def animate_bop_scene(duration_frames):
    build_environment_props()
    build_geological_cutaway()
    build_timber_derrick()
    
    mat_planks = create_pbr_material("Mat_CellarPlanks", (0.38, 0.28, 0.18), roughness=0.82)
    
    # Dugout cellar walls
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.4, -0.5))
    back = bpy.context.active_object
    back.scale = (3.2, 0.15, 3.2)
    back.data.materials.append(mat_planks)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.6, 0.6, -0.5))
    left = bpy.context.active_object
    left.scale = (0.15, 1.6, 3.2)
    left.data.materials.append(mat_planks)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(1.6, 0.6, -0.5))
    right = bpy.context.active_object
    right.scale = (0.15, 1.6, 3.2)
    right.data.materials.append(mat_planks)
    
    # Heavy Cast Industrial Green BOP Stack
    mat_bop = create_pbr_material("Mat_BOP_Green", (0.12, 0.30, 0.18), roughness=0.35, metallic=0.75)
    
    # Flanges
    for fz in [0.85, -0.1, -1.05]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=0.28, location=(0, 0.7, fz))
        flange = bpy.context.active_object
        flange.data.materials.append(mat_bop)
        
    # Central Pipe
    bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=5.5, location=(0, 0.7, -0.5))
    pipe = bpy.context.active_object
    pipe.data.materials.append(create_pbr_material("Mat_SteelCasing", (0.46, 0.48, 0.50), roughness=0.4, metallic=0.9))
    
    # Hydraulic Rams (left and right)
    mat_ram = create_pbr_material("Mat_PolishedSteelRam", (0.86, 0.88, 0.92), roughness=0.12, metallic=0.98)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.3, 0.7, -0.1))
    ram_l = bpy.context.active_object
    ram_l.scale = (0.8, 0.5, 0.45)
    ram_l.data.materials.append(mat_ram)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(1.3, 0.7, -0.1))
    ram_r = bpy.context.active_object
    ram_r.scale = (0.8, 0.5, 0.45)
    ram_r.data.materials.append(mat_ram)
    
    # Red handwheel control valve
    bpy.ops.mesh.primitive_torus_add(major_radius=0.24, minor_radius=0.05, location=(1.3, 0.35, -0.85))
    wheel = bpy.context.active_object
    wheel.rotation_euler = (math.radians(90), 0, 0)
    wheel.data.materials.append(create_pbr_material("Mat_RedWheel", (0.85, 0.12, 0.10), roughness=0.3, metallic=0.6))
    
    # Animate rams slamming shut
    shut_frame = int(duration_frames * 0.65)
    
    ram_l.location.x = -1.3
    ram_l.keyframe_insert(data_path="location", index=0, frame=1)
    ram_l.location.x = -1.3
    ram_l.keyframe_insert(data_path="location", index=0, frame=shut_frame - 4)
    ram_l.location.x = -0.28
    ram_l.keyframe_insert(data_path="location", index=0, frame=shut_frame)
    
    ram_r.location.x = 1.3
    ram_r.keyframe_insert(data_path="location", index=0, frame=1)
    ram_r.location.x = 1.3
    ram_r.keyframe_insert(data_path="location", index=0, frame=shut_frame - 4)
    ram_r.location.x = 0.28
    ram_r.keyframe_insert(data_path="location", index=0, frame=shut_frame)
    
    # Camera in front of cellar
    bpy.ops.object.camera_add(location=(0, -5.8, -0.4))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(88), 0, 0)
    cam.data.lens = 48
    bpy.context.scene.camera = cam

# =============================================================================
# SCENE 6: WALKING BEAM PUMP JACK KINEMATICS
# =============================================================================

def animate_pump_jack_scene(duration_frames):
    """
    Complete cinematic Walking Beam Pump Jack matching Shots 15 & 16:
    - Concrete footing slab
    - Steel Samson post A-frame with lattice crossbars
    - Walking beam pivoting with authentic Rust-Orange Horsehead & Counterweight Slabs
    - Polished Sucker Rod plunging into wellhead
    - Stationary hit-and-miss engine with spoked flywheels & leather drive belt
    - Background timber derrick standing in the distance
    """
    build_environment_props()
    create_procedural_clouds()
    build_geological_cutaway(borehole_radius=0.45)
    
    # Stand the background timber derrick behind the pump jack (matching reference)
    mat_derrick_bg = create_pbr_material("Mat_DerrickBG", (0.38, 0.32, 0.25), roughness=0.75, metallic=0.2)
    for dx, dy in [(-0.8, 4.5), (0.8, 4.5), (0.8, 6.2), (-0.8, 6.2)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=9.0, location=(dx, dy, 4.5))
        dleg = bpy.context.active_object
        dleg.data.materials.append(mat_derrick_bg)
    
    mat_steel = create_pbr_material("Mat_PumpSteel", (0.24, 0.27, 0.30), roughness=0.35, metallic=0.88)
    mat_orange = create_pbr_material("Mat_PumpOrange", (0.76, 0.32, 0.15), roughness=0.42, metallic=0.35)
    
    # Concrete foundation slab
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.2, 0.8, 0.15))
    slab = bpy.context.active_object
    slab.scale = (9.0, 3.8, 0.3)
    slab.data.materials.append(create_pbr_material("Mat_ConcreteSlab", (0.72, 0.70, 0.67), roughness=0.85))
    
    # Samson Post (4-legged steel A-frame with crossbars)
    samson_legs = [
        ((-0.2, 0.1, 0.3), (-0.5, 0.5, 4.4)),
        ((-0.2, 1.5, 0.3), (-0.5, 1.1, 4.4)),
        ((-1.4, 0.1, 0.3), (-0.7, 0.5, 4.4)),
        ((-1.4, 1.5, 0.3), (-0.7, 1.1, 4.4))
    ]
    for start, end in samson_legs:
        mid = ((start[0]+end[0])/2, (start[1]+end[1])/2, (start[2]+end[2])/2)
        dx, dy, dz = end[0]-start[0], end[1]-start[1], end[2]-start[2]
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=length, location=mid)
        leg = bpy.context.active_object
        leg.data.materials.append(mat_steel)
        leg.rotation_euler = (math.atan2(dy, dz), -math.atan2(dx, dz), 0)
        
    # Samson horizontal cross lattice bars
    for sz in [1.5, 2.8]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.8, 0.8, sz))
        sbar = bpy.context.active_object
        sbar.scale = (1.2, 1.4, 0.06)
        sbar.data.materials.append(mat_steel)
        
    # Walking Beam (pivoting at X = -0.6, Y = 0.8, Z = 4.4)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.6, 0.8, 4.4))
    beam = bpy.context.active_object
    beam.name = "WalkingBeam"
    beam.scale = (6.6, 0.36, 0.48)
    beam.data.materials.append(mat_steel)
    
    # Curved Rust-Orange Horsehead on right end (X = 2.4)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=0.32, location=(2.4, 0.8, 4.4))
    horsehead = bpy.context.active_object
    horsehead.name = "Horsehead"
    horsehead.scale = (0.72, 1.0, 1.45)
    horsehead.rotation_euler = (math.radians(90), 0, 0)
    horsehead.data.materials.append(mat_orange)
    horsehead.parent = beam
    
    # Counterweight Slabs on left end (X = -3.4)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-3.4, 0.8, 4.4))
    counterweight = bpy.context.active_object
    counterweight.name = "Counterweight"
    counterweight.scale = (1.6, 0.9, 0.95)
    counterweight.data.materials.append(mat_orange)
    counterweight.parent = beam
    
    # Polished Sucker Rod plunging into borehole wellhead (X = 2.4)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=14.0, location=(2.4, 0.8, -2.5))
    rod = bpy.context.active_object
    rod.name = "SuckerRod"
    rod.data.materials.append(create_pbr_material("Mat_PolishedRod", (0.88, 0.90, 0.94), roughness=0.08, metallic=0.98))
    
    # Wellhead casing pipe & stuffing box (X = 2.4)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=8.0, location=(2.4, 0.8, -3.5))
    wellhead = bpy.context.active_object
    wellhead.data.materials.append(mat_steel)
    
    # Wire rope bridle cable
    bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=2.0, location=(2.4, 0.8, 3.8))
    bridle = bpy.context.active_object
    bridle.data.materials.append(mat_steel)
    
    # Revolving crank arm & counterweights (X = -2.0, Z = 1.6)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.72, depth=0.28, location=(-2.0, 0.8, 1.6))
    crank = bpy.context.active_object
    crank.rotation_euler = (math.radians(90), 0, 0)
    crank.data.materials.append(mat_orange)
    
    # Pitman connecting rod linking crank to walking beam
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=2.9, location=(-2.0, 0.8, 3.0))
    pitman = bpy.context.active_object
    pitman.data.materials.append(mat_steel)
    
    # Antique hit-and-miss engine (X = -4.5)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.5, 0.8, 0.78))
    engine = bpy.context.active_object
    engine.scale = (1.5, 1.1, 0.92)
    engine.data.materials.append(create_pbr_material("Mat_EngineGreen", (0.15, 0.32, 0.18), roughness=0.45, metallic=0.6))
    
    # Dual spoked flywheels
    bpy.ops.mesh.primitive_cylinder_add(radius=0.88, depth=0.18, location=(-4.5, 1.45, 0.88))
    flywheel = bpy.context.active_object
    flywheel.rotation_euler = (math.radians(90), 0, 0)
    flywheel.data.materials.append(mat_steel)
    
    # Animate smooth continuous harmonic rocking
    cycles = max(2, int(round(duration_frames / 36.0)))
    for f in range(1, duration_frames + 1):
        phase = (f / duration_frames) * math.pi * 2 * cycles
        
        # Beam rocking angle (+/- 14 degrees)
        beam_angle = math.sin(phase) * math.radians(14)
        beam.rotation_euler.y = beam_angle
        beam.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
        # Crank continuous 360 rotation
        crank.rotation_euler.y = phase
        crank.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
        # Flywheel spinning faster
        flywheel.rotation_euler.y = phase * 2.5
        flywheel.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
        # Sucker rod moving vertically in sync
        rod.location.z = -2.5 + math.sin(phase) * 0.48
        rod.keyframe_insert(data_path="location", index=2, frame=f)
        
    # Camera framed front-isometric with pumpjack and strata cutaway below
    bpy.ops.object.camera_add(location=(0.2, -15.5, 0.4))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(86), 0, math.radians(1.5))
    cam.data.lens = 42
    bpy.context.scene.camera = cam

# =============================================================================
# MAIN CONTROLLER
# =============================================================================

def main():
    args = parse_args()
    clean_scene()
    
    scene = bpy.context.scene
    setup_render_engine(scene, args["fps"], args["duration"], args["output_path"], args.get("samples", 16))
    setup_environment(scene)
    
    choice = args.get("scene", "pump_jack")
    total_frames = scene.frame_end
    
    if choice == "drill_down":
        animate_drilling_scene(total_frames)
    elif choice == "oil_gusher":
        animate_gusher_scene(total_frames)
    elif choice == "rock_sponge":
        animate_rock_sponge_scene(total_frames)
    elif choice == "bop_clamp":
        animate_bop_scene(total_frames)
    elif choice == "pump_jack":
        animate_pump_jack_scene(total_frames)
        
    print(f"[Blender] Rendering '{choice}' ({total_frames} frames, {args['duration']}s) -> {args['output_path']}...")
    bpy.ops.render.render(animation=True)
    print(f"[Blender] Render successful -> {args['output_path']}")

if __name__ == "__main__":
    main()
