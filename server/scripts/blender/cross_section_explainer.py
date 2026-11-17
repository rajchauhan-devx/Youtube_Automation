#!/usr/bin/env python3
"""
Procedural 3D Cross-Section Explainer Engine for Blender 5.3+
Recreates the exact Mildly Elsewhere / Zack D. Films visual style:
- High-fidelity sedimentary rock strata (undulating sandstone, terracotta, limestone, slate shale, dark oil)
- Timber drilling derrick with surface ground & cutaway borehole
- Dynamic blowout geyser with projectile pipe physics & black crude fountain
- Microscopic rock sponge: smooth river pebbles soaked in shiny black crude with specular highlights
- Cellar cutout with cast-iron Blowout Preventer (BOP) & hydraulic clamping jaws
- Complete kinematics walking beam pump jack with Samson post, horsehead, counterweights, and flywheel
"""

import sys
import os
import math
import argparse
import bpy

# =============================================================================
# ARGUMENT PARSING & SCENE INITIALIZATION
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
        except Exception as e:
            print(f"Failed to parse JSON argument: {e}")
            
    parser = argparse.ArgumentParser(description="Procedural 3D Cross-Section Generator")
    parser.add_argument("--action", type=str, default="drill_down",
                        choices=["drill_down", "oil_gusher", "bop_clamp", "pump_jack"])
    parser.add_argument("--duration", type=float, default=10.0, help="Duration in seconds")
    parser.add_argument("--fps", type=int, default=24, help="Frames per second")
    parser.add_argument("--output_path", type=str, required=True, help="Output mp4 path")
    return vars(parser.parse_args(raw_args))

def clean_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_render_settings(scene, fps, duration_sec, output_path):
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    
    total_frames = max(1, int(round(fps * duration_sec)))
    scene.frame_start = 1
    scene.frame_end = total_frames
    
    # Eevee Next rendering engine
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
        scene.eevee.taa_render_samples = 8
        
    # In Blender 5.0+, set media_type = 'VIDEO' before setting 'FFMPEG'
    if hasattr(scene.render.image_settings, 'media_type'):
        scene.render.image_settings.media_type = 'VIDEO'
        
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'MPEG4'
    scene.render.ffmpeg.codec = 'H264'
    scene.render.ffmpeg.constant_rate_factor = 'MEDIUM'
    scene.render.ffmpeg.ffmpeg_preset = 'REALTIME'
    scene.render.filepath = output_path

def setup_environment(scene):
    world = scene.world
    if not world:
        world = bpy.data.worlds.new("ExplainerWorld")
        scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.35, 0.58, 0.88, 1.0) # Texas blue sky
    bg.inputs['Strength'].default_value = 1.05
    out = nodes.new('ShaderNodeOutputWorld')
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    
    # Key Sun: angled from front-top-right to illuminate vertical rock cutaway
    bpy.ops.object.light_add(type='SUN', location=(8.0, -16.0, 14.0))
    sun = bpy.context.active_object
    sun.name = "Key_Sun"
    sun.data.energy = 3.6
    sun.data.color = (1.0, 0.96, 0.90)
    sun.rotation_euler = (math.radians(64), math.radians(14), math.radians(-26))
    
    # Fill Sun: soft blue fill from front-left
    bpy.ops.object.light_add(type='SUN', location=(-7.0, -14.0, 8.0))
    fill = bpy.context.active_object
    fill.name = "Fill_Sun"
    fill.data.energy = 1.8
    fill.data.color = (0.75, 0.85, 1.0)
    fill.rotation_euler = (math.radians(72), math.radians(-10), math.radians(24))

