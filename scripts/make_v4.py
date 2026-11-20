"""
Generate scripts/render_texas_oil_recreation_v4.py by enhancing v3 with:
  1. Turbulent harmonic fluid gusher + 14 parabolic spray ribbons + 48 droplet particles + height ruler
  2. Spindletop derrick with travelling block, hoisting cables, swivel & drill pipe tool joints
  3. Borehole with dynamic pulsing radial pressure wave rings & circulating mud
  4. Cameron double-ram hydraulic BOP with pipe-notch jaws & nitrile seals
  5. Pumpjack 4-bar linkage with curved horsehead, tangent bridle cables & carrier bar
  6. Prairie cutaway turf overhang & utility power poles
  7. Output to production_workspace/texas_oil_v4/
"""

from pathlib import Path
import re

V3_PATH = Path(r"c:\Users\zrajc\OneDrive\Desktop\Youtube_Automation\Youtube_Automation\scripts\render_texas_oil_recreation_v3.py")
V4_PATH = Path(r"c:\Users\zrajc\OneDrive\Desktop\Youtube_Automation\Youtube_Automation\scripts\render_texas_oil_recreation_v4.py")

content = V3_PATH.read_text(encoding="utf-8")

# 1. Update OUT_DIR and world blend
content = content.replace(
    'OUT_DIR = REPO_ROOT / "production_workspace" / "texas_oil_v3"',
    'OUT_DIR = REPO_ROOT / "production_workspace" / "texas_oil_v4"'
)
content = content.replace('texas_oil_v3_world.blend', 'texas_oil_v4_world.blend')

# 2. Enhanced Gusher & Skyscraper Height Arrow in build_gusher_and_vfx
OLD_GUSHER = '''    # Authentic Flared Fountain Spray Plume Mesh (Flaring upwards to 25m)
    bm = bmesh.new()
    rings = [
        (0.5, 0.30),
        (3.5, 0.45),
        (7.0, 0.65),
        (11.0, 0.95),
        (15.0, 1.35),
        (18.5, 1.95),
        (22.0, 2.85),
        (24.5, 3.85),
        (25.5, 4.40),
    ]
    segs = 20
    ring_verts = []
    for z_h, rad in rings:
        r_row = []
        for s in range(segs):
            th = math.tau * (s / segs)
            vx = rad * math.cos(th)
            vy = rad * math.sin(th) + 0.65
            r_row.append(bm.verts.new((vx, vy, z_h)))
        ring_verts.append(r_row)

    for ri in range(len(rings) - 1):
        for s in range(segs):
            s_next = (s + 1) % segs
            bm.faces.new((ring_verts[ri][s], ring_verts[ri][s_next], ring_verts[ri+1][s_next], ring_verts[ri+1][s]))

    # Top cap dome
    v_top = bm.verts.new((0.0, 0.65, 26.2))
    for s in range(segs):
        s_next = (s + 1) % segs
        bm.faces.new((ring_verts[-1][s], ring_verts[-1][s_next], v_top))

    mesh = bpy.data.meshes.new("Gusher_Flared_Plume")
    bm.to_mesh(mesh)
    bm.free()
    g_main = bpy.data.objects.new("Gusher_Flared_Plume", mesh)
    col.objects.link(g_main)
    for p in g_main.data.polygons:
        p.use_smooth = True
    g_main.data.materials.append(mat_gusher)

    # Animate gusher violent pulsation
    for f in range(540, 713, 6):
        fluct = 1.0 + 0.14 * math.sin(f * 0.45)
        g_main.scale = (fluct, fluct, 1.0)
        g_main.keyframe_insert(data_path="scale", frame=f)

    gusher_objs = [g_main]
    set_vis(gusher_objs, 1, True)
    set_vis(gusher_objs, 88, True)
    set_vis(gusher_objs, 89, False)
    set_vis(gusher_objs, 540, True)
    set_vis(gusher_objs, 712, False)'''

