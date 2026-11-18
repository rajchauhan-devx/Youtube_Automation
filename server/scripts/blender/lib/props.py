"""
Parametric 3D Prop & Mechanical Asset Generator for Blender 5.0+
Provides accurate, procedural 3D models for:
- Historic Spindletop timber lattice derrick with X-bracing, ladder, and crown sheaves
- Sedimentary geological cross-section block with borehole cutaway
- Duplex industrial piston mud pump with surge chamber and piping
- Cellar Blowout Preventer (BOP) with cutaway hydraulic clamping rams
- Complete kinematic walking beam pump jack with horsehead, counterweights, and motor
- Macro rock sponge pebble matrix with organic river stones and crude oil
- Prairie environment props (weathered shack, steam boiler, oil tanks, horizon trees)
"""

import math
import random
import bpy
from .materials import (
    create_pbr_material,
    create_rich_strata_material,
    create_weathered_timber_material,
    create_industrial_metal_material,
    create_prairie_ground_material,
    create_crude_oil_material,
    create_river_pebble_material,
)

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def add_smooth_subdiv(obj, levels=1):
    """Enables smooth shading and adds a subdivision surface modifier."""
    for poly in obj.data.polygons:
        poly.use_smooth = True
    sub = obj.modifiers.new(name="Subsurf", type='SUBSURF')
    sub.levels = levels
    sub.render_levels = levels