# =============================================================================
# MATERIAL BUILDERS
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
    
    spec_input = bsdf.inputs.get('Specular IOR Level') or bsdf.inputs.get('Specular')
    if spec_input:
        spec_input.default_value = specular
        
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_sedimentary_strata_material():
    """Wavy sedimentary rock strata matching Mildly Elsewhere reference video"""
    mat = bpy.data.materials.new(name="Mat_SedimentaryStrata")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    
    # Wave texture generating stratified geological bands
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Z'
    wave.inputs['Scale'].default_value = 7.5
    wave.inputs['Distortion'].default_value = 2.2
    wave.inputs['Detail'].default_value = 4.5
    wave.inputs['Detail Roughness'].default_value = 0.65
    
    ramp = nodes.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'LINEAR'
    
    # Distinct sedimentary strata layers
    cr.elements[0].position = 0.00
    cr.elements[0].color = (0.88, 0.78, 0.58, 1.0) # Yellow sandstone
    cr.elements[1].position = 0.98
    cr.elements[1].color = (0.92, 0.90, 0.84, 1.0) # Pale limestone
    
    e1 = cr.elements.new(0.18)
    e1.color = (0.68, 0.28, 0.16, 1.0) # Terracotta red clay
    e2 = cr.elements.new(0.36)
    e2.color = (0.95, 0.94, 0.90, 1.0) # Chalk limestone
    e3 = cr.elements.new(0.54)
    e3.color = (0.38, 0.44, 0.52, 1.0) # Slate blue-grey shale
    e4 = cr.elements.new(0.72)
    e4.color = (0.82, 0.56, 0.28, 1.0) # Rich gold sand
    e5 = cr.elements.new(0.88)
    e5.color = (0.12, 0.10, 0.08, 1.0) # Dark oil-soaked sandstone
    
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    
    links.new(tex.outputs['Generated'], wave.inputs['Vector'])
    links.new(wave.outputs['Color'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(wave.outputs['Color'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.85
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_crude_oil_material():
    return create_pbr_material("Mat_CrudeOil", (0.015, 0.015, 0.02), roughness=0.06, metallic=0.25, specular=0.98)

# =============================================================================
# SCENERY & GEOLOGICAL CUTAWAY
# =============================================================================

def build_geological_cutaway(show_borehole_slot=True):
    mat_strata = create_sedimentary_strata_material()
    
    # Main underground rock cutaway block (sliced along Y=0 so front is exposed)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 3.5, -6.5))
    rock = bpy.context.active_object
    rock.name = "Geological_CrossSection"
    rock.scale = (14.0, 7.0, 13.0)
    rock.data.materials.append(mat_strata)
    
    # Surface ground plane
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 7.0, 0.05))
    ground = bpy.context.active_object
    ground.name = "Surface_Ground"
    ground.scale = (22.0, 14.0, 0.1)
    mat_grass = create_pbr_material("Mat_TexasGrass", (0.35, 0.58, 0.22), roughness=0.9)
    ground.data.materials.append(mat_grass)
    
    # Distant horizon props
    mat_trees = create_pbr_material("Mat_DistantTrees", (0.16, 0.30, 0.12), roughness=0.95)
    for x in [-8.0, -5.0, -2.5, 4.0, 7.0, 9.5]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.7, depth=0.8, location=(x, 11.0, 0.45))
        tree = bpy.context.active_object
        tree.data.materials.append(mat_trees)
        
    mat_wood = create_pbr_material("Mat_WoodProps", (0.38, 0.28, 0.18), roughness=0.8)
    bpy.ops.mesh.primitive_cylinder_add(radius=1.1, depth=1.8, location=(7.5, 8.5, 0.9))
    tank = bpy.context.active_object
    tank.data.materials.append(mat_wood)

def build_derrick_tower():
    mat_timber = create_pbr_material("Mat_DerrickTimber", (0.32, 0.24, 0.16), roughness=0.65, metallic=0.3)
    
    # 4 corner timber legs tapering from 2.6m base up to 0.8m at Z=8.5m
    legs_coords = [
        ((-1.3, -0.1, 0.0), (-0.4, 0.8, 8.5)),
        (( 1.3, -0.1, 0.0), ( 0.4, 0.8, 8.5)),
        (( 1.3,  2.5, 0.0), ( 0.4, 1.6, 8.5)),
        ((-1.3,  2.5, 0.0), (-0.4, 1.6, 8.5)),
    ]
    
    for start, end in legs_coords:
        mid_x = (start[0] + end[0]) / 2
        mid_y = (start[1] + end[1]) / 2
        mid_z = (start[2] + end[2]) / 2
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        dz = end[2] - start[2]
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        
        bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=length, location=(mid_x, mid_y, mid_z))
        leg = bpy.context.active_object
        leg.data.materials.append(mat_timber)
        leg.rotation_euler = (math.atan2(dy, dz), -math.atan2(dx, dz), 0)
        
    # Horizontal cross-girts
    for z in [2.2, 4.4, 6.6, 8.4]:
        t = z / 8.5
        w = 1.3 * (1 - t) + 0.4 * t
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.2, z))
        girt = bpy.context.active_object
        girt.scale = (w * 2, w * 1.8, 0.08)
        girt.data.materials.append(mat_timber)
        
    # Top crown block platform
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.2, 8.6))
    crown = bpy.context.active_object
    crown.scale = (1.1, 1.1, 0.15)
    crown.data.materials.append(create_pbr_material("Mat_CrownSteel", (0.22, 0.24, 0.28), roughness=0.3, metallic=0.9))