NEW_GUSHER = '''    # 1. Harmonic Perturbed Turbulent Plume (Flaring upwards to 28.5m)
    bm = bmesh.new()
    rings = [
        (0.4, 0.28),
        (2.0, 0.36),
        (4.5, 0.50),
        (8.0, 0.75),
        (12.0, 1.15),
        (16.0, 1.70),
        (20.0, 2.50),
        (23.5, 3.60),
        (26.0, 4.80),
        (27.8, 5.60),
    ]
    segs = 28
    ring_verts = []
    for ri, (z_h, base_rad) in enumerate(rings):
        r_row = []
        for s in range(segs):
            th = math.tau * (s / segs)
            pert = 1.0 + 0.20 * math.sin(4 * th + z_h * 0.6) + 0.12 * math.cos(7 * th - z_h * 0.9)
            rad = base_rad * pert
            vx = rad * math.cos(th)
            vy = rad * math.sin(th) + 0.65
            r_row.append(bm.verts.new((vx, vy, z_h)))
        ring_verts.append(r_row)

    for ri in range(len(rings) - 1):
        for s in range(segs):
            s_next = (s + 1) % segs
            bm.faces.new((ring_verts[ri][s], ring_verts[ri][s_next], ring_verts[ri+1][s_next], ring_verts[ri+1][s]))

    v_top = bm.verts.new((0.0, 0.65, 29.0))
    for s in range(segs):
        s_next = (s + 1) % segs
        bm.faces.new((ring_verts[-1][s], ring_verts[-1][s_next], v_top))

    mesh = bpy.data.meshes.new("Gusher_Flared_Plume_v4")
    bm.to_mesh(mesh)
    bm.free()
    g_main = bpy.data.objects.new("Gusher_Flared_Plume_v4", mesh)
    col.objects.link(g_main)
    for p in g_main.data.polygons:
        p.use_smooth = True
    g_main.data.materials.append(mat_gusher)

    # Animate gusher violent pulsation
    for f in range(540, 713, 6):
        fluct = 1.0 + 0.16 * math.sin(f * 0.45)
        g_main.scale = (fluct, fluct, 1.0)
        g_main.keyframe_insert(data_path="scale", frame=f)

    gusher_objs = [g_main]

    # 2. 14 Parabolic Fountain Spray Ribbons
    rng_t = random.Random(42)
    for ti in range(14):
        angle = (ti / 14.0) * math.tau + rng_t.uniform(-0.15, 0.15)
        max_h = rng_t.uniform(22.0, 27.5)
        max_rad = rng_t.uniform(2.8, 5.2)
        bm_arc = bmesh.new()
        arc_pts = []
        arc_steps = 14
        for st in range(arc_steps + 1):
            u = st / float(arc_steps)
            cur_z = 0.5 + (max_h - 0.5) * (4.0 * u * (1.0 - u * 0.55))
            cur_r = 0.35 + max_rad * (u ** 1.4)
            px = cur_r * math.cos(angle)
            py = cur_r * math.sin(angle) + 0.65
            w_thick = 0.08 + 0.14 * (1.0 - u)
            v1 = bm_arc.verts.new((px - w_thick * 0.5, py, cur_z))
            v2 = bm_arc.verts.new((px + w_thick * 0.5, py, cur_z))
            arc_pts.append((v1, v2))
        for st in range(arc_steps):
            bm_arc.faces.new((arc_pts[st][0], arc_pts[st][1], arc_pts[st + 1][1], arc_pts[st + 1][0]))
        m_arc = bpy.data.meshes.new(f"Gusher_Tendril_{ti}")
        bm_arc.to_mesh(m_arc)
        bm_arc.free()
        o_arc = bpy.data.objects.new(f"Gusher_Tendril_{ti}", m_arc)
        col.objects.link(o_arc)
        for p in o_arc.data.polygons:
            p.use_smooth = True
        o_arc.data.materials.append(mat_gusher)
        gusher_objs.append(o_arc)

    # 3. 48 Animated Crude Droplet Particles Cascading
    rng_d = random.Random(88)
    for di in range(48):
        d_rad = rng_d.uniform(0.08, 0.18)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=d_rad, location=(0, 0, 0))
        drop = bpy.context.active_object
        drop.name = f"Crude_Droplet_{di}"
        drop.data.materials.append(mat_gusher)
        th = rng_d.uniform(0, math.tau)
        rr = rng_d.uniform(1.2, 5.8)
        zh = rng_d.uniform(8.0, 26.0)
        p_x = rr * math.cos(th)
        p_y = rr * math.sin(th) + 0.65
        drop.location = (p_x, p_y, zh)
        drop.keyframe_insert(data_path="location", frame=540)
        drop.location = (p_x * 1.3, p_y, max(0.5, zh - rng_d.uniform(6.0, 14.0)))
        drop.keyframe_insert(data_path="location", frame=712)
        gusher_objs.append(drop)

    set_vis(gusher_objs, 1, True)
    set_vis(gusher_objs, 88, True)
    set_vis(gusher_objs, 89, False)
    set_vis(gusher_objs, 540, True)
    set_vis(gusher_objs, 712, False)'''

