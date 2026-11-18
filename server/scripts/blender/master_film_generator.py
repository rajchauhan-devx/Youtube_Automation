#!/usr/bin/env python3
"""
Master 3D Film Generator for Blender 5.3+
Faithfully reproduces "Mildly Elsewhere" Texas Oil Drilling & Pump Jack Explainer.

Generates 5 dedicated cinematographic segments:
- Segment 1: Drilling, Caving In & Mud Pressure (0.0s - 18.6s, frames 1-447)
- Segment 2: 1000ft Blowout, Flying Pipe & 9-Day Gusher (18.6s - 30.75s, frames 448-738)
- Segment 3: Microscopic Porous Rock Sponge (30.75s - 40.0s, frames 739-960)
- Segment 4: BOP Cellar Hydraulic Ram Clamp (40.0s - 58.4s, frames 961-1402)
- Segment 5: Walking Beam Pump Jack Kinematics (58.4s - 74.58s, frames 1403-1790)
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
            
    parser = argparse.ArgumentParser(description="Master 3D Film Generator")
    parser.add_argument("--segment", type=str, default="segment5_pumpjack",
                        choices=["segment1_drill", "segment2_blowout", "segment3_sponge", "segment4_bop", "segment5_pumpjack", "all"])
    parser.add_argument("--duration", type=float, default=5.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--output_path", type=str, required=True)
    parser.add_argument("--samples", type=int, default=8)
    return vars(parser.parse_args(raw_args))

# =============================================================================
# SCENE CONFIGURATION
# =============================================================================

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_render_engine(scene, fps, duration_sec, output_path, samples=8):
    scene.render.resolution_x = 720
    scene.render.resolution_y = 1280
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    
    total_frames = max(1, int(round(fps * duration_sec)))
    scene.frame_start = 1
    scene.frame_end = total_frames
    
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
# MATERIALS & SHADERS
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

def create_rich_strata_material():
    """
    Rich geological sedimentary strata matching Mildly Elsewhere:
    Cream weathered sandstone, thin brown clay seam, pale limestone,
    rich terracotta red shale, slate blue-gray shale, golden sand, dark crude rock.
    """
    mat = bpy.data.materials.new(name="Mat_RichStrata")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    
    sep = nodes.new('ShaderNodeSeparateXYZ')
    
    # Organic noise wave distortion
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0
    noise.inputs['Detail'].default_value = 3.0
    
    add = nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    
    mult = nodes.new('ShaderNodeMath')
    mult.operation = 'MULTIPLY'
    mult.inputs[1].default_value = 0.04
    
    ramp = nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'LINEAR'
    
    # Colors calibrated directly from video frames
    cr.elements[0].position = 0.00
    cr.elements[0].color = (0.12, 0.10, 0.08, 1.0) # Dark oil-saturated base
    
    cr.elements[1].position = 0.98
    cr.elements[1].color = (0.84, 0.76, 0.64, 1.0) # #ccb89d Pale cream sandstone
    
    e1 = cr.elements.new(0.15)
    e1.color = (0.76, 0.68, 0.58, 1.0) # Chalk limestone
    
    e2 = cr.elements.new(0.28)
    e2.color = (0.68, 0.38, 0.26, 1.0) # #b26e5b Terracotta red clay
    
    e3 = cr.elements.new(0.40)
    e3.color = (0.35, 0.12, 0.02, 1.0) # #5c1c00 Dark terracotta band
    
    e4 = cr.elements.new(0.55)
    e4.color = (0.50, 0.54, 0.58, 1.0) # #848f95 Slate blue-gray shale
    
    e5 = cr.elements.new(0.70)
    e5.color = (0.78, 0.62, 0.44, 1.0) # Golden sandstone
    
    e6 = cr.elements.new(0.85)
    e6.color = (0.88, 0.82, 0.72, 1.0) # Light sandstone
    
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.3
    bump.inputs['Distance'].default_value = 0.1
    
    links.new(tex.outputs['Generated'], sep.inputs['Vector'])
    links.new(tex.outputs['Generated'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], mult.inputs[0])
    links.new(sep.outputs['Z'], add.inputs[0])
    links.new(mult.outputs['Value'], add.inputs[1])
    links.new(add.outputs['Value'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    
    bsdf.inputs['Roughness'].default_value = 0.85
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_crude_oil_material():
    return create_pbr_material("Mat_CrudeOilPBR", (0.006, 0.006, 0.010), roughness=0.03, metallic=0.15, specular=0.98)

# =============================================================================
# ENVIRONMENT & SCENERY
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
        bg.inputs['Color'].default_value = (0.02, 0.03, 0.07, 1.0)
        bg.inputs['Strength'].default_value = 0.35
    else:
        bg.inputs['Color'].default_value = (0.13, 0.56, 0.78, 1.0) # Texas sky
        bg.inputs['Strength'].default_value = 1.0
        
    out = nodes.new('ShaderNodeOutputWorld')
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    
    bpy.ops.object.light_add(type='SUN', location=(12.0, -16.0, 18.0))
    sun = bpy.context.active_object
    sun.name = "Sun_Key"
    sun.data.energy = 4.2 if not is_night else 0.4
    sun.data.color = (1.0, 0.96, 0.90) if not is_night else (0.55, 0.70, 0.95)
    sun.rotation_euler = (math.radians(55), math.radians(15), math.radians(-30))
    
    bpy.ops.object.light_add(type='SUN', location=(-9.0, -12.0, 10.0))
    fill = bpy.context.active_object
    fill.name = "Sun_Fill"
    fill.data.energy = 1.8 if not is_night else 0.2
    fill.data.color = (0.65, 0.82, 1.0)
    fill.rotation_euler = (math.radians(70), math.radians(-12), math.radians(20))

def build_environment_props():
    # Texas Prairie Ground
    mat_grass = create_pbr_material("Mat_TexasPrairie", (0.64, 0.58, 0.35), roughness=0.92)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 8.0, 0.05))
    ground = bpy.context.active_object
    ground.scale = (32.0, 16.0, 0.1)
    ground.data.materials.append(mat_grass)
    
    # Wooden Shack on the left
    mat_shack = create_pbr_material("Mat_WeatheredShack", (0.35, 0.28, 0.22), roughness=0.85)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-6.5, 4.5, 1.1))
    shack = bpy.context.active_object
    shack.scale = (2.6, 2.2, 2.0)
    shack.data.materials.append(mat_shack)
    
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
    
    # Distant trees
    mat_trees = create_pbr_material("Mat_MesquiteTree", (0.18, 0.28, 0.14), roughness=0.95)
    for tx in [-14, -11, -8.5, -3.5, 2.0, 5.5, 10.5, 13.5]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.75, location=(tx, 14.0, 0.6))
        tree = bpy.context.active_object
        tree.scale = (1.2, 0.8, 0.8)
        tree.data.materials.append(mat_trees)
        
    # Fluffy cumulus clouds
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

def build_geological_cutaway():
    """Underground rock cutaway block with front face at Y=0"""
    mat_strata = create_rich_strata_material()
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 4.0, -4.5))
    rock = bpy.context.active_object
    rock.name = "Geological_CrossSection"
    rock.scale = (16.0, 8.0, 9.0)
    rock.data.materials.append(mat_strata)

def build_timber_derrick():
    """Authentic timber oil derrick with 4 legs, cross-girts and crown"""
    mat_timber = create_pbr_material("Mat_DerrickTimber", (0.42, 0.35, 0.28), roughness=0.7, metallic=0.2)
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
        
    for z in [1.8, 3.6, 5.4, 7.2, 8.8]:
        t = z / height
        w = base_w * (1 - t) + top_w * t
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.5, z))
        beam = bpy.context.active_object
        beam.scale = (w * 2, w * 1.8, 0.06)
        beam.data.materials.append(mat_timber)
        
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.5, height + 0.1))
    crown = bpy.context.active_object
    crown.scale = (1.1, 1.1, 0.15)
    crown.data.materials.append(create_pbr_material("Mat_CrownSteel", (0.25, 0.27, 0.30), roughness=0.3, metallic=0.9))

# =============================================================================
# SEGMENT 1: DRILLING & MUD (0.0s - 18.6s)
# =============================================================================

def build_segment1_drill(duration_frames):
    build_environment_props()
    build_geological_cutaway()
    build_timber_derrick()
    
    # Borehole channel
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=9.0, location=(0, 0.05, -4.5))
    bore = bpy.context.active_object
    bore.data.materials.append(create_pbr_material("Mat_BoreShaft", (0.16, 0.13, 0.10), roughness=0.95))
    
    # Central drill pipe
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=14.0, location=(0, 0.05, 2.5))
    pipe = bpy.context.active_object
    mat_steel = create_pbr_material("Mat_PipeSteel", (0.45, 0.48, 0.52), roughness=0.25, metallic=0.95)
    pipe.data.materials.append(mat_steel)
    
    # Tri-cone drill bit
    bpy.ops.mesh.primitive_cone_add(radius1=0.38, depth=0.75, location=(0, 0.05, -4.2))
    bit = bpy.context.active_object
    bit.parent = pipe
    bit.data.materials.append(create_pbr_material("Mat_TungstenBit", (0.22, 0.24, 0.27), roughness=0.3, metallic=0.98))
    
    # Drilling mud column
    bpy.ops.mesh.primitive_cylinder_add(radius=0.42, depth=9.0, location=(0, 0.05, -4.5))
    mud = bpy.context.active_object
    mud.data.materials.append(create_pbr_material("Mat_DrillingMud", (0.34, 0.22, 0.14), roughness=0.28, specular=0.8))
    
    # Pipe descent & rotation animation
    pipe.location.z = 2.5
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = -3.5
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    pipe.rotation_euler.z = 0
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    pipe.rotation_euler.z = math.radians(360 * 16)
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=duration_frames)
    
    # Pressure arrows
    mat_arrow = create_pbr_material("Mat_Arrow", (1.0, 1.0, 1.0), roughness=0.2, specular=0.9)
    for az in [-2.0, -4.0, -6.0]:
        for direction, ax in [(-1, -0.65), (1, 0.65)]:
            bpy.ops.mesh.primitive_cone_add(radius1=0.07, depth=0.20, location=(ax, -0.05, az))
            arr = bpy.context.active_object
            arr.rotation_euler = (0, math.radians(90 * direction), 0)
            arr.data.materials.append(mat_arrow)
            
    # Camera with vertical tilt
    bpy.ops.object.camera_add(location=(0, -17.5, 0.2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(88), 0, 0)
    cam.data.lens = 40
    bpy.context.scene.camera = cam

# =============================================================================
# SEGMENT 2: BLOWOUT & 9-DAY GUSHER (18.6s - 30.75s)
# =============================================================================

def build_segment2_blowout(duration_frames):
    build_environment_props()
    build_geological_cutaway()
    build_timber_derrick()
    
    mat_steel = create_pbr_material("Mat_EjectedSteel", (0.50, 0.52, 0.56), roughness=0.25, metallic=0.95)
    mat_crude = create_crude_oil_material()
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=14.0, location=(0, 0.05, 0.0))
    pipe = bpy.context.active_object
    pipe.data.materials.append(mat_steel)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=7.0, location=(0, 0.05, 7.0))
    broken = bpy.context.active_object
    broken.data.materials.append(mat_steel)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=28.0, location=(0, 0.05, 4.0))
    gusher = bpy.context.active_object
    gusher.data.materials.append(mat_crude)
    
    blast = int(duration_frames * 0.15)
    
    pipe.location.z = 0.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 0.0
    pipe.keyframe_insert(data_path="location", index=2, frame=blast)
    pipe.location.z = 38.0
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    broken.location = (0, 0.05, 2.0)
    broken.rotation_euler = (0, 0, 0)
    broken.keyframe_insert(data_path="location", frame=blast)
    broken.keyframe_insert(data_path="rotation_euler", frame=blast)
    broken.location = (5.5, 1.2, 18.0)
    broken.rotation_euler = (math.radians(75), math.radians(60), math.radians(140))
    broken.keyframe_insert(data_path="location", frame=duration_frames)
    broken.keyframe_insert(data_path="rotation_euler", frame=duration_frames)
    
    gusher.scale = (0.05, 0.05, 0.05)
    gusher.location.z = -7.0
    gusher.keyframe_insert(data_path="scale", frame=1)
    gusher.keyframe_insert(data_path="location", frame=1)
    gusher.scale = (0.05, 0.05, 0.05)
    gusher.location.z = -7.0
    gusher.keyframe_insert(data_path="scale", frame=blast)
    gusher.keyframe_insert(data_path="location", frame=blast)
    gusher.scale = (1.6, 1.6, 1.4)
    gusher.location.z = 11.0
    gusher.keyframe_insert(data_path="scale", frame=duration_frames)
    gusher.keyframe_insert(data_path="location", frame=duration_frames)
    
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
# SEGMENT 3: MICROSCOPIC ROCK SPONGE (30.75s - 40.0s)
# =============================================================================

def build_segment3_sponge(duration_frames):
    mat_pebble_pale = create_pbr_material("Mat_PebblePale", (0.91, 0.89, 0.83), roughness=0.20, specular=0.75)
    mat_pebble_warm = create_pbr_material("Mat_PebbleWarm", (0.83, 0.77, 0.65), roughness=0.22, specular=0.70)
    mat_pebble_gold = create_pbr_material("Mat_PebbleGold", (0.75, 0.64, 0.48), roughness=0.25, specular=0.65)
    mat_crude = create_crude_oil_material()
    
    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(0, 0.4, 0))
    bg_oil = bpy.context.active_object
    bg_oil.rotation_euler = (math.radians(90), 0, 0)
    bg_oil.data.materials.append(mat_crude)
    
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
        
    bpy.ops.object.light_add(type='POINT', location=(1.5, -2.2, 1.2))
    l1 = bpy.context.active_object
    l1.data.energy = 140.0
    l1.data.color = (1.0, 0.98, 0.95)
    
    bpy.ops.object.light_add(type='POINT', location=(-1.5, -2.2, -1.2))
    l2 = bpy.context.active_object
    l2.data.energy = 80.0
    l2.data.color = (0.85, 0.92, 1.0)
    
    bpy.ops.object.camera_add(location=(0, -3.4, 0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 55
    bpy.context.scene.camera = cam

# =============================================================================
# SEGMENT 4: BOP HYDRAULIC RAMS (40.0s - 58.4s)
# =============================================================================

def build_segment4_bop(duration_frames):
    build_environment_props()
    build_geological_cutaway()
    build_timber_derrick()
    
    mat_planks = create_pbr_material("Mat_CellarPlanks", (0.38, 0.28, 0.18), roughness=0.82)
    
    # Cellar dugout walls
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
    
    # BOP stack
    mat_bop = create_pbr_material("Mat_BOP_Green", (0.12, 0.30, 0.18), roughness=0.35, metallic=0.75)
    for fz in [0.85, -0.1, -1.05]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=0.28, location=(0, 0.7, fz))
        flange = bpy.context.active_object
        flange.data.materials.append(mat_bop)
        
    bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=5.5, location=(0, 0.7, -0.5))
    pipe = bpy.context.active_object
    pipe.data.materials.append(create_pbr_material("Mat_SteelCasing", (0.46, 0.48, 0.50), roughness=0.4, metallic=0.9))
    
    # Rams
    mat_ram = create_pbr_material("Mat_PolishedSteelRam", (0.86, 0.88, 0.92), roughness=0.12, metallic=0.98)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.3, 0.7, -0.1))
    ram_l = bpy.context.active_object
    ram_l.scale = (0.8, 0.5, 0.45)
    ram_l.data.materials.append(mat_ram)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(1.3, 0.7, -0.1))
    ram_r = bpy.context.active_object
    ram_r.scale = (0.8, 0.5, 0.45)
    ram_r.data.materials.append(mat_ram)
    
    # Red valve wheel
    bpy.ops.mesh.primitive_torus_add(major_radius=0.24, minor_radius=0.05, location=(1.3, 0.35, -0.85))
    wheel = bpy.context.active_object
    wheel.rotation_euler = (math.radians(90), 0, 0)
    wheel.data.materials.append(create_pbr_material("Mat_RedWheel", (0.85, 0.12, 0.10), roughness=0.3, metallic=0.6))
    
    shut_frame = int(duration_frames * 0.60)
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
    
    bpy.ops.object.camera_add(location=(0, -5.8, -0.4))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(88), 0, 0)
    cam.data.lens = 48
    bpy.context.scene.camera = cam

# =============================================================================
# SEGMENT 5: WALKING BEAM PUMP JACK (58.4s - 74.58s)
# =============================================================================

def build_segment5_pumpjack(duration_frames):
    build_environment_props()
    build_geological_cutaway()
    
    # Background derrick
    mat_derrick_bg = create_pbr_material("Mat_DerrickBG", (0.38, 0.32, 0.25), roughness=0.75, metallic=0.2)
    for dx, dy in [(-0.8, 4.5), (0.8, 4.5), (0.8, 6.2), (-0.8, 6.2)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=9.0, location=(dx, dy, 4.5))
        dleg = bpy.context.active_object
        dleg.data.materials.append(mat_derrick_bg)
        
    mat_steel = create_pbr_material("Mat_PumpSteel", (0.24, 0.27, 0.30), roughness=0.35, metallic=0.88)
    mat_orange = create_pbr_material("Mat_PumpOrange", (0.76, 0.32, 0.15), roughness=0.42, metallic=0.35)
    
    # Slab
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.2, 0.8, 0.15))
    slab = bpy.context.active_object
    slab.scale = (9.0, 3.8, 0.3)
    slab.data.materials.append(create_pbr_material("Mat_ConcreteSlab", (0.72, 0.70, 0.67), roughness=0.85))
    
    # Samson Post
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
        
    for sz in [1.5, 2.8]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.8, 0.8, sz))
        sbar = bpy.context.active_object
        sbar.scale = (1.2, 1.4, 0.06)
        sbar.data.materials.append(mat_steel)
        
    # Walking Beam Pivot Root
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(-0.6, 0.8, 4.4))
    beam_pivot = bpy.context.active_object
    beam_pivot.name = "BeamPivot"
    
    # Beam
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    beam = bpy.context.active_object
    beam.scale = (6.6, 0.36, 0.48)
    beam.parent = beam_pivot
    beam.data.materials.append(mat_steel)
    
    # Horsehead (offset from pivot: X = +3.0)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=0.32, location=(3.0, 0, 0))
    horsehead = bpy.context.active_object
    horsehead.scale = (0.72, 1.0, 1.45)
    horsehead.rotation_euler = (math.radians(90), 0, 0)
    horsehead.parent = beam_pivot
    horsehead.data.materials.append(mat_orange)
    
    # Counterweights (offset from pivot: X = -2.8)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-2.8, 0, 0))
    counterweight = bpy.context.active_object
    counterweight.scale = (1.6, 0.9, 0.95)
    counterweight.parent = beam_pivot
    counterweight.data.materials.append(mat_orange)
    
    # Polished Sucker Rod
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=14.0, location=(2.4, 0.8, -2.5))
    rod = bpy.context.active_object
    rod.data.materials.append(create_pbr_material("Mat_PolishedRod", (0.88, 0.90, 0.94), roughness=0.08, metallic=0.98))
    
    # Wellhead casing
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=8.0, location=(2.4, 0.8, -3.5))
    wellhead = bpy.context.active_object
    wellhead.data.materials.append(mat_steel)
    
    # Bridle cable
    bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=2.0, location=(2.4, 0.8, 3.8))
    bridle = bpy.context.active_object
    bridle.data.materials.append(mat_steel)
    
    # Crank arm
    bpy.ops.mesh.primitive_cylinder_add(radius=0.72, depth=0.28, location=(-2.0, 0.8, 1.6))
    crank = bpy.context.active_object
    crank.rotation_euler = (math.radians(90), 0, 0)
    crank.data.materials.append(mat_orange)
    
    # Pitman rod
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=2.9, location=(-2.0, 0.8, 3.0))
    pitman = bpy.context.active_object
    pitman.data.materials.append(mat_steel)
    
    # Engine
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.5, 0.8, 0.78))
    engine = bpy.context.active_object
    engine.scale = (1.5, 1.1, 0.92)
    engine.data.materials.append(create_pbr_material("Mat_EngineGreen", (0.15, 0.32, 0.18), roughness=0.45, metallic=0.6))
    
    # Flywheel
    bpy.ops.mesh.primitive_cylinder_add(radius=0.88, depth=0.18, location=(-4.5, 1.45, 0.88))
    flywheel = bpy.context.active_object
    flywheel.rotation_euler = (math.radians(90), 0, 0)
    flywheel.data.materials.append(mat_steel)
    
    cycles = max(2, int(round(duration_frames / 36.0)))
    for f in range(1, duration_frames + 1):
        phase = (f / duration_frames) * math.pi * 2 * cycles
        beam_angle = math.sin(phase) * math.radians(14)
        beam_pivot.rotation_euler.y = beam_angle
        beam_pivot.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
        crank.rotation_euler.y = phase
        crank.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
        flywheel.rotation_euler.y = phase * 2.5
        flywheel.keyframe_insert(data_path="rotation_euler", index=1, frame=f)
        
        rod.location.z = -2.5 + math.sin(phase) * 0.48
        rod.keyframe_insert(data_path="location", index=2, frame=f)
        
    bpy.ops.object.camera_add(location=(0.2, -15.5, 0.4))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(86), 0, math.radians(1.5))
    cam.data.lens = 42
    bpy.context.scene.camera = cam

# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def main():
    args = parse_args()
    clean_scene()
    
    scene = bpy.context.scene
    setup_render_engine(scene, args["fps"], args["duration"], args["output_path"], args.get("samples", 8))
    setup_environment(scene)
    
    segment = args.get("segment", "segment5_pumpjack")
    total_frames = scene.frame_end
    
    if segment == "segment1_drill":
        build_segment1_drill(total_frames)
    elif segment == "segment2_blowout":
        build_segment2_blowout(total_frames)
    elif segment == "segment3_sponge":
        build_segment3_sponge(total_frames)
    elif segment == "segment4_bop":
        build_segment4_bop(total_frames)
    elif segment == "segment5_pumpjack":
        build_segment5_pumpjack(total_frames)
        
    print(f"[Master Generator] Rendering '{segment}' ({total_frames} frames, {args['duration']}s)...")
    bpy.ops.render.render(animation=True)
    print(f"[Master Generator] Completed successfully -> {args['output_path']}")

if __name__ == "__main__":
    main()