# =============================================================================
# SCENE 1: ROTARY DRILLING & MUD STABILIZATION
# =============================================================================

def animate_drill_scene(duration_frames):
    build_geological_cutaway()
    build_derrick_tower()
    
    # Cutaway semicircular borehole carved into rock face
    bpy.ops.mesh.primitive_cylinder_add(radius=0.75, depth=13.0, location=(0, 0.35, -6.5))
    borehole = bpy.context.active_object
    mat_bore = create_pbr_material("Mat_BoreholeDark", (0.22, 0.17, 0.13), roughness=0.9)
    borehole.data.materials.append(mat_bore)
    
    # Annular drilling mud column filling open shaft
    bpy.ops.mesh.primitive_cylinder_add(radius=0.72, depth=13.0, location=(0, 0.35, -6.5))
    mud = bpy.context.active_object
    mat_mud = create_pbr_material("Mat_DrillingMud", (0.38, 0.26, 0.16), roughness=0.3, specular=0.8)
    mud.data.materials.append(mat_mud)
    
    # Animate mud column rising up to stabilize
    mud.scale.z = 0.05
    mud.location.z = -12.5
    mud.keyframe_insert(data_path="scale", index=2, frame=1)
    mud.keyframe_insert(data_path="location", index=2, frame=1)
    
    mud.scale.z = 1.0
    mud.location.z = -6.5
    mud.keyframe_insert(data_path="scale", index=2, frame=int(duration_frames * 0.75))
    mud.keyframe_insert(data_path="location", index=2, frame=int(duration_frames * 0.75))
    
    # Central steel drill pipe string
    bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=16.0, location=(0, 0.35, 4.0))
    pipe = bpy.context.active_object
    mat_steel = create_pbr_material("Mat_DrillPipeSteel", (0.55, 0.58, 0.62), roughness=0.2, metallic=0.92)
    pipe.data.materials.append(mat_steel)
    
    # Flared tri-cone roller teeth drill bit
    bpy.ops.mesh.primitive_cone_add(radius1=0.62, depth=0.85, location=(0, 0.35, -4.0))
    bit = bpy.context.active_object
    bit.parent = pipe
    mat_bit = create_pbr_material("Mat_TungstenBit", (0.28, 0.30, 0.34), roughness=0.3, metallic=0.98)
    bit.data.materials.append(mat_bit)
    
    # Animate pipe descent & rapid rotation
    pipe.location.z = 4.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = -5.5
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    pipe.rotation_euler.z = 0
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    pipe.rotation_euler.z = math.radians(360 * 20)
    pipe.keyframe_insert(data_path="rotation_euler", index=2, frame=duration_frames)
    
    # Camera: Orthographic cutaway framing with ground line in upper third
    bpy.ops.object.camera_add(location=(0, -17.0, -2.5))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(88), 0, 0)
    cam.data.lens = 42
    bpy.context.scene.camera = cam

# =============================================================================
# SCENE 2: 1000 FT DEEP BLOWOUT & 10-STORY ERUPTING GUSHER
# =============================================================================