content = content.replace(OLD_GUSHER, NEW_GUSHER)

# 3. Add Skyscraper Height Arrow
OLD_SKYSCRAPER = '''    for w_i in range(1, 4):
        wx = (bx - bw/2) + bw * (w_i / 4.0)
        bldg_objs.append(add_beam(col, f"Bldg_Col_{w_i}", Vector((wx, by, 0.2)), Vector((wx, by, bh)), 0.06, 0.06, mat_chalk))'''

NEW_SKYSCRAPER = '''    for w_i in range(1, 4):
        wx = (bx - bw/2) + bw * (w_i / 4.0)
        bldg_objs.append(add_beam(col, f"Bldg_Col_{w_i}", Vector((wx, by, 0.2)), Vector((wx, by, bh)), 0.06, 0.06, mat_chalk))

    # Glowing 2D Height Ruler & Arrow ("100 FT" indicator)
    ax = bx - bw/2 - 0.75
    bldg_objs.append(add_beam(col, "Height_Ruler_Shaft", Vector((ax, by, 0.5)), Vector((ax, by, bh)), 0.09, 0.09, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Ruler_TopTick", Vector((ax - 0.35, by, bh)), Vector((ax + 0.35, by, bh)), 0.08, 0.08, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Ruler_BotTick", Vector((ax - 0.35, by, 0.5)), Vector((ax + 0.35, by, 0.5)), 0.08, 0.08, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Arrow_Head_L", Vector((ax - 0.35, by, bh - 0.7)), Vector((ax, by, bh)), 0.08, 0.08, mat_chalk))
    bldg_objs.append(add_beam(col, "Height_Arrow_Head_R", Vector((ax + 0.35, by, bh - 0.7)), Vector((ax, by, bh)), 0.08, 0.08, mat_chalk))'''

content = content.replace(OLD_SKYSCRAPER, NEW_SKYSCRAPER)

# 4. Travelling Block & Swivel in build_spindletop_derrick
OLD_DERRICK_END = '''    # Cast iron rotary table on rig deck (X=0, Y=0.85, Z=0.45)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.92, depth=0.18, location=(0.0, 0.85, 0.45))
    rt = bpy.context.active_object
    rt.name = "Rotary_Table"
    rt.data.materials.append(mat_iron)
    objs.append(rt)

    return objs'''

NEW_DERRICK_END = '''    # Cast iron rotary table on rig deck (X=0, Y=0.85, Z=0.45)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.92, depth=0.18, location=(0.0, 0.85, 0.45))
    rt = bpy.context.active_object
    rt.name = "Rotary_Table"
    rt.data.materials.append(mat_iron)
    objs.append(rt)

    # Steel Travelling Block & Swivel (Shot 03 Interior Worm\'s-Eye Uplook)
    mat_steel_tb = make_simple_mat("Rig_Travelling_Block", (0.22, 0.22, 0.25), roughness=0.35, metallic=0.92)
    mat_brass_sw = make_simple_mat("Rig_Swivel_Brass", (0.75, 0.60, 0.22), roughness=0.30, metallic=0.90)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.85, 12.5))
    tb = bpy.context.active_object
    tb.name = "Derrick_Travelling_Block"
    tb.scale = (0.65, 0.55, 1.4)
    tb.data.materials.append(mat_steel_tb)
    objs.append(tb)

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.28, depth=0.8, location=(0.0, 0.85, 11.2))
    sw = bpy.context.active_object
    sw.name = "Drilling_Swivel"
    sw.data.materials.append(mat_brass_sw)
    objs.append(sw)

    # 4 Steel Hoisting Cables
    for wx, wy in ((-0.25, 0.70), (0.25, 0.70), (-0.25, 1.00), (0.25, 1.00)):
        objs.append(add_beam(col, f"Hoist_Cable_{wx}_{wy}", Vector((wx, wy, 12.5)), Vector((wx, wy, 17.8)), 0.03, 0.03, mat_steel_tb))

    # Animate travelling block descending
    tb.location = (0.0, 0.85, 14.5)
    tb.keyframe_insert(data_path="location", frame=1)
    tb.location = (0.0, 0.85, 5.2)
    tb.keyframe_insert(data_path="location", frame=540)
    sw.location = (0.0, 0.85, 13.2)
    sw.keyframe_insert(data_path="location", frame=1)
    sw.location = (0.0, 0.85, 3.9)
    sw.keyframe_insert(data_path="location", frame=540)

    return objs'''

