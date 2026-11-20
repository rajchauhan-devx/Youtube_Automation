"""
Apply geometry alignment & cleanup fixes to scripts/render_texas_oil_recreation_v4.py:
  1. Align Hero Pumpjack wellhead with earth borehole cutaway at X = 0.0
     (Change base_loc from (-2.0, 0.45, 0.0) to (-0.85, 0.45, 0.0))
  2. Hide rotary drill pipe string during Pumpjack era (frames 1385..1790) to eliminate
     the cylinder floating in the sky in Shot 16
  3. Replace 2D oil plane in macro stage with 3D volume backdrop to eliminate
     the horizontal seam cutting across the pebbles in Shot 12-13
"""

from pathlib import Path

V4_PATH = Path(r"c:\Users\zrajc\OneDrive\Desktop\Youtube_Automation\Youtube_Automation\scripts\render_texas_oil_recreation_v4.py")
content = V4_PATH.read_text(encoding="utf-8")

# Fix 1: Hero Pumpjack alignment
content = content.replace(
    'hero_pj_objs = build_pumpjack_unit(col, "Hero_Pumpjack", Vector((-2.0, 0.45, 0.0)), phase_offset=0.0, f_start=1385, f_end=1790, scale=1.0)',
    'hero_pj_objs = build_pumpjack_unit(col, "Hero_Pumpjack", Vector((-0.85, 0.45, 0.0)), phase_offset=0.0, f_start=1385, f_end=1790, scale=1.0)'
)

# Fix 2: Hide drill pipe during pumpjack era
OLD_PIPE_VIS = '''    # 3. Rotating drill string, mud column, chalk arrows, falling sand
    pipe, mud, arrows, sand = build_drill_string_and_mud_vfx(col)'''

NEW_PIPE_VIS = '''    # 3. Rotating drill string, mud column, chalk arrows, falling sand
    pipe, mud, arrows, sand = build_drill_string_and_mud_vfx(col)
    set_vis([pipe] + ([sand] if isinstance(sand, list) else [sand]), 1, True)
    set_vis([pipe] + ([sand] if isinstance(sand, list) else [sand]), 1384, True)
    set_vis([pipe] + ([sand] if isinstance(sand, list) else [sand]), 1385, False)'''

content = content.replace(OLD_PIPE_VIS, NEW_PIPE_VIS)

# Fix 3: Macro stage 3D oil volume backdrop
OLD_OIL_PLANE = '''    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(origin.x, origin.y + 0.12, origin.z), rotation=(math.radians(90), 0, 0))
    oil_bed = bpy.context.active_object
    oil_bed.data.materials.append(mat_oil)
    objs.append(oil_bed)'''

NEW_OIL_PLANE = '''    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(origin.x, origin.y + 1.2, origin.z))
    oil_bed = bpy.context.active_object
    oil_bed.scale = (14.0, 3.5, 14.0)
    oil_bed.data.materials.append(mat_oil)
    objs.append(oil_bed)'''

content = content.replace(OLD_OIL_PLANE, NEW_OIL_PLANE)

V4_PATH.write_text(content, encoding="utf-8")
print("[OK] Applied alignment fixes to V4 generator.")