def animate_gusher_scene(duration_frames):
    build_geological_cutaway()
    build_derrick_tower()
    
    # Ejected drill pipe shooting upward through derrick crown
    bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=14.0, location=(0, 1.2, 0.0))
    pipe = bpy.context.active_object
    mat_steel = create_pbr_material("Mat_EjectedSteel", (0.55, 0.58, 0.62), roughness=0.2, metallic=0.95)
    pipe.data.materials.append(mat_steel)
    
    # Towering high-velocity black crude geyser fountain
    bpy.ops.mesh.primitive_cylinder_add(radius=0.9, depth=26.0, location=(0, 1.2, -5.0))
    gusher = bpy.context.active_object
    gusher.data.materials.append(create_crude_oil_material())
    
    # Snapped whipping pipe fragment
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=6.0, location=(0, 1.2, 8.0))
    broken_pipe = bpy.context.active_object
    broken_pipe.data.materials.append(mat_steel)
    
    blast_frame = int(duration_frames * 0.22)
    
    # 1. Pipe shoots through crown
    pipe.location.z = 0.0
    pipe.keyframe_insert(data_path="location", index=2, frame=1)
    pipe.location.z = 0.0
    pipe.keyframe_insert(data_path="location", index=2, frame=blast_frame)
    pipe.location.z = 32.0
    pipe.keyframe_insert(data_path="location", index=2, frame=duration_frames)
    
    # 2. Broken pipe bends and whips outward
    broken_pipe.location = (0, 1.2, -2.0)
    broken_pipe.rotation_euler = (0, 0, 0)
    broken_pipe.keyframe_insert(data_path="location", frame=blast_frame)
    broken_pipe.keyframe_insert(data_path="rotation_euler", frame=blast_frame)
    
    broken_pipe.location = (4.8, -1.0, 16.0)
    broken_pipe.rotation_euler = (math.radians(65), math.radians(45), math.radians(110))
    broken_pipe.keyframe_insert(data_path="location", frame=duration_frames)
    broken_pipe.keyframe_insert(data_path="rotation_euler", frame=duration_frames)
    
    # 3. Gusher expands 10 stories high
    gusher.scale = (0.1, 0.1, 0.05)
    gusher.location.z = -8.0
    gusher.keyframe_insert(data_path="scale", frame=1)
    gusher.keyframe_insert(data_path="location", frame=1)
    
    gusher.scale = (0.1, 0.1, 0.05)
    gusher.location.z = -8.0
    gusher.keyframe_insert(data_path="scale", frame=blast_frame)
    gusher.keyframe_insert(data_path="location", frame=blast_frame)
    
    gusher.scale = (1.4, 1.4, 1.3)
    gusher.location.z = 10.0
    gusher.keyframe_insert(data_path="scale", frame=duration_frames)
    gusher.keyframe_insert(data_path="location", frame=duration_frames)
    
    # Camera: Starts at the underground blowout, rockets upward tracking eruption
    bpy.ops.object.camera_add(location=(0, -17.5, -2.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(82), 0, 0)
    cam.data.lens = 42
    bpy.context.scene.camera = cam
    
    cam.location.z = -2.0
    cam.keyframe_insert(data_path="location", index=2, frame=1)
    cam.location.z = 9.0
    cam.keyframe_insert(data_path="location", index=2, frame=duration_frames)

# =============================================================================
# SCENE 3: MICROSCOPIC ROCK SPONGE & BLOWOUT PREVENTER (BOP)
# =============================================================================

def animate_bop_scene(duration_frames):
    split_frame = int(duration_frames * 0.44)
    
    # -------------------------------------------------------------------------
    # PART A: Microscopic Rock Sponge (Matching Mildly Elsewhere frame 18)
    # Smooth pebbles packed with shiny black crude oil filling liquid crevices
    # -------------------------------------------------------------------------
    mat_pebble_pale = create_pbr_material("Mat_PebblePale", (0.90, 0.88, 0.82), roughness=0.22, specular=0.7)
    mat_pebble_warm = create_pbr_material("Mat_PebbleWarm", (0.82, 0.76, 0.65), roughness=0.25, specular=0.65)
    mat_crude = create_crude_oil_material()
    
    # Background oil plane behind pebbles
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0, 0.3, -30.0))
    oil_bg = bpy.context.active_object
    oil_bg.rotation_euler = (math.radians(90), 0, 0)
    oil_bg.data.materials.append(mat_crude)
    
    # Macro packed pebble cluster
    pebbles = [
        # (x, z, radius, is_warm)
        ( 0.0, -29.8, 0.65, False),
        (-0.9, -29.5, 0.55, True),
        ( 0.85,-29.6, 0.60, True),
        (-0.6, -30.7, 0.58, False),
        ( 0.6, -30.6, 0.62, False),
        ( 0.0, -31.6, 0.52, True),
        (-1.2, -31.4, 0.48, True),
        ( 1.2, -31.3, 0.50, False),
        (-0.1, -28.7, 0.50, False),
        ( 1.1, -28.8, 0.45, True),
        (-1.0, -28.6, 0.42, True),
        (-1.5, -30.2, 0.45, False),
        ( 1.5, -30.1, 0.46, True),
    ]
    for px, pz, pr, is_warm in pebbles:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=pr, location=(px, 0.0, pz))
        peb = bpy.context.active_object
        peb.scale = (1.1, 0.75, 1.2)
        peb.data.materials.append(mat_pebble_warm if is_warm else mat_pebble_pale)
        
    # Interstitial crude oil beads between pebbles
    oil_beads = [
        (-0.45, -30.1, 0.28), (0.45, -30.1, 0.30),
        (0.0, -30.7, 0.25), (-0.8, -31.0, 0.22),
        (0.8, -30.9, 0.24), (0.0, -29.2, 0.26)
    ]
    for ox, oz, orad in oil_beads:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=orad, location=(ox, -0.05, oz))
        bead = bpy.context.active_object
        bead.scale = (1.3, 0.6, 1.0)
        bead.data.materials.append(mat_crude)
        
    # Dedicated macro lighting for pebbles
    bpy.ops.object.light_add(type='POINT', location=(1.8, -2.5, -28.8))
    p_light1 = bpy.context.active_object
    p_light1.data.energy = 160.0
    p_light1.data.color = (1.0, 0.98, 0.95)
    
    bpy.ops.object.light_add(type='POINT', location=(-1.8, -2.5, -31.2))
    p_light2 = bpy.context.active_object
    p_light2.data.energy = 90.0
    p_light2.data.color = (0.85, 0.92, 1.0)
    
    # -------------------------------------------------------------------------
    # PART B: Surface Cellar & Industrial Blowout Preventer (BOP) (Frame 24)
    # -------------------------------------------------------------------------
    build_geological_cutaway()
    build_derrick_tower()
    
    mat_planks = create_pbr_material("Mat_CellarPlanks", (0.35, 0.26, 0.17), roughness=0.8)
    
    # Cellar back wall
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.6, -0.5))
    back_wall = bpy.context.active_object
    back_wall.scale = (3.4, 0.15, 3.4)
    back_wall.data.materials.append(mat_planks)
    
    # Cellar side walls (NO front wall, so camera sees inside)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.7, 0.7, -0.5))
    left_wall = bpy.context.active_object
    left_wall.scale = (0.15, 1.8, 3.4)
    left_wall.data.materials.append(mat_planks)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(1.7, 0.7, -0.5))
    right_wall = bpy.context.active_object
    right_wall.scale = (0.15, 1.8, 3.4)
    right_wall.data.materials.append(mat_planks)
    
    # Industrial green BOP casing housing with top/bottom flanges
    mat_bop_green = create_pbr_material("Mat_BOP_IndustrialGreen", (0.14, 0.32, 0.20), roughness=0.35, metallic=0.7)
    
    # Top flange
    bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=0.3, location=(0, 0.8, 0.85))
    top_flange = bpy.context.active_object
    top_flange.data.materials.append(mat_bop_green)
    
    # Main body
    bpy.ops.mesh.primitive_cylinder_add(radius=1.1, depth=1.6, location=(0, 0.8, -0.1))
    bop_body = bpy.context.active_object
    bop_body.data.materials.append(mat_bop_green)
    
    # Bottom flange
    bpy.ops.mesh.primitive_cylinder_add(radius=0.95, depth=0.3, location=(0, 0.8, -1.05))
    bottom_flange = bpy.context.active_object
    bottom_flange.data.materials.append(mat_bop_green)
    
    # Central through-pipe
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=6.0, location=(0, 0.8, -0.5))
    inner_pipe = bpy.context.active_object
    mat_rusty = create_pbr_material("Mat_RustyPipe", (0.42, 0.32, 0.26), roughness=0.55, metallic=0.85)
    inner_pipe.data.materials.append(mat_rusty)
    
    # Left and Right hydraulic clamping rams (polished silver steel)
    mat_polished_ram = create_pbr_material("Mat_PolishedRam", (0.88, 0.90, 0.94), roughness=0.12, metallic=0.98)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.4, 0.8, -0.1))
    ram_l = bpy.context.active_object
    ram_l.scale = (0.85, 0.55, 0.5)
    ram_l.data.materials.append(mat_polished_ram)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(1.4, 0.8, -0.1))
    ram_r = bpy.context.active_object
    ram_r.scale = (0.85, 0.55, 0.5)
    ram_r.data.materials.append(mat_polished_ram)
    
    # Side red control valve wheel
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.06, location=(1.35, 0.4, -0.9))
    valve = bpy.context.active_object
    valve.rotation_euler = (math.radians(90), 0, 0)
    mat_valve = create_pbr_material("Mat_RedValve", (0.85, 0.12, 0.10), roughness=0.3, metallic=0.5)
    valve.data.materials.append(mat_valve)
    
    # Animate hydraulic rams slamming shut around frame 72%
    shut_frame = int(duration_frames * 0.72)
    
    ram_l.location.x = -1.4
    ram_l.keyframe_insert(data_path="location", index=0, frame=split_frame)
    ram_l.location.x = -1.4
    ram_l.keyframe_insert(data_path="location", index=0, frame=shut_frame - 4)
    ram_l.location.x = -0.32
    ram_l.keyframe_insert(data_path="location", index=0, frame=shut_frame)
    
    ram_r.location.x = 1.4
    ram_r.keyframe_insert(data_path="location", index=0, frame=split_frame)
    ram_r.location.x = 1.4
    ram_r.keyframe_insert(data_path="location", index=0, frame=shut_frame - 4)
    ram_r.location.x = 0.32
    ram_r.keyframe_insert(data_path="location", index=0, frame=shut_frame)
    
    # Camera: Starts on rock sponge macro, then cuts instantly to BOP cellar
    bpy.ops.object.camera_add(location=(0, -3.8, -30.0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.lens = 52
    bpy.context.scene.camera = cam
    
    # Sponge view frames 1 to split_frame - 1
    cam.location = (0, -3.8, -30.0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam.keyframe_insert(data_path="location", frame=1)
    cam.keyframe_insert(data_path="rotation_euler", frame=1)
    cam.keyframe_insert(data_path="location", frame=split_frame - 1)
    cam.keyframe_insert(data_path="rotation_euler", frame=split_frame - 1)
    
    # BOP cellar cut at split_frame
    cam.location = (0, -6.2, -0.4)
    cam.rotation_euler = (math.radians(88), 0, 0)
    cam.keyframe_insert(data_path="location", frame=split_frame)
    cam.keyframe_insert(data_path="rotation_euler", frame=split_frame)
    cam.keyframe_insert(data_path="location", frame=duration_frames)
    cam.keyframe_insert(data_path="rotation_euler", frame=duration_frames)

# =============================================================================
# SCENE 4: WALKING BEAM PUMP JACK KINEMATICS (Matching frame 30 & 35)
# =============================================================================

def animate_pump_jack_scene(duration_frames):
    build_geological_cutaway()
    
    # Foundation concrete slab
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.2, 0.8, 0.15))
    slab = bpy.context.active_object
    slab.scale = (8.5, 3.6, 0.3)
    mat_concrete = create_pbr_material("Mat_ConcreteSlab", (0.72, 0.70, 0.68), roughness=0.85)
    slab.data.materials.append(mat_concrete)
    
    mat_steel_frame = create_pbr_material("Mat_IndustrialSteel", (0.28, 0.32, 0.36), roughness=0.35, metallic=0.85)
    mat_rust_orange = create_pbr_material("Mat_PumpJackOrange", (0.78, 0.32, 0.14), roughness=0.45, metallic=0.3)
    
    # Samson post (A-frame tower) centered at X = -0.6
    samson_legs = [
        ((-0.2, 0.0, 0.3), (-0.5, 0.5, 4.4)),
        ((-0.2, 1.6, 0.3), (-0.5, 1.1, 4.4)),
        ((-1.4, 0.0, 0.3), (-0.7, 0.5, 4.4)),
        ((-1.4, 1.6, 0.3), (-0.7, 1.1, 4.4))
    ]
    for start, end in samson_legs:
        mid = ((start[0]+end[0])/2, (start[1]+end[1])/2, (start[2]+end[2])/2)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=4.3, location=mid)
        leg = bpy.context.active_object
        leg.data.materials.append(mat_steel_frame)
        dz = end[2] - start[2]
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        leg.rotation_euler = (math.atan2(dy, dz), -math.atan2(dx, dz), 0)
        
    # Walking Beam (pivoting on top of Samson post at X = -0.6, Y = 0.8, Z = 4.4)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.6, 0.8, 4.4))
    beam = bpy.context.active_object
    beam.scale = (6.4, 0.35, 0.45)
    beam.data.materials.append(mat_steel_frame)
    
    # Rust-Orange Horsehead on right end of beam (X = 2.4)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.9, depth=0.3, location=(2.4, 0.8, 4.4))
    horsehead = bpy.context.active_object
    horsehead.scale = (0.7, 1.0, 1.4)
    horsehead.rotation_euler = (math.radians(90), 0, 0)
    horsehead.data.materials.append(mat_rust_orange)
    horsehead.parent = beam
    
    # Rust-Orange Counterweight Slabs on left end of beam (X = -3.4)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-3.4, 0.8, 4.4))
    counterweight = bpy.context.active_object
    counterweight.scale = (1.5, 0.85, 0.9)
    counterweight.data.materials.append(mat_rust_orange)
    counterweight.parent = beam
    
    # Polished steel sucker rod plunging into borehole wellhead on right (X = 2.4)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=10.0, location=(2.4, 0.8, -1.5))
    rod = bpy.context.active_object
    mat_polished = create_pbr_material("Mat_PolishedRod", (0.88, 0.90, 0.95), roughness=0.1, metallic=0.98)
    rod.data.materials.append(mat_polished)
    
    # Wellhead casing pipe around rod
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=6.0, location=(2.4, 0.8, -2.5))
    wellhead_casing = bpy.context.active_object
    wellhead_casing.data.materials.append(mat_steel_frame)
    
    # Wire bridle cable hanging from horsehead to rod top
    bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=1.8, location=(2.4, 0.8, 3.8))
    bridle = bpy.context.active_object
    bridle.data.materials.append(mat_steel_frame)
    
    # Revolving crank & counterweights at X = -2.0, Z = 1.6
    bpy.ops.mesh.primitive_cylinder_add(radius=0.7, depth=0.25, location=(-2.0, 0.8, 1.6))
    crank = bpy.context.active_object
    crank.rotation_euler = (math.radians(90), 0, 0)
    crank.data.materials.append(mat_rust_orange)
    
    # Pitman connecting arms linking crank to beam
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=2.8, location=(-2.0, 0.8, 3.0))
    pitman = bpy.context.active_object
    pitman.data.materials.append(mat_steel_frame)
    
    # Hit-and-miss engine with spinning flywheel on far left (X = -4.4)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.4, 0.8, 0.75))
    engine_block = bpy.context.active_object
    engine_block.scale = (1.4, 1.1, 0.9)
    mat_engine = create_pbr_material("Mat_GreenEngine", (0.16, 0.32, 0.18), roughness=0.45, metallic=0.6)
    engine_block.data.materials.append(mat_engine)
    
    bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=0.18, location=(-4.4, 1.4, 0.85))
    flywheel = bpy.context.active_object
    flywheel.rotation_euler = (math.radians(90), 0, 0)
    flywheel.data.materials.append(mat_steel_frame)
    
    # Animate walking beam harmonic rocking & counterweight rotation
    cycles = max(2, int(duration_frames / 36))
    for frame in range(1, duration_frames + 1):
        phase = (frame / duration_frames) * math.pi * 2 * cycles
        angle = math.sin(phase) * math.radians(14)
        beam.rotation_euler.y = angle
        beam.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)
        
        crank.rotation_euler.y = phase
        crank.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)
        
        flywheel.rotation_euler.y = phase * 2.5
        flywheel.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)
        
        rod_z = -1.5 + math.sin(phase) * 0.45
        rod.location.z = rod_z
        rod.keyframe_insert(data_path="location", index=2, frame=frame)
        
    # Camera: Front-isometric view perfectly framing the entire pump jack and strata cutaway below
    bpy.ops.object.camera_add(location=(-0.5, -19.5, 1.2))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(84), 0, math.radians(2))
    cam.data.lens = 38
    bpy.context.scene.camera = cam

# =============================================================================
# MAIN ORCHESTRATOR
# =============================================================================

def main():
    args = parse_args()
    clean_scene()
    
    scene = bpy.context.scene
    setup_render_settings(scene, args["fps"], args["duration"], args["output_path"])
    setup_environment(scene)
    
    action = args.get("action", "drill_down")
    total_frames = scene.frame_end
    
    if action == "drill_down":
        animate_drill_scene(total_frames)
    elif action == "oil_gusher":
        animate_gusher_scene(total_frames)
    elif action == "bop_clamp":
        animate_bop_scene(total_frames)
    elif action == "pump_jack":
        animate_pump_jack_scene(total_frames)
        
    print(f"Blender rendering {total_frames} frames ({args['duration']}s) to {args['output_path']}...")
    bpy.ops.render.render(animation=True)
    print("Blender headless render complete!\n")

if __name__ == "__main__":
    main()