content = content.replace(OLD_DERRICK_END, NEW_DERRICK_END)

# 5. Radial Pressure Rings in build_drill_string_and_mud_vfx
OLD_MUD_ARROWS = '''    # 2D Chalk Directional Pressure Arrows (Shot 02: frames 145..240)
    arrows = []
    mat_chalk = make_simple_mat("Chalk_Arrow", (1.0, 1.0, 1.0), roughness=0.1, emission=4.5)
    for az in (-2.5, -4.8, -7.2):
        for sign, side in ((-1, "L"), (1, "R")):
            ax = sign * 0.95
            ay = 0.85
            l_shaft = add_beam(col, f"MudArrow_Shaft_{az}_{side}", Vector((ax, ay, az)), Vector((ax + sign * 0.75, ay, az)), 0.12, 0.12, mat_chalk)
            l_head_t = add_beam(col, f"MudArrow_HeadT_{az}_{side}", Vector((ax + sign * 0.75, ay, az)), Vector((ax + sign * 0.45, ay, az + 0.28)), 0.10, 0.10, mat_chalk)
            l_head_b = add_beam(col, f"MudArrow_HeadB_{az}_{side}", Vector((ax + sign * 0.75, ay, az)), Vector((ax + sign * 0.45, ay, az - 0.28)), 0.10, 0.10, mat_chalk)
            arrows.extend([l_shaft, l_head_t, l_head_b])

    set_vis(arrows, 1, False)
    set_vis(arrows, 145, True)
    set_vis(arrows, 240, False)'''

NEW_MUD_ARROWS = '''    # 2D Chalk Directional Pressure Arrows + Pulsing Radial Pressure Wave Rings (Shot 02: 145..240)
    arrows = []
    mat_chalk = make_simple_mat("Chalk_Arrow", (1.0, 1.0, 1.0), roughness=0.1, emission=4.5)
    mat_ring = make_simple_mat("Pressure_Wave_Ring", (0.9, 0.95, 1.0), roughness=0.1, emission=3.5)

    # Pulsing pressure rings expanding radially into the borehole wall
    for rz in (-2.0, -4.5, -7.0, -9.5):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.75, minor_radius=0.035, location=(0.0, 0.85, rz))
        rg = bpy.context.active_object
        rg.name = f"Pressure_Ring_{rz}"
        rg.data.materials.append(mat_ring)
        for f in range(145, 241, 8):
            sc = 1.0 + 0.32 * math.sin((f - 145) * 0.45 + rz)
            rg.scale = (sc, sc, 1.0)
            rg.keyframe_insert(data_path="scale", frame=f)
        arrows.append(rg)

    for az in (-2.5, -4.8, -7.2):
        for sign, side in ((-1, "L"), (1, "R")):
            ax = sign * 0.95
            ay = 0.85
            l_shaft = add_beam(col, f"MudArrow_Shaft_{az}_{side}", Vector((ax, ay, az)), Vector((ax + sign * 0.75, ay, az)), 0.12, 0.12, mat_chalk)
            l_head_t = add_beam(col, f"MudArrow_HeadT_{az}_{side}", Vector((ax + sign * 0.75, ay, az)), Vector((ax + sign * 0.45, ay, az + 0.28)), 0.10, 0.10, mat_chalk)
            l_head_b = add_beam(col, f"MudArrow_HeadB_{az}_{side}", Vector((ax + sign * 0.75, ay, az)), Vector((ax + sign * 0.45, ay, az - 0.28)), 0.10, 0.10, mat_chalk)
            arrows.extend([l_shaft, l_head_t, l_head_b])

    # Drill pipe tool joint collars
    for cz in (-22.0, -13.0, -4.0, 5.0, 14.0):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.32, depth=0.45, location=(0.0, 0.85, cz))
        col_obj = bpy.context.active_object
        col_obj.name = f"Pipe_Tool_Collar_{cz}"
        for p in col_obj.data.polygons:
            p.use_smooth = True
        col_obj.data.materials.append(mat_steel)
        arrows.append(col_obj)

    set_vis(arrows, 1, False)
    set_vis(arrows, 145, True)
    set_vis(arrows, 240, False)'''

content = content.replace(OLD_MUD_ARROWS, NEW_MUD_ARROWS)

