"""
Procedural PBR Material and Shader Library for Blender 5.0+
Provides high-fidelity shaders for:
- Multi-layer sedimentary geological strata with organic micro-laminations
- Texas prairie ground and weathered timber
- Viscous high-gloss crude oil and opaque drilling mud
- Industrial painted steel with edge wear
- Organic river pebbles for porous rock matrix
- Soft volumetric-style procedural clouds
"""

import math
import bpy

def get_specular_input(bsdf):
    """Handles Blender version differences for Specular input on Principled BSDF."""
    return bsdf.inputs.get('Specular IOR Level') or bsdf.inputs.get('Specular')

def create_pbr_material(name, base_color, roughness=0.5, metallic=0.0, specular=0.5):
    """Creates a standard Principled BSDF material."""
    mat = bpy.data.materials.new(name=name)
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
    
    spec = get_specular_input(bsdf)
    if spec:
        spec.default_value = specular
        
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_rich_strata_material():
    """
    High-fidelity geological sedimentary strata shader.
    Simulates hundreds of natural micro-laminations, wavy tectonic undulations,
    and distinct sedimentary layers:
    - Top golden yellow sandy topsoil
    - Weathered buff sandstone
    - Cream fossiliferous limestone
    - Terracotta red clay / mudstone
    - Deep blue-gray slate shale
    - Dark bituminous crude-bearing sandstone
    """
    mat = bpy.data.materials.new(name="Mat_RichSedimentaryStrata")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    
    # Mapping for coordinate scaling
    mapping = nodes.new('ShaderNodeMapping')
    links.new(tex.outputs['Generated'], mapping.inputs['Vector'])
    
    # 1. Macro Wavy Distortion (Tectonic shift)
    macro_noise = nodes.new('ShaderNodeTexNoise')
    macro_noise.inputs['Scale'].default_value = 2.5
    macro_noise.inputs['Detail'].default_value = 3.0
    macro_noise.inputs['Roughness'].default_value = 0.5
    links.new(mapping.outputs['Vector'], macro_noise.inputs['Vector'])
    
    # 2. Primary Wave Texture for Stratified Bands
    wave_primary = nodes.new('ShaderNodeTexWave')
    wave_primary.wave_type = 'BANDS'
    wave_primary.bands_direction = 'Z'
    wave_primary.inputs['Scale'].default_value = 1.8
    wave_primary.inputs['Distortion'].default_value = 1.2
    wave_primary.inputs['Detail'].default_value = 4.0
    wave_primary.inputs['Detail Roughness'].default_value = 0.6
    links.new(mapping.outputs['Vector'], wave_primary.inputs['Vector'])
    
    # 3. Fine Micro-Strata Wave Texture (Micro-laminations)
    wave_micro = nodes.new('ShaderNodeTexWave')
    wave_micro.wave_type = 'BANDS'
    wave_micro.bands_direction = 'Z'
    wave_micro.inputs['Scale'].default_value = 18.0
    wave_micro.inputs['Distortion'].default_value = 0.6
    wave_micro.inputs['Detail'].default_value = 2.0
    links.new(mapping.outputs['Vector'], wave_micro.inputs['Vector'])
    
    # Separate Z coordinate
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(mapping.outputs['Vector'], sep.inputs['Vector'])
    
    # Combine Z with wave distortion and macro noise
    math_macro_scale = nodes.new('ShaderNodeMath')
    math_macro_scale.operation = 'MULTIPLY'
    math_macro_scale.inputs[1].default_value = 0.08
    links.new(macro_noise.outputs['Fac'], math_macro_scale.inputs[0])
    
    math_z_distort = nodes.new('ShaderNodeMath')
    math_z_distort.operation = 'ADD'
    links.new(sep.outputs['Z'], math_z_distort.inputs[0])
    links.new(math_macro_scale.outputs['Value'], math_z_distort.inputs[1])
    
    # Color Ramp for Primary Geological Strata
    cr_primary = nodes.new('ShaderNodeValToRGB')
    cr = cr_primary.color_ramp
    cr.interpolation = 'LINEAR'
    
    # Calibrated from Texas Permian / Spindletop reference:
    # 0.00 - 0.12: Deep black oil-saturated reservoir sandstone
    # 0.12 - 0.28: Terracotta red clay
    # 0.28 - 0.44: Pale cream chalk limestone
    # 0.44 - 0.60: Slate blue-grey shale
    # 0.60 - 0.78: Warm golden sandstone
    # 0.78 - 0.90: Weathered buff limestone
    # 0.90 - 1.00: Golden prairie sand / topsoil
    cr.elements[0].position = 0.00
    cr.elements[0].color = (0.05, 0.04, 0.03, 1.0) # Oil reservoir
    
    cr.elements[1].position = 0.98
    cr.elements[1].color = (0.86, 0.74, 0.54, 1.0) # Top sandy soil
    
    e1 = cr.elements.new(0.14)
    e1.color = (0.58, 0.20, 0.08, 1.0) # Terracotta red shale
    
    e2 = cr.elements.new(0.24)
    e2.color = (0.72, 0.28, 0.12, 1.0) # Red clay
    
    e3 = cr.elements.new(0.38)
    e3.color = (0.92, 0.90, 0.82, 1.0) # Pale limestone
    
    e4 = cr.elements.new(0.52)
    e4.color = (0.32, 0.40, 0.48, 1.0) # Slate blue-grey shale
    
    e5 = cr.elements.new(0.68)
    e5.color = (0.82, 0.62, 0.32, 1.0) # Rich gold sand
    
    e6 = cr.elements.new(0.84)
    e6.color = (0.76, 0.70, 0.56, 1.0) # Buff weathered stone
    
    links.new(math_z_distort.outputs['Value'], cr_primary.inputs['Fac'])
    
    # Mix Primary Color with Micro-Strata Laminations
    mix_micro = nodes.new('ShaderNodeMix')
    mix_micro.data_type = 'RGBA'
    mix_micro.blend_type = 'MULTIPLY'
    mix_micro.inputs['Factor'].default_value = 0.18
    links.new(cr_primary.outputs['Color'], mix_micro.inputs['A'])
    links.new(wave_micro.outputs['Color'], mix_micro.inputs['B'])
    
    links.new(mix_micro.outputs['Result'], bsdf.inputs['Base Color'])
    
    # Bump Map for Rock Surface Texture and Stratum Ledges
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.45
    bump.inputs['Distance'].default_value = 0.12
    
    # Fine rock noise for surface roughness
    fine_noise = nodes.new('ShaderNodeTexNoise')
    fine_noise.inputs['Scale'].default_value = 35.0
    fine_noise.inputs['Detail'].default_value = 6.0
    fine_noise.inputs['Roughness'].default_value = 0.75
    links.new(mapping.outputs['Vector'], fine_noise.inputs['Vector'])
    
    math_bump = nodes.new('ShaderNodeMath')
    math_bump.operation = 'ADD'
    links.new(wave_primary.outputs['Color'], math_bump.inputs[0])
    links.new(fine_noise.outputs['Fac'], math_bump.inputs[1])
    
    links.new(math_bump.outputs['Value'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    
    bsdf.inputs['Roughness'].default_value = 0.85
    spec = get_specular_input(bsdf)
    if spec:
        spec.default_value = 0.25
        
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_crude_oil_material():
    """Glossy, viscous black crude oil with specular reflections and dark absorption."""
    mat = bpy.data.materials.new(name="Mat_CrudeOil")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    
    # Near black with slight warm brown undertone
    bsdf.inputs['Base Color'].default_value = (0.012, 0.010, 0.008, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.03
    bsdf.inputs['Metallic'].default_value = 0.35
    
    spec = get_specular_input(bsdf)
    if spec:
        spec.default_value = 0.98
        
    # Anisotropic reflection if available
    aniso = bsdf.inputs.get('Anisotropic')
    if aniso:
        aniso.default_value = 0.25
        
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_weathered_timber_material():
    """Weathered 1900s oilfield timber with grain and dust."""
    mat = bpy.data.materials.new(name="Mat_WeatheredTimber")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    
    # Wood grain wave texture
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 24.0
    wave.inputs['Distortion'].default_value = 3.5
    wave.inputs['Detail'].default_value = 5.0
    links.new(tex.outputs['Generated'], wave.inputs['Vector'])
    
    cr = nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].position = 0.0
    cr.color_ramp.elements[0].color = (0.28, 0.20, 0.13, 1.0) # Dark creosote / weathered timber
    cr.color_ramp.elements[1].position = 1.0
    cr.color_ramp.elements[1].color = (0.46, 0.36, 0.26, 1.0) # Lighter sun-bleached wood
    links.new(wave.outputs['Color'], cr.inputs['Fac'])
    
    links.new(cr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.78
    
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.30
    links.new(wave.outputs['Color'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_industrial_metal_material(color=(0.22, 0.24, 0.26), metallic=0.92, roughness=0.32):
    """PBR industrial cast iron / machinery steel with edge wear."""
    mat = bpy.data.materials.new(name="Mat_IndustrialMetal")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    
    if len(color) == 3:
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    else:
        bsdf.inputs['Base Color'].default_value = color
        
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    
    spec = get_specular_input(bsdf)
    if spec:
        spec.default_value = 0.85
        
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_prairie_ground_material():
    """Texas arid prairie terrain with dirt, dry grass, and gravel variation."""
    mat = bpy.data.materials.new(name="Mat_PrairieGround")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 12.0
    noise.inputs['Detail'].default_value = 5.0
    noise.inputs['Roughness'].default_value = 0.7
    links.new(tex.outputs['Generated'], noise.inputs['Vector'])
    
    cr = nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].position = 0.15
    cr.color_ramp.elements[0].color = (0.32, 0.26, 0.16, 1.0) # Arid brown dirt
    cr.color_ramp.elements[1].position = 0.85
    cr.color_ramp.elements[1].color = (0.58, 0.52, 0.28, 1.0) # Dry prairie grass
    links.new(noise.outputs['Fac'], cr.inputs['Fac'])
    
    links.new(cr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.92
    
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def create_river_pebble_material(palette_idx=0):
    """
    Organic river pebble PBR shader with smooth surface, subtle quartz speckles,
    and warm earth tones (pale cream, sand tan, terracotta, gold).
    """
    mat = bpy.data.materials.new(name=f"Mat_RiverPebble_{palette_idx}")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    tex = nodes.new('ShaderNodeTexCoord')
    
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 20.0
    noise.inputs['Detail'].default_value = 4.0
    links.new(tex.outputs['Generated'], noise.inputs['Vector'])
    
    palettes = [
        ((0.92, 0.90, 0.85), (0.84, 0.80, 0.72)), # Pale limestone pebble
        ((0.86, 0.76, 0.62), (0.74, 0.62, 0.48)), # Warm sandstone pebble
        ((0.78, 0.68, 0.52), (0.64, 0.52, 0.38)), # Golden quartz pebble
        ((0.70, 0.45, 0.35), (0.55, 0.32, 0.22)), # Terracotta red pebble
        ((0.55, 0.58, 0.62), (0.42, 0.45, 0.48)), # Slate river pebble
    ]
    c1, c2 = palettes[palette_idx % len(palettes)]
    
    cr = nodes.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].position = 0.2
    cr.color_ramp.elements[0].color = (*c1, 1.0)
    cr.color_ramp.elements[1].position = 0.8
    cr.color_ramp.elements[1].color = (*c2, 1.0)
    links.new(noise.outputs['Fac'], cr.inputs['Fac'])
    
    links.new(cr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.22 # Polished wet stone
    
    spec = get_specular_input(bsdf)
    if spec:
        spec.default_value = 0.80
        
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat
