#!/usr/bin/env python3
"""
Master 16-Shot Film Generator for Blender 5.3+
Faithfully reproduces all 16 shots of "Mildly Elsewhere" Texas Oil Drilling & Pumpjack Explainer.

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
            
    parser = argparse.ArgumentParser(description="Master 16-Shot Film Generator")
    parser.add_argument("--shot", type=int, default=1, choices=list(range(1, 17)))
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--output_path", type=str, required=True)
    parser.add_argument("--samples", type=int, default=8)
    return vars(parser.parse_args(raw_args))

# =============================================================================
# SCENE CONFIGURATION
# =============================================================================

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_render_engine(scene, fps, total_frames, output_path, samples=8):
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    
    scene.frame_start = 1
    scene.frame_end = total_frames
    
    # View transform: Standard maintains vibrant sky and strata colors without AgX desaturation
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
# MATERIALS & SHADERS
# =============================================================================

def create_pbr_material(name, base_color, roughness=0.5, metallic=0.0, specular=0.5, emission=None):
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
        
    if emission:
        emit_input = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
        if emit_input:
            if len(emission) == 3:
                emit_input.default_value = (*emission, 1.0)
            else:
                emit_input.default_value = emission
        emit_strength = bsdf.inputs.get('Emission Strength')
        if emit_strength:
            emit_strength.default_value = 1.5
            
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_rich_strata_material():
    """Calibrated sedimentary geological strata shader matching reference video"""
    mat = bpy.data.materials.new(name="Mat_RichStrata")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ')
    
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 8.0
    noise.inputs['Detail'].default_value = 4.0
    
    mult = nodes.new('ShaderNodeMath')
    mult.operation = 'MULTIPLY'
    mult.inputs[1].default_value = 0.035
    
    add = nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    
    ramp = nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'LINEAR'
    
    # 7 Distinct strata bands calibrated from reference RGB extraction:
    # 0.00: Deep dark crude-saturated limestone (0.08, 0.06, 0.04)
    # 0.18: Warm golden sandstone (0.75, 0.55, 0.28)
    # 0.35: Rich terracotta red shale (0.62, 0.24, 0.12)
    # 0.50: Deep dark terracotta boundary (0.40, 0.12, 0.04)
    # 0.65: Slate blue-gray shale (0.35, 0.42, 0.48)
    # 0.80: Weathered buff sandstone (0.78, 0.68, 0.50)
    # 0.98: Pale cream limestone surface (0.85, 0.78, 0.65)
    cr.elements[0].position = 0.00
    cr.elements[0].color = (0.08, 0.06, 0.04, 1.0)
    
    cr.elements[1].position = 0.98
    cr.elements[1].color = (0.85, 0.78, 0.65, 1.0)
    
    e1 = cr.elements.new(0.18)
    e1.color = (0.75, 0.55, 0.28, 1.0)
    
    e2 = cr.elements.new(0.35)
    e2.color = (0.62, 0.24, 0.12, 1.0)
    
    e3 = cr.elements.new(0.50)
    e3.color = (0.40, 0.12, 0.04, 1.0)
    
    e4 = cr.elements.new(0.65)
    e4.color = (0.35, 0.42, 0.48, 1.0)
    
    e5 = cr.elements.new(0.80)
    e5.color = (0.78, 0.68, 0.50, 1.0)
    
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    bump.inputs['Distance'].default_value = 0.08
    
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
    return create_pbr_material("Mat_CrudeOilPBR", (0.004, 0.004, 0.006), roughness=0.03, metallic=0.15, specular=0.98)

# =============================================================================
# ENVIRONMENT SETUP
# =============================================================================

def setup_lighting_and_world(scene, env_type="daylight"):
    world = bpy.data.worlds.new("ShotWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    
    bg = nodes.new('ShaderNodeBackground')
    out = nodes.new('ShaderNodeOutputWorld')
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    
    if env_type == "daylight":
        # Calibrated Texas Sky Blue: sRGB [28, 123, 178] -> linear ~ (0.012, 0.20, 0.45)
        bg.inputs['Color'].default_value = (0.012, 0.20, 0.45, 1.0)
        bg.inputs['Strength'].default_value = 1.0
        
        bpy.ops.object.light_add(type='SUN', location=(10.0, -12.0, 15.0))
        sun = bpy.context.active_object
        sun.name = "Sun_Key"
        sun.data.energy = 2.4
        sun.data.color = (1.0, 0.98, 0.92)
        sun.rotation_euler = (math.radians(52), math.radians(14), math.radians(-28))
        
        bpy.ops.object.light_add(type='SUN', location=(-8.0, -10.0, 8.0))
        fill = bpy.context.active_object
        fill.name = "Sun_Fill"
        fill.data.energy = 0.9
        fill.data.color = (0.60, 0.80, 1.0)
        fill.rotation_euler = (math.radians(65), math.radians(-10), math.radians(25))
        
    elif env_type == "twilight_derrick":
        # Twilight upward view inside derrick: deep dusky indigo
        bg.inputs['Color'].default_value = (0.008, 0.04, 0.12, 1.0)
        bg.inputs['Strength'].default_value = 0.85
        
        bpy.ops.object.light_add(type='POINT', location=(0.0, 1.2, 0.8))
        pl = bpy.context.active_object
        pl.data.energy = 45.0
        pl.data.color = (0.85, 0.90, 1.0)
        
    elif env_type == "cutaway_studio":
        # Warm, high-visibility directional lighting for underground cross-sections
        bg.inputs['Color'].default_value = (0.012, 0.012, 0.015, 1.0)
        bg.inputs['Strength'].default_value = 0.4
        
        bpy.ops.object.light_add(type='SUN', location=(6.0, -12.0, -2.0))
        sun = bpy.context.active_object
        sun.name = "Cutaway_Key"
        sun.data.energy = 2.8
        sun.data.color = (1.0, 0.94, 0.86)
        sun.rotation_euler = (math.radians(65), math.radians(12), math.radians(-25))
        
        bpy.ops.object.light_add(type='SUN', location=(-6.0, -10.0, -6.0))
        fill = bpy.context.active_object
        fill.name = "Cutaway_Fill"
        fill.data.energy = 1.4
        fill.data.color = (0.80, 0.85, 0.95)
        fill.rotation_euler = (math.radians(75), math.radians(-10), math.radians(20))
        
    elif env_type == "underground_dark":
        # Subterranean dark rock environment
        bg.inputs['Color'].default_value = (0.008, 0.008, 0.012, 1.0)
        bg.inputs['Strength'].default_value = 0.3
        
        bpy.ops.object.light_add(type='SPOT', location=(0.0, -6.0, 1.0))
        spot = bpy.context.active_object
        spot.data.energy = 160.0
        spot.data.spot_size = math.radians(65)
        spot.rotation_euler = (math.radians(82), 0, 0)
        
    elif env_type == "micro_studio":
        # Microscopic pebble studio rim lighting
        bg.inputs['Color'].default_value = (0.015, 0.015, 0.020, 1.0)
        bg.inputs['Strength'].default_value = 0.4
        
        bpy.ops.object.light_add(type='POINT', location=(1.8, -2.4, 1.5))
        p1 = bpy.context.active_object
        p1.data.energy = 165.0
        p1.data.color = (1.0, 0.96, 0.90)
        
        bpy.ops.object.light_add(type='POINT', location=(-1.8, -2.4, -1.2))
        p2 = bpy.context.active_object
        p2.data.energy = 95.0
        p2.data.color = (0.75, 0.88, 1.0)

# =============================================================================
# REUSABLE PROPS
# =============================================================================

def build_prairie_ground():
    mat_grass = create_pbr_material("Mat_TexasPrairie", (0.35, 0.32, 0.18), roughness=0.92)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 6.0, 0.05))
    ground = bpy.context.active_object
    ground.scale = (32.0, 16.0, 0.1)
    ground.data.materials.append(mat_grass)

def build_shack():
    mat_shack = create_pbr_material("Mat_WeatheredShack", (0.28, 0.22, 0.16), roughness=0.88)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-6.5, 4.5, 1.1))
    shack = bpy.context.active_object
    shack.scale = (2.6, 2.2, 2.0)
    shack.data.materials.append(mat_shack)

def build_clouds():
    mat_cloud = create_pbr_material("Mat_FluffyCloud", (1.0, 1.0, 1.0), roughness=0.92, specular=0.1)
    cloud_locs = [
        (-4.5, 16.0, 9.5, 2.8, 0.9),
        ( 3.5, 15.0, 11.0, 3.4, 1.1),
        (-0.5, 18.0, 13.5, 4.2, 1.3),
        ( 6.2, 14.0, 8.0, 2.2, 0.7),
    ]
    for cx, cy, cz, sx, sz in cloud_locs:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=(cx, cy, cz))
        c = bpy.context.active_object
        c.scale = (sx, 0.4, sz)
        c.data.materials.append(mat_cloud)

def build_cutaway_block(height=9.0):
    mat_strata = create_rich_strata_material()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 4.0, -height/2))
    rock = bpy.context.active_object
    rock.name = "Geological_CrossSection"
    rock.scale = (16.0, 8.0, height)
    rock.data.materials.append(mat_strata)

def build_timber_derrick(height=9.2, include_crown=True):
    mat_timber = create_pbr_material("Mat_DerrickTimber", (0.32, 0.24, 0.17), roughness=0.80)
    base_w, top_w = 1.4, 0.42
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
        bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=length, location=mid)
        leg = bpy.context.active_object
        leg.data.materials.append(mat_timber)
        leg.rotation_euler = (math.atan2(dy, dz), -math.atan2(dx, dz), 0)
        
    for z in [1.8, 3.6, 5.4, 7.2, 8.8]:
        t = z / height
        w = base_w * (1 - t) + top_w * t
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.5, z))
        beam = bpy.context.active_object
        beam.scale = (w * 2, w * 1.8, 0.06)
        beam.data.materials.append(mat_timber)
        
    if include_crown:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.5, height + 0.1))
        crown = bpy.context.active_object
        crown.scale = (1.1, 1.1, 0.15)
        crown.data.materials.append(create_pbr_material("Mat_CrownSteel", (0.22, 0.24, 0.26), roughness=0.3, metallic=0.9))

# =============================================================================
# SHOT IMPLEMENTATIONS (1 to 16)
# =============================================================================

def build_shot_1(duration_frames):
    """Shot 01: Hook & Cutaway Tilt (1-43 frames, 1.79s)"""
    setup_lighting_and_world(bpy.context.scene, "daylight")
    build_prairie_ground()
    build_shack()
    build_clouds()
    build_cutaway_block()
    build_timber_derrick()
    
    # Traveling Block & Heavy Industrial Hook
    mat_hook = create_pbr_material("Mat_TravelingHook", (0.85, 0.55, 0.12), roughness=0.35, metallic=0.7)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.5, 7.0))
    block = bpy.context.active_object
    block.scale = (0.5, 0.5, 0.9)
    block.data.materials.append(mat_hook)
    
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.08, location=(0, 1.5, 6.2))
    hook = bpy.context.active_object
    hook.data.materials.append(mat_hook)
    
    # Kelly bar
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=3.5, location=(0, 1.5, 4.8))
    kelly = bpy.context.active_object
    kelly.data.materials.append(create_pbr_material("Mat_KellySteel", (0.45, 0.48, 0.52), roughness=0.25, metallic=0.95))
    
    # Keyframe hook lowering down
    block.location.z = 7.5
    block.keyframe_insert(data_path="location", index=2, frame=1)
    block.location.z = 5.8
    block.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    hook.location.z = 6.7
    hook.keyframe_insert(data_path="location", index=2, frame=1)
    hook.location.z = 5.0
    hook.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    kelly.location.z = 5.3
    kelly.keyframe_insert(data_path="location", index=2, frame=1)
    kelly.location.z = 3.6
    kelly.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    # Camera tilting from hook down to cutaway top
    bpy.ops.object.camera_add(location=(0, -14.0, 3.8))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(78), 0, 0)
    cam.data.lens = 42
    bpy.context.scene.camera = cam
    
    cam.location = (0, -14.0, 3.8)
    cam.rotation_euler = (math.radians(78), 0, 0)
    cam.keyframe_insert(data_path="location", frame=1)
    cam.keyframe_insert(data_path="rotation_euler", frame=1)
    
    cam.location = (0, -12.5, 1.8)
    cam.rotation_euler = (math.radians(84), 0, 0)
    cam.keyframe_insert(data_path="location", frame=duration_frames)
    cam.keyframe_insert(data_path="rotation_euler", frame=duration_frames)

def build_shot_2(duration_frames):
    """Shot 02: Derrick Oil Well (1-45 frames, 1.88s)"""
    setup_lighting_and_world(bpy.context.scene, "daylight")
    build_prairie_ground()
    build_shack()
    build_clouds()
    build_cutaway_block()
    build_timber_derrick()
    
    # Rotary Table
    bpy.ops.mesh.primitive_cylinder_add(radius=0.75, depth=0.15, location=(0, 1.5, 0.1))
    turntable = bpy.context.active_object
    turntable.data.materials.append(create_pbr_material("Mat_Turntable", (0.25, 0.25, 0.28), roughness=0.4, metallic=0.85))
    
    # Drill string descending and rotating
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=14.0, location=(0, 1.5, 2.0))
    pipe = bpy.context.active_object
    pipe.data.materials.append(create_pbr_material("Mat_DrillPipe", (0.50, 0.52, 0.55), roughness=0.25, metallic=0.95))
    
    pipe.location.z = 3.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 1.0
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    pipe.rotation_euler.z = 0
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    pipe.rotation_euler.z = math.radians(360 * 4)
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=duration_frames)
    
    bpy.ops.object.camera_add(location=(0, -11.5, 1.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(86), 0, 0)
    cam.data.lens = 45
    bpy.context.scene.camera = cam

def build_shot_3(duration_frames):
    """Shot 03: Sandy Sides Caving In (1-39 frames, 1.62s)"""
    setup_lighting_and_world(bpy.context.scene, "cutaway_studio")
    build_cutaway_block(height=7.0)
    
    # Borehole cavity
    bpy.ops.mesh.primitive_cylinder_add(radius=0.7, depth=7.0, location=(0, 0.05, -3.5))
    bore = bpy.context.active_object
    bore.data.materials.append(create_pbr_material("Mat_BoreCavity", (0.18, 0.12, 0.08), roughness=0.95))
    
    # Drill bit inside borehole
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=6.0, location=(0, 0.05, -1.5))
    pipe = bpy.context.active_object
    pipe.data.materials.append(create_pbr_material("Mat_PipeSteel", (0.45, 0.48, 0.52), roughness=0.25, metallic=0.95))
    
    bpy.ops.mesh.primitive_cone_add(radius1=0.45, depth=0.8, location=(0, 0.05, -4.2))
    bit = bpy.context.active_object
    bit.parent = pipe
    bit.data.materials.append(create_pbr_material("Mat_TungstenBit", (0.22, 0.24, 0.27), roughness=0.3, metallic=0.98))
    
    # Collapsing sandy rock chunks
    mat_sand = create_pbr_material("Mat_CollapsingSand", (0.58, 0.42, 0.22), roughness=0.95)
    chunks = []
    chunk_coords = [
        (-0.55, 0.0, -2.5, 0.18), ( 0.55, 0.0, -2.8, 0.22),
        (-0.50, 0.0, -3.6, 0.15), ( 0.52, 0.0, -3.9, 0.19),
        (-0.48, 0.0, -4.5, 0.20), ( 0.49, 0.0, -4.8, 0.16),
        (-0.52, 0.0, -1.8, 0.14), ( 0.54, 0.0, -2.1, 0.17)
    ]
    for cx, cy, cz, cr in chunk_coords:
        bpy.ops.mesh.primitive_ico_sphere_add(radius=cr, subdivisions=2, location=(cx, cy, cz))
        ch = bpy.context.active_object
        ch.data.materials.append(mat_sand)
        chunks.append((ch, cx, cz))
        
    for ch, cx, cz in chunks:
        ch.location = (cx, 0.0, cz)
        ch.keyframe_insert(data_path="location", frame=1)
        # Fall into borehole center
        target_x = cx * 0.4
        target_z = cz - 1.2
        ch.location = (target_x, 0.0, target_z)
        ch.keyframe_insert(data_path="location", frame=duration_frames)
        
    pipe.rotation_euler.z = 0
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    pipe.rotation_euler.z = math.radians(360 * 6)
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=duration_frames)
    
    # Close-up camera inside borehole
    bpy.ops.object.camera_add(location=(0, -2.6, -3.2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 50
    bpy.context.scene.camera = cam

def build_shot_4(duration_frames):
    """Shot 04: Mud Pump Ground Piston (1-29 frames, 1.21s)"""
    setup_lighting_and_world(bpy.context.scene, "daylight")
    build_prairie_ground()
    build_clouds()
    
    # Mechanical Duplex Mud Pump
    mat_pump_body = create_pbr_material("Mat_MudPumpBody", (0.24, 0.26, 0.28), roughness=0.45, metallic=0.7)
    mat_piston_red = create_pbr_material("Mat_PistonRed", (0.82, 0.12, 0.08), roughness=0.3, metallic=0.5)
    mat_chrome = create_pbr_material("Mat_ChromeRod", (0.75, 0.78, 0.82), roughness=0.15, metallic=0.98)
    
    # Pump main frame
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.2, 0.7))
    body = bpy.context.active_object
    body.scale = (2.4, 1.4, 1.1)
    body.data.materials.append(mat_pump_body)
    
    # Pulsation dampener sphere/dome on top
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45, location=(-0.6, 1.2, 1.6))
    dome = bpy.context.active_object
    dome.data.materials.append(mat_pump_body)
    
    # Dual hydraulic cylinders
    for px in [-0.5, 0.5]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=1.6, location=(px, 1.2, 0.6))
        cyl = bpy.context.active_object
        cyl.rotation_euler = (math.radians(90), 0, 0)
        cyl.data.materials.append(mat_pump_body)
        
        # Piston rod reciprocating
        bpy.ops.mesh.primitive_cylinder_add(radius=0.10, depth=1.4, location=(px, 0.5, 0.6))
        rod = bpy.context.active_object
        rod.rotation_euler = (math.radians(90), 0, 0)
        rod.data.materials.append(mat_piston_red if px > 0 else mat_chrome)
        
        # Animate reciprocation
        rod.location.y = 0.5
        rod.keyframe_insert(data_path="location", index=1, frame=1)
        rod.location.y = 1.0 if px > 0 else 0.2
        rod.keyframe_insert(data_path="location", index=1, frame=int(duration_frames/2))
        rod.location.y = 0.5
        rod.keyframe_insert(data_path="location", index=1, frame=duration_frames)
        
    # Mud hose curving to well
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=3.2, location=(1.2, 0.2, 0.5))
    hose = bpy.context.active_object
    hose.rotation_euler = (math.radians(35), math.radians(20), math.radians(45))
    hose.data.materials.append(create_pbr_material("Mat_RubberHose", (0.08, 0.08, 0.09), roughness=0.6))
    
    # Camera 3/4 angle on mud pump
    bpy.ops.object.camera_add(location=(-2.8, -3.8, 1.6))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(76), 0, math.radians(-32))
    cam.data.lens = 45
    bpy.context.scene.camera = cam

def build_shot_5(duration_frames):
    """Shot 05: Mud Column Pressure Descent (1-297 frames, 12.38s)"""
    setup_lighting_and_world(bpy.context.scene, "cutaway_studio")
    build_cutaway_block(height=11.0)
    
    # Borehole channel
    bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=11.0, location=(0, 0.05, -5.5))
    bore = bpy.context.active_object
    bore.data.materials.append(create_pbr_material("Mat_BoreWall", (0.16, 0.12, 0.09), roughness=0.95))
    
    # Mud filling the annular column
    bpy.ops.mesh.primitive_cylinder_add(radius=0.52, depth=11.0, location=(0, 0.05, -5.5))
    mud = bpy.context.active_object
    mud.data.materials.append(create_pbr_material("Mat_DrillingMud", (0.28, 0.18, 0.10), roughness=0.3, specular=0.8))
    
    # Central drill pipe
    bpy.ops.mesh.primitive_cylinder_add(radius=0.20, depth=13.0, location=(0, 0.05, -4.5))
    pipe = bpy.context.active_object
    pipe.data.materials.append(create_pbr_material("Mat_PipeSteel", (0.50, 0.52, 0.55), roughness=0.25, metallic=0.95))
    
    # Rotating bit at bottom
    bpy.ops.mesh.primitive_cone_add(radius1=0.45, depth=0.8, location=(0, 0.05, -10.2))
    bit = bpy.context.active_object
    bit.parent = pipe
    bit.data.materials.append(create_pbr_material("Mat_TungstenBit", (0.22, 0.24, 0.27), roughness=0.3, metallic=0.98))
    
    pipe.rotation_euler.z = 0
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    pipe.rotation_euler.z = math.radians(360 * 20)
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=duration_frames)
    
    # Pressure arrows pushing outward against borehole walls
    mat_arrow = create_pbr_material("Mat_PressureArrow", (1.0, 0.95, 0.40), roughness=0.2, emission=(1.0, 0.95, 0.40))
    arrow_z_list = [-1.5, -3.0, -4.5, -6.0, -7.5, -9.0]
    arrows = []
    for az in arrow_z_list:
        for direct, ax in [(-1, -0.72), (1, 0.72)]:
            bpy.ops.mesh.primitive_cone_add(radius1=0.08, depth=0.25, location=(ax, -0.05, az))
            arr = bpy.context.active_object
            arr.rotation_euler = (0, math.radians(90 * direct), 0)
            arr.data.materials.append(mat_arrow)
            arrows.append(arr)
            
    # Pulsate pressure arrows
    for f in range(1, duration_frames + 1, 18):
        scale_val = 1.25 if (f // 18) % 2 == 0 else 0.85
        for arr in arrows:
            arr.scale = (scale_val, scale_val, scale_val)
            arr.keyframe_insert(data_path="scale", frame=f)
            
    # Camera dollying down along mud column
    bpy.ops.object.camera_add(location=(0, -8.5, -2.5))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 42
    bpy.context.scene.camera = cam
    
    cam.location.z = -2.5
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = -6.8
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

def build_shot_6(duration_frames):
    """Shot 06: Inside Derrick Looking Up (1-14 frames, 0.58s)"""
    setup_lighting_and_world(bpy.context.scene, "twilight_derrick")
    build_timber_derrick(height=10.0, include_crown=True)
    
    # Rotary floor opening
    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.1, location=(0, 1.5, 0.05))
    table = bpy.context.active_object
    table.data.materials.append(create_pbr_material("Mat_Floor", (0.15, 0.15, 0.15), roughness=0.8))
    
    # Camera placed on the floor looking STRAIGHT UP into sky through derrick framing
    bpy.ops.object.camera_add(location=(0, 1.45, 0.25))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(-90), 0, 0) # Points along +Z (upward)
    cam.data.lens = 22 # Wide angle lens to capture towering timber legs
    bpy.context.scene.camera = cam

def build_shot_7(duration_frames):
    """Shot 07: Violent Pipe Ejection (1-13 frames, 0.54s)"""
    setup_lighting_and_world(bpy.context.scene, "twilight_derrick")
    build_timber_derrick(height=10.0, include_crown=True)
    
    # Drill pipe violently rocketing upward
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=14.0, location=(0, 1.45, -4.0))
    pipe = bpy.context.active_object
    pipe.data.materials.append(create_pbr_material("Mat_BlastedPipe", (0.55, 0.58, 0.62), roughness=0.2, metallic=0.98))
    
    pipe.location.z = -4.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 24.0 # Blasts right through derrick at hypersonic speed
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    # Gas spray particles/burst
    mat_spray = create_pbr_material("Mat_GasSpray", (0.35, 0.28, 0.20), roughness=0.8, specular=0.2)
    for i in range(12):
        ang = i * (math.pi * 2 / 12)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(math.cos(ang)*0.4, 1.45+math.sin(ang)*0.4, 0.5))
        sp = bpy.context.active_object
        sp.data.materials.append(mat_spray)
        sp.location.z = 0.5
        sp.keyframe_insert(data_path="location", index=2, frame=1)
        sp.location.z = 12.0
        sp.scale = (2.2, 2.2, 2.2)
        sp.keyframe_insert(data_path="location", index=2, frame=duration_frames)
        sp.keyframe_insert(data_path="scale", frame=duration_frames)
        
    bpy.ops.object.camera_add(location=(0, 1.45, 0.25))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(-90), 0, 0)
    cam.data.lens = 22
    bpy.context.scene.camera = cam

def build_shot_8(duration_frames):
    """Shot 08: Pipe Breaking Crown (1-22 frames, 0.92s)"""
    setup_lighting_and_world(bpy.context.scene, "twilight_derrick")
    
    # Top of derrick & Crown Block
    mat_timber = create_pbr_material("Mat_CrownTimber", (0.32, 0.24, 0.17), roughness=0.80)
    mat_steel = create_pbr_material("Mat_CrownSteel", (0.30, 0.32, 0.35), roughness=0.3, metallic=0.95)
    
    # Crown beams
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    crown = bpy.context.active_object
    crown.scale = (1.4, 1.4, 0.25)
    crown.data.materials.append(mat_steel)
    
    # Pulleys / Sheaves
    for sx in [-0.35, 0.35]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=0.12, location=(sx, 0, 0.25))
        sheave = bpy.context.active_object
        sheave.rotation_euler = (0, math.radians(90), 0)
        sheave.data.materials.append(mat_steel)
        
    # Ejecting pipe crashing through
    bpy.ops.mesh.primitive_cylinder_add(radius=0.20, depth=8.0, location=(0, 0, -4.5))
    pipe = bpy.context.active_object
    pipe.data.materials.append(mat_steel)
    
    # Splintered wood debris
    splinters = []
    for i in range(8):
        bpy.ops.mesh.primitive_cube_add(size=0.15, location=(0.1 * (i%3 - 1), 0.1, 0.1))
        sp = bpy.context.active_object
        sp.scale = (0.3, 0.1, 0.6)
        sp.data.materials.append(mat_timber)
        splinters.append((sp, (i - 4) * 0.4, (i % 2 - 0.5) * 0.8))
        
    # Keyframe smash
    pipe.location.z = -3.5
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 6.0
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    for sp, dx, dy in splinters:
        sp.location = (0, 0, 0.1)
        sp.keyframe_insert(data_path="location", frame=4)
        sp.location = (dx * 2.5, dy * 2.5, 3.2)
        sp.rotation_euler = (dx * 4, dy * 4, dx * 2)
        sp.keyframe_insert(data_path="location", frame=duration_frames)
        sp.keyframe_insert(data_path="rotation_euler", frame=duration_frames)
        
    # Camera looking at crown block from slight low angle
    bpy.ops.object.camera_add(location=(0, -2.4, -0.6))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(75), 0, 0)
    cam.data.lens = 45
    bpy.context.scene.camera = cam

def build_shot_9(duration_frames):
    """Shot 09: 10-Story Gusher 9-Day Sky (1-235 frames, 9.79s)"""
    setup_lighting_and_world(bpy.context.scene, "daylight")
    build_prairie_ground()
    build_shack()
    build_clouds()
    build_timber_derrick(height=9.2)
    
    # Massive 100ft Crude Oil Geyser
    mat_crude = create_crude_oil_material()
    
    # Central roaring column
    bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=28.0, location=(0, 1.5, 14.0))
    gusher = bpy.context.active_object
    gusher.data.materials.append(mat_crude)
    
    # Surrounding billowing spray mist
    mat_mist = create_pbr_material("Mat_OilMist", (0.02, 0.02, 0.03), roughness=0.8, specular=0.4)
    bpy.ops.mesh.primitive_cone_add(radius1=1.8, radius2=0.4, depth=26.0, location=(0, 1.5, 13.0))
    cone = bpy.context.active_object
    cone.data.materials.append(mat_mist)
    
    # Animate geyser turbulence
    for f in range(1, duration_frames + 1, 12):
        sway_x = math.sin(f * 0.12) * 0.35
        sway_y = 1.5 + math.cos(f * 0.08) * 0.25
        gusher.scale = (1.0 + math.sin(f*0.2)*0.15, 1.0 + math.cos(f*0.2)*0.15, 1.0)
        gusher.location.x = sway_x
        gusher.location.y = sway_y
        gusher.keyframe_insert(data_path="scale", frame=f)
        gusher.keyframe_insert(data_path="location", frame=f)
        
    # Camera panning up to follow the towering gusher
    bpy.ops.object.camera_add(location=(0, -22.0, 3.5))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(82), 0, 0)
    cam.data.lens = 38
    bpy.context.scene.camera = cam
    
    cam.location = (0, -22.0, 3.5)
    cam.rotation_euler = (math.radians(82), 0, 0)
    cam.keyframe_insert(data_path="location", frame=1)
    cam.keyframe_insert(data_path="rotation_euler", frame=1)
    
    cam.location = (0, -18.0, 10.5)
    cam.rotation_euler = (math.radians(70), 0, 0)
    cam.keyframe_insert(data_path="location", frame=duration_frames)
    cam.keyframe_insert(data_path="rotation_euler", frame=duration_frames)

def build_shot_10(duration_frames):
    """Shot 10: Deep Strata Plunge (1-21 frames, 0.88s)"""
    setup_lighting_and_world(bpy.context.scene, "cutaway_studio")
    build_cutaway_block(height=16.0)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=16.0, location=(0, 0.05, -8.0))
    bore = bpy.context.active_object
    bore.data.materials.append(create_pbr_material("Mat_PlungeShaft", (0.12, 0.10, 0.08), roughness=0.9))
    
    # Rapid camera plunge down
    bpy.ops.object.camera_add(location=(0, -5.5, 0.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 45
    bpy.context.scene.camera = cam
    
    cam.location.z = 0.0
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = -10.5
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

def build_shot_11(duration_frames):
    """Shot 11: Underground Reservoir Myth (1-24 frames, 1.00s)"""
    setup_lighting_and_world(bpy.context.scene, "underground_dark")
    
    # Dark rock subterranean cavern
    mat_rock = create_pbr_material("Mat_MythCavern", (0.16, 0.16, 0.18), roughness=0.95)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    cavern = bpy.context.active_object
    cavern.scale = (12.0, 4.0, 8.0)
    cavern.data.materials.append(mat_rock)
    
    # Underground lake / pool of crude oil
    mat_crude = create_crude_oil_material()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.2, -1.8))
    lake = bpy.context.active_object
    lake.scale = (8.5, 3.0, 1.8)
    lake.data.materials.append(mat_crude)
    
    # Stylized vertical straw/pipe dipping into the lake
    mat_straw = create_pbr_material("Mat_MythStraw", (0.85, 0.85, 0.85), roughness=0.3, metallic=0.9)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=5.5, location=(0, -0.4, 0.5))
    straw = bpy.context.active_object
    straw.data.materials.append(mat_straw)
    
    # Red "NO / MYTH" cross
    mat_red = create_pbr_material("Mat_RedCross", (0.95, 0.05, 0.05), roughness=0.2, emission=(0.95, 0.05, 0.05))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.8, 0.2))
    b1 = bpy.context.active_object
    b1.scale = (2.2, 0.08, 0.22)
    b1.rotation_euler = (0, math.radians(45), 0)
    b1.data.materials.append(mat_red)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.8, 0.2))
    b2 = bpy.context.active_object
    b2.scale = (2.2, 0.08, 0.22)
    b2.rotation_euler = (0, math.radians(-45), 0)
    b2.data.materials.append(mat_red)
    
    bpy.ops.object.camera_add(location=(0, -6.5, 0.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 45
    bpy.context.scene.camera = cam

def build_shot_12(duration_frames):
    """Shot 12: Macro Pores Zoom (1-13 frames, 0.54s)"""
    setup_lighting_and_world(bpy.context.scene, "underground_dark")
    
    # Porous sandstone face
    mat_sandstone = create_pbr_material("Mat_ZoomSandstone", (0.62, 0.50, 0.36), roughness=0.95)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    wall = bpy.context.active_object
    wall.scale = (6.0, 2.0, 6.0)
    wall.data.materials.append(mat_sandstone)
    
    # Rapid camera optical zoom into rock matrix
    bpy.ops.object.camera_add(location=(0, -4.5, 0.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 40
    bpy.context.scene.camera = cam
    
    cam.location.y = -4.5
    cam.keyframe_insert(data_path="location", index=1, frame=1)
    cam.location.y = -1.5
    cam.keyframe_insert(data_path="location", index=1, frame=duration_frames)

def build_shot_13(duration_frames):
    """Shot 13: Micro Rock Sponge Pebbles (1-148 frames, 6.17s)"""
    setup_lighting_and_world(bpy.context.scene, "micro_studio")
    
    mat_pebble_pale = create_pbr_material("Mat_PebblePale", (0.88, 0.85, 0.78), roughness=0.22, specular=0.75)
    mat_pebble_warm = create_pbr_material("Mat_PebbleWarm", (0.80, 0.72, 0.58), roughness=0.25, specular=0.70)
    mat_pebble_gold = create_pbr_material("Mat_PebbleGold", (0.72, 0.60, 0.44), roughness=0.28, specular=0.65)
    mat_crude = create_crude_oil_material()
    
    # Back plane
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0, 0.5, 0))
    bg = bpy.context.active_object
    bg.rotation_euler = (math.radians(90), 0, 0)
    bg.data.materials.append(mat_crude)
    
    # Detailed 3D cluster of microscopic quartz pebbles
    pebble_coords = [
        ( 0.0,  0.1,  0.68, 0.62, mat_pebble_pale),
        (-0.95, 0.3,  0.55, 0.52, mat_pebble_warm),
        ( 0.88, 0.2,  0.60, 0.56, mat_pebble_gold),
        (-0.65, 0.0, -0.82, 0.55, mat_pebble_pale),
        ( 0.68, 0.1, -0.75, 0.58, mat_pebble_warm),
        ( 0.0,  0.2, -1.65, 0.48, mat_pebble_gold),
        (-1.25, 0.3, -1.45, 0.45, mat_pebble_pale),
        ( 1.25, 0.2, -1.35, 0.46, mat_pebble_warm),
        (-0.15, 0.1,  1.35, 0.50, mat_pebble_warm),
        ( 1.15, 0.3,  1.42, 0.44, mat_pebble_pale),
        (-1.15, 0.2,  1.25, 0.42, mat_pebble_gold),
        (-1.50, 0.1, -0.15, 0.44, mat_pebble_pale),
        ( 1.50, 0.2, -0.08, 0.46, mat_pebble_gold),
    ]
    for px, py, pz, pr, pmat in pebble_coords:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=pr, location=(px, py, pz))
        peb = bpy.context.active_object
        peb.scale = (1.12, 0.75, 1.20)
        peb.data.materials.append(pmat)
        
    # Trapped crude oil beads in pore throats
    oil_beads = [
        (-0.42, -0.15,  0.28, 0.26),
        ( 0.44, -0.12,  0.30, 0.28),
        ( 0.0,  -0.10, -0.88, 0.24),
        (-0.75, -0.15, -1.15, 0.22),
        ( 0.78, -0.12, -1.05, 0.23),
        ( 0.0,  -0.10,  0.78, 0.25),
        (-1.0,  -0.12,  0.12, 0.24),
        ( 1.0,  -0.14,  0.18, 0.25),
    ]
    for ox, oy, oz, orad in oil_beads:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=orad, location=(ox, oy, oz))
        bead = bpy.context.active_object
        bead.scale = (1.35, 0.55, 1.15)
        bead.data.materials.append(mat_crude)
        
    bpy.ops.object.camera_add(location=(0, -3.2, 0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 55
    bpy.context.scene.camera = cam

def build_shot_14(duration_frames):
    """Shot 14: Casing Pipe Travel Up (1-17 frames, 0.71s)"""
    setup_lighting_and_world(bpy.context.scene, "cutaway_studio")
    build_cutaway_block(height=8.0)
    
    # Steel Casing Pipe with perforations
    mat_casing = create_pbr_material("Mat_PerforatedCasing", (0.48, 0.50, 0.54), roughness=0.25, metallic=0.95)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=8.0, location=(0, 0.05, -4.0))
    casing = bpy.context.active_object
    casing.data.materials.append(mat_casing)
    
    # Crude oil streaming up inside casing
    mat_crude = create_crude_oil_material()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.38, depth=8.0, location=(0, 0.05, -4.0))
    fluid = bpy.context.active_object
    fluid.data.materials.append(mat_crude)
    
    # Camera dollying upward following fluid rush
    bpy.ops.object.camera_add(location=(0, -3.8, -6.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 45
    bpy.context.scene.camera = cam
    
    cam.location.z = -6.0
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = -2.0
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

def build_shot_15(duration_frames):
    """Shot 15: Cellar BOP Hydraulic Clamp (1-441 frames, 18.38s)"""
    setup_lighting_and_world(bpy.context.scene, "daylight")
    build_prairie_ground()
    build_cutaway_block(height=6.0)
    build_timber_derrick(height=9.2)
    
    # Timber plank cellar dugout
    mat_planks = create_pbr_material("Mat_CellarPlanks", (0.34, 0.25, 0.16), roughness=0.85)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.4, -0.6))
    back = bpy.context.active_object
    back.scale = (3.4, 0.15, 3.2)
    back.data.materials.append(mat_planks)
    
    for wx, sign in [(-1.7, -1), (1.7, 1)]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(wx, 0.6, -0.6))
        wall = bpy.context.active_object
        wall.scale = (0.15, 1.6, 3.2)
        wall.data.materials.append(mat_planks)
        
    # Massive Green Blowout Preventer (BOP) Stack
    mat_bop = create_pbr_material("Mat_BOP_IndustrialGreen", (0.08, 0.24, 0.12), roughness=0.35, metallic=0.75)
    mat_pipe = create_pbr_material("Mat_BOP_Pipe", (0.48, 0.50, 0.54), roughness=0.25, metallic=0.95)
    mat_ram = create_pbr_material("Mat_BOP_SteelRam", (0.75, 0.78, 0.82), roughness=0.2, metallic=0.98)
    
    # Vertical BOP main spool flanges
    for fz in [0.8, -0.1, -1.0]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=0.26, location=(0, 0.7, fz))
        flange = bpy.context.active_object
        flange.data.materials.append(mat_bop)
        
    # Central drill pipe passing through BOP
    bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=5.5, location=(0, 0.7, -0.5))
    drill_pipe = bpy.context.active_object
    drill_pipe.data.materials.append(mat_pipe)
    
    # Hydraulic Ram Actuator Blocks (Left and Right)
    rams = []
    for side_x, sign in [(-1.4, -1), (1.4, 1)]:
        # Hydraulic cylinder housing
        bpy.ops.mesh.primitive_cylinder_add(radius=0.36, depth=1.5, location=(side_x, 0.7, -0.1))
        cyl = bpy.context.active_object
        cyl.rotation_euler = (0, math.radians(90), 0)
        cyl.data.materials.append(mat_bop)
        
        # Ram block clamping inward
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side_x * 0.6, 0.7, -0.1))
        ram = bpy.context.active_object
        ram.scale = (0.55, 0.50, 0.45)
        ram.data.materials.append(mat_ram)
        rams.append((ram, sign))
        
    # Clamping animation: rams slam shut around pipe at frame 120
    close_start = int(duration_frames * 0.22)
    close_end = int(duration_frames * 0.40)
    for ram, sign in rams:
        ram.location.x = sign * 0.85
        ram.keyframe_insert(data_path="location", index=0, frame=1)
        ram.location.x = sign * 0.85
        ram.keyframe_insert(data_path="location", index=0, frame=close_start)
        ram.location.x = sign * 0.28 # Closed tightly against pipe
        ram.keyframe_insert(data_path="location", index=0, frame=close_end)
        ram.location.x = sign * 0.28
        ram.keyframe_insert(data_path="location", index=0, frame=duration_frames)
        
    # Camera framing the cellar and zooming in as rams close
    bpy.ops.object.camera_add(location=(0, -5.2, -0.5))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 45
    bpy.context.scene.camera = cam
    
    cam.location.y = -5.2
    cam.keyframe_insert(data_path="location", index=1, frame=1)
    cam.location.y = -3.8
    cam.keyframe_insert(data_path="location", index=1, frame=close_end)
    cam.location.y = -3.6
    cam.keyframe_insert(data_path="location", index=1, frame=duration_frames)

def build_shot_16(duration_frames):
    """Shot 16: Walking Beam Pump Jack (1-389 frames, 16.21s)"""
    setup_lighting_and_world(bpy.context.scene, "daylight")
    build_prairie_ground()
    build_shack()
    build_clouds()
    
    mat_green = create_pbr_material("Mat_PumpjackGreen", (0.10, 0.26, 0.14), roughness=0.45, metallic=0.4)
    mat_iron = create_pbr_material("Mat_CastIron", (0.16, 0.17, 0.18), roughness=0.55, metallic=0.85)
    mat_steel = create_pbr_material("Mat_PolishedSteel", (0.75, 0.78, 0.82), roughness=0.15, metallic=0.98)
    mat_concrete = create_pbr_material("Mat_ConcretePad", (0.65, 0.65, 0.62), roughness=0.9)
    
    # Concrete foundation pad
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.5, 0.8, 0.15))
    pad = bpy.context.active_object
    pad.scale = (8.5, 3.2, 0.3)
    pad.data.materials.append(mat_concrete)
    
    # Sampson Post A-Frame
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=4.6, location=(-1.8, 0.8, 2.3))
    leg1 = bpy.context.active_object
    leg1.rotation_euler = (0, math.radians(-16), 0)
    leg1.data.materials.append(mat_green)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=4.6, location=(0.6, 0.8, 2.3))
    leg2 = bpy.context.active_object
    leg2.rotation_euler = (0, math.radians(16), 0)
    leg2.data.materials.append(mat_green)
    
    # BeamPivot Empty at top of Sampson post
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(-0.6, 0.8, 4.4))
    pivot = bpy.context.active_object
    pivot.name = "BeamPivot"
    
    # Walking Beam attached to pivot
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    beam = bpy.context.active_object
    beam.scale = (6.6, 0.36, 0.48)
    beam.parent = pivot
    beam.data.materials.append(mat_green)
    
    # Horsehead cylinder & curved arc
    bpy.ops.mesh.primitive_cylinder_add(radius=1.35, depth=0.38, location=(-3.3, 0, 0.3))
    horsehead = bpy.context.active_object
    horsehead.rotation_euler = (math.radians(90), 0, 0)
    horsehead.scale = (0.7, 1.4, 1.0)
    horsehead.parent = pivot
    horsehead.data.materials.append(mat_iron)
    
    # Polished sucker rod
    bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=4.8, location=(-4.15, 0.8, 1.8))
    rod = bpy.context.active_object
    rod.data.materials.append(mat_steel)
    
    # Stuffing box & wellhead tee
    bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=0.7, location=(-4.15, 0.8, 0.35))
    tee = bpy.context.active_object
    tee.data.materials.append(mat_iron)
    
    # Crank shaft & rotating counterweights
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(2.2, 0.8, 1.4))
    crank_pivot = bpy.context.active_object
    crank_pivot.name = "CrankPivot"
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    weights = bpy.context.active_object
    weights.scale = (0.6, 0.45, 1.6)
    weights.parent = crank_pivot
    weights.data.materials.append(mat_iron)
    
    # Animate walking beam oscillation & sucker rod reciprocation
    cycle_frames = 48 # ~2.0s per complete pumping stroke (12 strokes/min)
    total_strokes = int(math.ceil(duration_frames / cycle_frames)) + 1
    
    for f in range(1, duration_frames + 1):
        phase = (f / cycle_frames) * 2 * math.pi
        angle = math.sin(phase) * math.radians(13) # +/- 13 degree oscillation
        pivot.rotation_euler.y = angle
        pivot.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
        rod.location.z = 1.8 + math.sin(phase) * 0.72 # Up and down pumping
        rod.keyframe_insert(data_path="location", index=2, frame=f)
        
        crank_pivot.rotation_euler.y = phase
        crank_pivot.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
    # Camera framing walking beam pumpjack at 3/4 isometric perspective
    bpy.ops.object.camera_add(location=(5.8, -12.5, 3.2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(78), 0, math.radians(24))
    cam.data.lens = 42
    bpy.context.scene.camera = cam

# =============================================================================
# MAIN DISPATCHER
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
    print(f"Building Shot {shot_idx:02d} ({total_frames} frames @ {fps} fps)...")
    builder(total_frames)
    
    print(f"Rendering Shot {shot_idx:02d} to {output_path}...")
    bpy.ops.render.render(animation=True)
    print(f"Shot {shot_idx:02d} render completed successfully.")

if __name__ == "__main__":
    main()