# 6. BOP Cellar Enhancement: Twin Hydraulic Actuators & Nitrile Rubber Seals
OLD_BOP = '''    # 2. Left and Right Hydraulic Ram Blocks (Clamping shut horizontally)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.95, 0.85, bop_z))
    ram_l = bpy.context.active_object
    ram_l.name = "BOP_Ram_Left"
    ram_l.scale = (0.85, 0.75, 0.55)
    ram_l.data.materials.append(mat_ram)
    objs.append(ram_l)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.95, 0.85, bop_z))
    ram_r = bpy.context.active_object
    ram_r.name = "BOP_Ram_Right"
    ram_r.scale = (0.85, 0.75, 0.55)
    ram_r.data.materials.append(mat_ram)
    objs.append(ram_r)'''

NEW_BOP = '''    # 2. Hydraulic Actuation Cylinders & Pipe Notch Ram Jaws with Nitrile Rubber Seals
    mat_seal = make_simple_mat("BOP_Nitrile_Seal", (0.02, 0.02, 0.02), roughness=0.85)

    for sign, sname in ((-1, "Left"), (1, "Right")):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.45, depth=1.4, location=(sign * 1.65, 0.85, bop_z), rotation=(0, math.radians(90), 0))
        cyl = bpy.context.active_object
        cyl.name = f"BOP_Cylinder_{sname}"
        cyl.data.materials.append(mat_casing)
        objs.append(cyl)

        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.14, depth=1.0, location=(sign * 0.95, 0.85, bop_z), rotation=(0, math.radians(90), 0))
        rod = bpy.context.active_object
        rod.name = f"BOP_Pushrod_{sname}"
        rod.data.materials.append(mat_ram)
        objs.append(rod)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.82, 0.85, bop_z))
    ram_l = bpy.context.active_object
    ram_l.name = "BOP_Ram_Left"
    ram_l.scale = (0.65, 0.75, 0.55)
    ram_l.data.materials.append(mat_ram)
    objs.append(ram_l)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.46, 0.85, bop_z))
    seal_l = bpy.context.active_object
    seal_l.name = "BOP_Seal_Left"
    seal_l.scale = (0.08, 0.68, 0.48)
    seal_l.data.materials.append(mat_seal)
    objs.append(seal_l)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.82, 0.85, bop_z))
    ram_r = bpy.context.active_object
    ram_r.name = "BOP_Ram_Right"
    ram_r.scale = (0.65, 0.75, 0.55)
    ram_r.data.materials.append(mat_ram)
    objs.append(ram_r)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.46, 0.85, bop_z))
    seal_r = bpy.context.active_object
    seal_r.name = "BOP_Seal_Right"
    seal_r.scale = (0.08, 0.68, 0.48)
    seal_r.data.materials.append(mat_seal)
    objs.append(seal_r)'''

content = content.replace(OLD_BOP, NEW_BOP)

# 7. Prairie Turf Overhang Lip & Utility Power Poles
OLD_PRAIRIE_END = '''    return cut_objs'''
NEW_PRAIRIE_END = '''    # 3D Prairie Turf Lip Overhang along cutaway edge (Z = 0.15)
    mat_turf = make_simple_mat("Prairie_Turf_Lip", (0.38, 0.34, 0.18), roughness=0.88)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, -0.55, 0.12))
    lip = bpy.context.active_object
    lip.name = "Prairie_Turf_Lip_Edge"
    lip.scale = (40.0, 0.22, 0.16)
    lip.data.materials.append(mat_turf)
    cut_objs.append(lip)

    # Wooden Utility Power Poles with Cross-Arms strung across field
    mat_pole = make_creosote_timber_mat()
    for px, py in ((-12.0, 8.0), (4.0, 14.0), (18.0, 22.0)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.14, depth=6.5, location=(px, py, 3.25))
        pol = bpy.context.active_object
        pol.name = f"Utility_Pole_{px}"
        pol.data.materials.append(mat_pole)
        cut_objs.append(pol)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, py, 6.1))
        arm = bpy.context.active_object
        arm.name = f"Utility_Arm_{px}"
        arm.scale = (1.8, 0.12, 0.12)
        arm.data.materials.append(mat_pole)
        cut_objs.append(arm)

    return cut_objs'''

content = content.replace(OLD_PRAIRIE_END, NEW_PRAIRIE_END)

V4_PATH.write_text(content, encoding="utf-8")
print(f"[OK] Upgraded V4 saved to {V4_PATH} ({len(content)} bytes)")
