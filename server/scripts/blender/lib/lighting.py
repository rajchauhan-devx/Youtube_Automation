"""
Lighting & World Environment Presets for Blender 5.0+ Explainer Scenes
Provides calibrated, studio-quality lighting for:
- Daylight Texas prairie and cutaway
- Worm's-eye derrick interior work-light
- Subterranean cross-section & borehole fill
- Macro pebble specular studio
"""

import math
import bpy

def setup_world_background(scene, color=(0.04, 0.24, 0.56), strength=1.1):
    """Configures the world background color and strength."""
    world = scene.world
    if not world:
        world = bpy.data.worlds.new("ExplainerWorld")
        scene.world = world
        
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (*color, 1.0) if len(color) == 3 else color
    bg.inputs['Strength'].default_value = strength
    
    out = nodes.new('ShaderNodeOutputWorld')
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    return world

def setup_lighting(scene, env_type="daylight"):
    """
    Sets up studio-calibrated key, fill, and rim lighting based on scene context.
    """
    if env_type == "daylight":
        # Texas prairie clear afternoon sky: sRGB ~ [25, 125, 195]
        setup_world_background(scene, color=(0.02, 0.20, 0.48), strength=1.0)
        
        # Key Sun: Warm golden sunlight
        bpy.ops.object.light_add(type='SUN', location=(10.0, -14.0, 16.0))
        sun = bpy.context.active_object
        sun.name = "Key_Sun"
        sun.data.energy = 3.8
        sun.data.color = (1.0, 0.97, 0.91)
        sun.rotation_euler = (math.radians(55), math.radians(12), math.radians(-32))
        
        # Fill Sun: Sky bounce from left
        bpy.ops.object.light_add(type='SUN', location=(-9.0, -10.0, 10.0))
        fill = bpy.context.active_object
        fill.name = "Fill_Sun"
        fill.data.energy = 1.4
        fill.data.color = (0.65, 0.82, 1.0)
        fill.rotation_euler = (math.radians(68), math.radians(-12), math.radians(28))
        
    elif env_type == "twilight_derrick":
        # Deep blue sky dome
        setup_world_background(scene, color=(0.012, 0.045, 0.16), strength=0.9)
        
        # Rig floor work-light spotlight pointing UP through the center of the derrick
        bpy.ops.object.light_add(type='SPOT', location=(0.0, 1.55, 0.2))
        spot = bpy.context.active_object
        spot.name = "Rig_Floor_Uplight"
        spot.data.energy = 280.0
        spot.data.spot_size = math.radians(75)
        spot.data.spot_blend = 0.4
        spot.data.color = (1.0, 0.95, 0.85) # Warm halogen incandescent
        spot.rotation_euler = (0, 0, 0) # Points straight UP along +Z
        
        # Soft ambient fill
        bpy.ops.object.light_add(type='POINT', location=(0.0, 1.55, 4.5))
        pt = bpy.context.active_object
        pt.name = "Derrick_Mid_Fill"
        pt.data.energy = 65.0
        pt.data.color = (0.75, 0.88, 1.0)
        
    elif env_type == "underground_studio":
        # High-visibility directional lighting for cross-sections
        setup_world_background(scene, color=(0.015, 0.018, 0.025), strength=0.5)
        
        bpy.ops.object.light_add(type='SUN', location=(6.0, -12.0, -2.0))
        sun = bpy.context.active_object
        sun.name = "Cutaway_Key"
        sun.data.energy = 3.4
        sun.data.color = (1.0, 0.95, 0.88)
        sun.rotation_euler = (math.radians(65), math.radians(10), math.radians(-24))
        
        bpy.ops.object.light_add(type='POINT', location=(0.0, -4.5, -4.0))
        pt = bpy.context.active_object
        pt.name = "Cutaway_Fill"
        pt.data.energy = 120.0
        pt.data.color = (0.85, 0.90, 1.0)
        
    elif env_type == "macro_studio":
        # Micro pebble specular studio lighting
        setup_world_background(scene, color=(0.012, 0.012, 0.018), strength=0.4)
        
        # Key Rim Light
        bpy.ops.object.light_add(type='POINT', location=(2.2, -2.8, 1.6))
        p1 = bpy.context.active_object
        p1.name = "Macro_Key"
        p1.data.energy = 180.0
        p1.data.color = (1.0, 0.98, 0.94)
        
        # Secondary Fill Light
        bpy.ops.object.light_add(type='POINT', location=(-2.2, -2.8, -1.4))
        p2 = bpy.context.active_object
        p2.name = "Macro_Fill"
        p2.data.energy = 110.0
        p2.data.color = (0.82, 0.90, 1.0)