def add_beam_between_points(p1, p2, thickness, material, name="Beam"):
    """Creates an oriented rectangular timber or steel beam between two 3D coordinates."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    dz = p2[2] - p1[2]
    dist = math.sqrt(dx*dx + dy*dy + dz*dz)
    if dist < 0.001:
        return None
        
    mid = ((p1[0]+p2[0])/2, (p1[1]+p2[1])/2, (p1[2]+p2[2])/2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=mid)
    beam = bpy.context.active_object
    beam.name = name
    beam.scale = (thickness, thickness, dist)
    
    # Calculate orientation
    phi = math.atan2(dy, dx)
    theta = math.acos(max(-1.0, min(1.0, dz / dist)))
    beam.rotation_euler = (0, theta, phi)
    
    if material:
        beam.data.materials.append(material)
    return beam

# =============================================================================
# 1. TIMBER LATTICE DERRICK
# =============================================================================

def build_timber_derrick(height=9.4, base_w=1.45, top_w=0.44, include_crown=True, include_ladder=True):
    """
    Constructs an authentic Spindletop-era wooden timber derrick:
    - 4 corner wooden legs tapering upward
    - 5 tiers of horizontal perimeter girts (hollow center)
    - Full diagonal X-bracing trusses on all four faces
    - Top crown block with pulleys and sheaves
    - Rig floor rotary table opening
    - Side ladder rungs
    """
    mat_timber = create_weathered_timber_material()
    mat_steel = create_industrial_metal_material((0.24, 0.26, 0.28), metallic=0.92, roughness=0.35)
    
    # Center y-offset so front face is near cutaway edge
    y_center = 1.55
    y_span_base = 1.2
    y_span_top = 0.38
    
    # 4 Corner Legs
    legs_coords = [
        ((-base_w, y_center - y_span_base, 0.0), (-top_w, y_center - y_span_top, height)),
        (( base_w, y_center - y_span_base, 0.0), ( top_w, y_center - y_span_top, height)),
        (( base_w, y_center + y_span_base, 0.0), ( top_w, y_center + y_span_top, height)),
        ((-base_w, y_center + y_span_base, 0.0), (-top_w, y_center + y_span_top, height)),
    ]
    
    leg_objects = []
    for i, (start, end) in enumerate(legs_coords):
        beam = add_beam_between_points(start, end, 0.09, mat_timber, name=f"Derrick_Leg_{i+1}")
        if beam:
            leg_objects.append(beam)
            
    # Tiers and X-Braces
    z_tiers = [0.0, 1.8, 3.6, 5.4, 7.2, 9.0]
    
    for t_idx in range(len(z_tiers) - 1):
        z_low = z_tiers[t_idx]
        z_high = z_tiers[t_idx + 1]
        
        # Calculate width and depth at both heights
        t_low = z_low / height
        t_high = z_high / height
        
        w_low = base_w * (1 - t_low) + top_w * t_low
        y_low = y_span_base * (1 - t_low) + y_span_top * t_low
        
        w_high = base_w * (1 - t_high) + top_w * t_high
        y_high = y_span_base * (1 - t_high) + y_span_top * t_high
        
        # 4 corners at bottom of this tier
        c_low = [
            (-w_low, y_center - y_low, z_low),
            ( w_low, y_center - y_low, z_low),
            ( w_low, y_center + y_low, z_low),
            (-w_low, y_center + y_low, z_low),
        ]
        # 4 corners at top of this tier
        c_high = [
            (-w_high, y_center - y_high, z_high),
            ( w_high, y_center - y_high, z_high),
            ( w_high, y_center + y_high, z_high),
            (-w_high, y_center + y_high, z_high),
        ]
        
        # Horizontal perimeter girts at top of tier
        for side in range(4):
            p1 = c_high[side]
            p2 = c_high[(side + 1) % 4]
            add_beam_between_points(p1, p2, 0.065, mat_timber, name=f"Girt_T{t_idx}_S{side}")
            
            # Diagonal X-Braces across this face
            p_low_left = c_low[side]
            p_low_right = c_low[(side + 1) % 4]
            p_high_left = c_high[side]
            p_high_right = c_high[(side + 1) % 4]
            
            add_beam_between_points(p_low_left, p_high_right, 0.045, mat_timber, name=f"X1_T{t_idx}_S{side}")
            add_beam_between_points(p_low_right, p_high_left, 0.045, mat_timber, name=f"X2_T{t_idx}_S{side}")
            
    # Rig Floor Rotary Table
    bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=0.08, location=(0, y_center, 0.04))
    table = bpy.context.active_object
    table.name = "Rotary_Table"
    table.data.materials.append(mat_steel)
    
    # Floor Timber Planks
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, y_center, 0.02))
    floor = bpy.context.active_object
    floor.name = "Rig_Floor"
    floor.scale = (base_w * 2.1, y_span_base * 2.1, 0.04)
    floor.data.materials.append(mat_timber)
    
    # Ladder Rungs along Right Face
    if include_ladder:
        ladder_x = base_w * 0.95
        for z in [0.3 * k for k in range(1, int(height / 0.3))]:
            t = z / height
            cur_w = base_w * (1 - t) + top_w * t
            add_beam_between_points(
                (cur_w, y_center - 0.15, z),
                (cur_w, y_center + 0.15, z),
                0.03, mat_timber, name="Ladder_Rung"
            )
            
    # Crown Block Platform and Pulleys
    if include_crown:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, y_center, height + 0.1))
        crown_plat = bpy.context.active_object
        crown_plat.name = "Crown_Platform"
        crown_plat.scale = (top_w * 2.4, y_span_top * 2.4, 0.12)
        crown_plat.data.materials.append(mat_steel)
        
        # Dual Sheaves (Pulleys)
        for sx in [-0.22, 0.22]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=0.08, location=(sx, y_center, height + 0.45))
            sheave = bpy.context.active_object
            sheave.name = f"Crown_Sheave_{sx}"
            sheave.rotation_euler = (0, math.radians(90), 0)
            sheave.data.materials.append(mat_steel)
            
        # Watermark/Gin Pole on Crown
        gin = add_beam_between_points(
            (0, y_center, height + 0.12),
            (0, y_center, height + 1.2),
            0.05, mat_steel, name="Gin_Pole"
        )

# =============================================================================
# 2. GEOLOGICAL CUTAWAY BLOCK
# =============================================================================

def build_cutaway_block(height=9.2, width=16.0, depth=8.0, borehole_radius=0.42):
    """
    Constructs the underground sedimentary rock cutaway with exposed borehole.
    """
    mat_strata = create_rich_strata_material()
    mat_dirt = create_prairie_ground_material()
    
    # Underground Rock Block (Front face sliced along Y=0)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, depth/2 + 0.2, -height/2))
    rock = bpy.context.active_object
    rock.name = "Geological_CrossSection"
    rock.scale = (width, depth, height)
    rock.data.materials.append(mat_strata)
    
    # Central Borehole Groove (semi-cylindrical cutout exposed on front face)
    bpy.ops.mesh.primitive_cylinder_add(radius=borehole_radius, depth=height * 1.05, location=(0, 0.05, -height/2))
    bore_slot = bpy.context.active_object
    bore_slot.name = "Borehole_BackWall"
    mat_bore = create_industrial_metal_material((0.18, 0.16, 0.14), metallic=0.2, roughness=0.9)
    bore_slot.data.materials.append(mat_bore)
    
    # Surface Ground Prairie Slab
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, depth/2 + 0.2, 0.06))
    ground = bpy.context.active_object
    ground.name = "Surface_Ground"
    ground.scale = (width * 1.5, depth * 1.5, 0.12)
    ground.data.materials.append(mat_dirt)

# =============================================================================
# 3. PRAIRIE ENVIRONMENT PROPS
# =============================================================================

def build_prairie_environment():
    """Builds operator shack, steam boiler, storage tanks, and horizon tree line."""
    mat_wood = create_weathered_timber_material()
    mat_iron = create_industrial_metal_material((0.18, 0.19, 0.20), metallic=0.88, roughness=0.45)
    mat_foliage = create_pbr_material("Mat_HorizonFoliage", (0.16, 0.28, 0.12), roughness=0.95)
    
    # 1. Wooden Operator Shack (Left of Derrick)
    shack_x, shack_y = -6.2, 4.8
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(shack_x, shack_y, 1.1))
    shack_body = bpy.context.active_object
    shack_body.name = "Operator_Shack"
    shack_body.scale = (2.6, 2.2, 2.0)
    shack_body.data.materials.append(mat_wood)
    
    # Gabled Roof
    bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=1.6, depth=2.8, location=(shack_x, shack_y, 2.35))
    roof = bpy.context.active_object
    roof.name = "Shack_Roof"
    roof.rotation_euler = (0, math.radians(90), 0)
    roof.scale = (0.55, 0.9, 1.0)
    roof.data.materials.append(mat_wood)
    
    # 2. Horizontal Steam Boiler & Smokestack
    boiler_x, boiler_y = -9.2, 6.0
    bpy.ops.mesh.primitive_cylinder_add(radius=0.75, depth=2.4, location=(boiler_x, boiler_y, 0.85))
    boiler = bpy.context.active_object
    boiler.name = "Steam_Boiler"
    boiler.rotation_euler = (0, math.radians(90), 0)
    boiler.data.materials.append(mat_iron)
    
    # Tall Smokestack
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=3.8, location=(boiler_x - 1.0, boiler_y, 2.6))
    stack = bpy.context.active_object
    stack.name = "Boiler_Stack"
    stack.data.materials.append(mat_iron)
    
    # 3. Wooden Water / Oil Storage Tank (Right of Derrick)
    tank_x, tank_y = 6.8, 5.5
    bpy.ops.mesh.primitive_cylinder_add(radius=1.2, depth=2.2, location=(tank_x, tank_y, 1.1))
    tank = bpy.context.active_object
    tank.name = "Storage_Tank"
    tank.data.materials.append(mat_wood)
    
    # 4. Horizon Trees and Bushes
    for i, x in enumerate([-18.0, -14.0, -11.0, -7.5, 8.5, 12.0, 15.5, 19.0]):
        dist_y = 12.0 + (i % 3) * 1.5
        bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=1.1, location=(x, dist_y, 0.65))
        bush = bpy.context.active_object
        bush.name = f"Horizon_Bush_{i}"
        bush.scale = (1.2, 0.8, 1.4)
        bush.data.materials.append(mat_foliage)

# =============================================================================
# 4. INDUSTRIAL DUPLEX MUD PUMP
# =============================================================================

def build_mud_pump(location=(0, 0, 0), scale=1.0):
    """
    Constructs an authentic steam-driven industrial duplex mud pump:
    - Heavy timber skid base
    - Twin reciprocating cylinders
    - Polished brass/chrome piston rods
    - Surge dampener dome (pulsation chamber)
    - Suction & discharge manifold pipes
    """
    mat_skid = create_weathered_timber_material()
    mat_cast_iron = create_industrial_metal_material((0.20, 0.22, 0.24), metallic=0.90, roughness=0.42)
    mat_chrome = create_industrial_metal_material((0.85, 0.88, 0.92), metallic=0.98, roughness=0.12)
    
    ox, oy, oz = location
    
    # 1. Timber Skid Base
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, oz + 0.12))
    skid = bpy.context.active_object
    skid.name = "Pump_Skid"
    skid.scale = (1.6 * scale, 3.2 * scale, 0.24 * scale)
    skid.data.materials.append(mat_skid)
    
    # 2. Main Fluid Cylinders (Front)
    for x_off in [-0.38 * scale, 0.38 * scale]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.32 * scale, depth=1.4 * scale,
            location=(ox + x_off, oy - 0.5 * scale, oz + 0.55 * scale)
        )
        cyl = bpy.context.active_object
        cyl.name = f"Pump_Cylinder_{x_off}"
        cyl.rotation_euler = (math.radians(90), 0, 0)
        cyl.data.materials.append(mat_cast_iron)
        
        # Piston Rod
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.08 * scale, depth=1.1 * scale,
            location=(ox + x_off, oy + 0.45 * scale, oz + 0.55 * scale)
        )
        rod = bpy.context.active_object
        rod.name = f"Piston_Rod_{x_off}"
        rod.rotation_euler = (math.radians(90), 0, 0)
        rod.data.materials.append(mat_chrome)
        
    # 3. Power End / Crankcase (Rear)
    bpy.ops.mesh.primitive_cube_add(
        size=1.0, location=(ox, oy + 0.85 * scale, oz + 0.65 * scale)
    )
    crankcase = bpy.context.active_object
    crankcase.name = "Pump_Crankcase"
    crankcase.scale = (1.3 * scale, 1.2 * scale, 0.85 * scale)
    crankcase.data.materials.append(mat_cast_iron)
    
    # 4. Pulsation Dampener Surge Dome
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.42 * scale, location=(ox, oy - 0.45 * scale, oz + 1.25 * scale)
    )
    dome = bpy.context.active_object
    dome.name = "Surge_Dome"
    dome.scale = (1.0, 1.0, 1.3)
    add_smooth_subdiv(dome, levels=1)
    dome.data.materials.append(mat_cast_iron)
    
    # 5. Discharge High-Pressure Pipe to Well
    add_beam_between_points(
        (ox + 0.45 * scale, oy - 0.6 * scale, oz + 0.55 * scale),
        (ox + 2.4 * scale, oy - 0.6 * scale, oz + 0.3 * scale),
        0.12 * scale, mat_cast_iron, name="Discharge_Pipe"
    )

# =============================================================================
# 5. CELLAR BLOWOUT PREVENTER (BOP)
# =============================================================================

def build_blowout_preventer(location=(0, 0, 0), scale=1.0, cutaway=False, animated=False, total_frames=200):
    """
    Constructs an industrial dual-ram Blowout Preventer (BOP):
    - Flanged steel body connected to wellhead casing
    - Opposed hydraulic ram bonnets
    - Cutaway mode exposing the horizontal sliding clamping rams
    """
    mat_bop_body = create_industrial_metal_material((0.14, 0.28, 0.22), metallic=0.88, roughness=0.38) # Industrial green
    mat_rams = create_industrial_metal_material((0.72, 0.74, 0.78), metallic=0.96, roughness=0.18) # Machined steel
    mat_casing = create_industrial_metal_material((0.26, 0.28, 0.30), metallic=0.92, roughness=0.35)
    
    ox, oy, oz = location
    
    # Casing Spool & Flanges
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.48 * scale, depth=1.6 * scale, location=(ox, oy, oz)
    )
    body = bpy.context.active_object
    body.name = "BOP_Main_Spool"
    body.data.materials.append(mat_bop_body)
    
    # Top and Bottom Bolted Flanges
    for fz in [-0.75 * scale, 0.75 * scale]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.72 * scale, depth=0.18 * scale, location=(ox, oy, oz + fz)
        )
        flange = bpy.context.active_object
        flange.name = f"BOP_Flange_{fz}"
        flange.data.materials.append(mat_bop_body)
        
    # Dual Opposed Hydraulic Ram Bonnets (Left and Right)
    for side, sx in [(-1, -0.92 * scale), (1, 0.92 * scale)]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.35 * scale, depth=1.1 * scale, location=(ox + sx, oy, oz + 0.1 * scale)
        )
        bonnet = bpy.context.active_object
        bonnet.name = f"BOP_Bonnet_{side}"
        bonnet.rotation_euler = (0, math.radians(90), 0)
        bonnet.data.materials.append(mat_bop_body)
        
        # Ram Piston Actuator
        if cutaway:
            init_x = ox + (sx * 0.58)
            clamp_x = ox + (sx * 0.22)
            bpy.ops.mesh.primitive_cube_add(
                size=1.0, location=(init_x, oy, oz + 0.1 * scale)
            )
            ram = bpy.context.active_object
            ram.name = f"BOP_Ram_Jaw_{side}"
            ram.scale = (0.38 * scale, 0.55 * scale, 0.36 * scale)
            ram.data.materials.append(mat_rams)
            
            if animated:
                # Open until frame 45, then rapidly clamps shut by frame 75
                ram.location.x = init_x
                ram.keyframe_insert(data_path="location", index=0, frame=1)
                ram.keyframe_insert(data_path="location", index=0, frame=45)
                ram.location.x = clamp_x
                ram.keyframe_insert(data_path="location", index=0, frame=75)
            
    # Central Drill Pipe Passing Through
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.20 * scale, depth=3.2 * scale, location=(ox, oy, oz)
    )
    drill_pipe = bpy.context.active_object
    drill_pipe.name = "BOP_Drill_Pipe"
    drill_pipe.data.materials.append(mat_casing)

# =============================================================================
# 6. KINEMATIC WALKING BEAM PUMP JACK
# =============================================================================

def build_pumpjack(location=(0, 0, 0), scale=1.0, animated=True, total_frames=200):
    """
    Constructs a complete walking beam pump jack (nodding donkey):
    - Samson post A-frame
    - Center saddle bearing & walking beam
    - Curved horsehead with wireline bridle
    - Pitman arms, rotating crank arms, and heavy counterweights
    - Drive motor with spinning flywheel and belt
    """
    mat_steel = create_industrial_metal_material((0.22, 0.24, 0.25), metallic=0.92, roughness=0.35)
    mat_rust = create_industrial_metal_material((0.62, 0.32, 0.18), metallic=0.75, roughness=0.65) # Rust red counterweight
    mat_horsehead = create_industrial_metal_material((0.72, 0.36, 0.18), metallic=0.82, roughness=0.45)
    
    ox, oy, oz = location
    
    # 1. Base Skid I-Beams
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(ox, oy, oz + 0.1 * scale))
    skid = bpy.context.active_object
    skid.name = "Pumpjack_Base"
    skid.scale = (1.4 * scale, 4.8 * scale, 0.2 * scale)
    skid.data.materials.append(mat_steel)
    
    # 2. Samson Post (Lattice A-Frame)
    post_h = 3.6 * scale
    samson_y = oy + 0.3 * scale
    
    add_beam_between_points(
        (ox - 0.55 * scale, samson_y - 0.7 * scale, oz + 0.2 * scale),
        (ox, samson_y, oz + post_h),
        0.12 * scale, mat_steel, name="Samson_Leg_1"
    )
    add_beam_between_points(
        (ox + 0.55 * scale, samson_y - 0.7 * scale, oz + 0.2 * scale),
        (ox, samson_y, oz + post_h),
        0.12 * scale, mat_steel, name="Samson_Leg_2"
    )
    add_beam_between_points(
        (ox, samson_y + 0.9 * scale, oz + 0.2 * scale),
        (ox, samson_y, oz + post_h),
        0.14 * scale, mat_steel, name="Samson_Leg_Back"
    )
    
    # 3. Walking Beam & Center Bearing
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.18 * scale, depth=0.45 * scale, location=(ox, samson_y, oz + post_h)
    )
    bearing = bpy.context.active_object
    bearing.name = "Saddle_Bearing"
    bearing.rotation_euler = (0, math.radians(90), 0)
    bearing.data.materials.append(mat_steel)
    
    # Walking Beam (I-Beam)
    beam_len = 4.2 * scale
    bpy.ops.mesh.primitive_cube_add(
        size=1.0, location=(ox, samson_y, oz + post_h + 0.18 * scale)
    )
    beam = bpy.context.active_object
    beam.name = "Walking_Beam"
    beam.scale = (0.24 * scale, beam_len, 0.42 * scale)
    beam.data.materials.append(mat_steel)
    
    # 4. Horsehead (Curved Front Arc)
    head_y = samson_y - (beam_len / 2)
    head_z = oz + post_h + 0.18 * scale
    
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16, radius=1.1 * scale, depth=0.28 * scale,
        location=(ox, head_y, head_z)
    )
    horsehead = bpy.context.active_object
    horsehead.name = "Horsehead"
    horsehead.rotation_euler = (0, math.radians(90), 0)
    horsehead.scale = (1.0, 0.45, 1.2)
    horsehead.data.materials.append(mat_horsehead)
    
    # Bridle Wire & Polished Rod to Wellhead
    wellhead_y = head_y - 0.45 * scale
    add_beam_between_points(
        (ox, wellhead_y, head_z + 0.6 * scale),
        (ox, wellhead_y, oz - 1.2 * scale),
        0.04 * scale, mat_steel, name="Polished_Rod"
    )
    
    # 5. Counterbalance Weights & Rotating Crank (Rear)
    crank_y = samson_y + (beam_len / 2) - 0.4 * scale
    crank_z = oz + 1.2 * scale
    
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.22 * scale, depth=0.6 * scale, location=(ox, crank_y, crank_z)
    )
    crank_hub = bpy.context.active_object
    crank_hub.name = "Crank_Hub"
    crank_hub.rotation_euler = (0, math.radians(90), 0)
    crank_hub.data.materials.append(mat_steel)
    
    # Counterweight Slabs
    for side, cx in [(-1, ox - 0.38 * scale), (1, ox + 0.38 * scale)]:
        bpy.ops.mesh.primitive_cube_add(
            size=1.0, location=(cx, crank_y + 0.35 * scale, crank_z)
        )
        cw = bpy.context.active_object
        cw.name = f"Counterweight_{side}"
        cw.scale = (0.16 * scale, 0.7 * scale, 1.2 * scale)
        cw.data.materials.append(mat_rust)
        
    # 6. Pitman Arms Connecting Crank to Walking Beam
    pitman_top_y = samson_y + (beam_len / 2)
    add_beam_between_points(
        (ox, crank_y + 0.35 * scale, crank_z + 0.5 * scale),
        (ox, pitman_top_y, oz + post_h),
        0.08 * scale, mat_steel, name="Pitman_Arm"
    )
    
    # 7. Motor / Engine with Spinning Flywheel and V-Belt
    engine_y = crank_y + 1.5 * scale
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.65 * scale, depth=0.14 * scale, location=(ox, engine_y, oz + 0.75 * scale)
    )
    flywheel = bpy.context.active_object
    flywheel.name = "Motor_Flywheel"
    flywheel.rotation_euler = (0, math.radians(90), 0)
    flywheel.data.materials.append(mat_steel)
    
    # Keyframe Nodding Animation
    if animated:
        # Beam rocks ±12 degrees
        beam.rotation_euler = (0, 0, 0)
        beam.keyframe_insert(data_path="rotation_euler", frame=1)
        
        cycle_len = 48 # ~2 seconds per stroke
        num_cycles = max(1, int(total_frames / cycle_len))
        
        for c in range(num_cycles):
            f_mid = int((c + 0.5) * cycle_len)
            f_end = int((c + 1.0) * cycle_len)
            
            beam.rotation_euler = (math.radians(-11), 0, 0)
            beam.keyframe_insert(data_path="rotation_euler", frame=f_mid)
            
            beam.rotation_euler = (math.radians(11), 0, 0)
            beam.keyframe_insert(data_path="rotation_euler", frame=f_end)

# =============================================================================
# 7. MACRO ROCK SPONGE PEBBLE MATRIX
# =============================================================================

def build_rock_sponge(num_pebbles=32, seed=42):
    """
    Constructs an organic porous sandstone rock sponge matrix:
    - Clusters of smooth river pebbles with natural quartz/sandstone palettes
    - Smooth shading and subdivision surface for natural river stone contours
    - Deep glossy crude oil layer filling the interstitial spaces
    """
    random.seed(seed)
    mat_crude = create_crude_oil_material()
    
    # Background Deep Crude Oil Pool
    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0, 0.45, 0))
    bg_oil = bpy.context.active_object
    bg_oil.name = "Crude_Oil_Pool"
    bg_oil.rotation_euler = (math.radians(90), 0, 0)
    bg_oil.data.materials.append(mat_crude)
    
    # Pebble Cluster Coordinates (X, Z, Radius, Palette)
    pebbles = [
        # Large central hero stones
        ( 0.0,   0.15, 0.72, 0),
        (-0.95,  0.75, 0.62, 1),
        ( 0.88,  0.65, 0.68, 2),
        (-0.75, -0.85, 0.64, 3),
        ( 0.72, -0.80, 0.66, 0),
        # Mid-size surrounding stones
        ( 0.0,  -1.75, 0.55, 1),
        (-1.25, -1.65, 0.52, 2),
        ( 1.25, -1.55, 0.54, 3),
        (-0.15,  1.45, 0.58, 0),
        ( 1.15,  1.48, 0.50, 1),
        (-1.18,  1.38, 0.48, 2),
        (-1.55, -0.15, 0.50, 3),
        ( 1.55, -0.10, 0.52, 0),
        # Small interstitial packing stones
        (-0.45, -0.15, 0.32, 1),
        ( 0.48, -0.18, 0.34, 2),
        (-0.65,  0.25, 0.28, 3),
        ( 0.62,  0.22, 0.30, 0),
        ( 0.0,   0.92, 0.35, 1),
        ( 0.0,  -0.95, 0.36, 2),
    ]
    
    for idx, (px, pz, pr, pal_idx) in enumerate(pebbles):
        mat_peb = create_river_pebble_material(pal_idx)
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=24, ring_count=16, radius=pr, location=(px, 0.0, pz)
        )
        peb = bpy.context.active_object
        peb.name = f"Hero_Pebble_{idx}"
        
        # Organic pebble flattening and elongation
        sx = 1.0 + random.uniform(-0.15, 0.25)
        sy = 0.65 + random.uniform(-0.10, 0.10) # Flatten along Y
        sz = 1.0 + random.uniform(-0.15, 0.25)
        peb.scale = (sx, sy, sz)
        peb.rotation_euler = (
            random.uniform(-0.4, 0.4),
            random.uniform(-0.4, 0.4),
            random.uniform(-0.8, 0.8)
        )
        
        # Smooth shading and subdivision
        add_smooth_subdiv(peb, levels=1)
        peb.data.materials.append(mat_peb)
        
    # Liquid Crude Oil Meniscus Beads Clinging to Pebble Junctions
    crevice_locations = [
        (-0.50, 0.0, -0.35), ( 0.50, 0.0, -0.32),
        ( 0.0,  0.0, -1.25), (-0.85, 0.0, -1.20),
        ( 0.85, 0.0, -1.15), ( 0.0,  0.0,  0.55),
        (-1.05, 0.0,  0.15), ( 1.05, 0.0,  0.25),
        (-0.55, 0.0,  1.10), ( 0.55, 0.0,  1.05),
    ]
    for c_idx, (cx, cy, cz) in enumerate(crevice_locations):
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.26, location=(cx, cy - 0.08, cz)
        )
        bead = bpy.context.active_object
        bead.name = f"Crude_Meniscus_{c_idx}"
        bead.scale = (1.5, 0.6, 1.2)
        add_smooth_subdiv(bead, levels=1)
        bead.data.materials.append(mat_crude)
