import bpy
import math
import os

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

scene.render.resolution_x = 1080
scene.render.resolution_y = 1920
scene.render.resolution_percentage = 100

# Eevee Next
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except:
    scene.render.engine = 'BLENDER_EEVEE'
    
if hasattr(scene, 'eevee'):
    scene.eevee.taa_render_samples = 16

# 1. Poly Haven HDRI Sky
world = bpy.data.worlds.new("HdriWorld")
scene.world = world
world.use_nodes = True
wnodes = world.node_tree.nodes
wlinks = world.node_tree.links
wnodes.clear()

bg = wnodes.new('ShaderNodeBackground')
bg.inputs['Strength'].default_value = 1.2
env = wnodes.new('ShaderNodeTexEnvironment')
hdr_path = "/tmp/test_sky.hdr"
if os.path.exists(hdr_path):
    env.image = bpy.data.images.load(hdr_path)
    wlinks.new(env.outputs['Color'], bg.inputs['Color'])
else:
    bg.inputs['Color'].default_value = (0.35, 0.58, 0.88, 1.0)
out_world = wnodes.new('ShaderNodeOutputWorld')
wlinks.new(bg.outputs['Background'], out_world.inputs['Surface'])

# Sunlight matching HDRI
bpy.ops.object.light_add(type='SUN', location=(10, -15, 20))
sun = bpy.context.active_object
sun.data.energy = 4.0
sun.data.color = (1.0, 0.98, 0.92)
sun.rotation_euler = (math.radians(55), math.radians(15), math.radians(-35))

# 2. Rock Cliff PBR Material with photo texture + procedural strata overlay
mat_rock = bpy.data.materials.new(name="Mat_CliffPhotoStrata")
mat_rock.use_nodes = True
rnodes = mat_rock.node_tree.nodes
rlinks = mat_rock.node_tree.links
rnodes.clear()

r_out = rnodes.new('ShaderNodeOutputMaterial')
r_bsdf = rnodes.new('ShaderNodeBsdfPrincipled')
r_texcoord = rnodes.new('ShaderNodeTexCoord')

# Photo texture
r_img = rnodes.new('ShaderNodeTexImage')
tex_path = "/tmp/cliff_diff.jpg"
if os.path.exists(tex_path):
    r_img.image = bpy.data.images.load(tex_path)
    rlinks.new(r_texcoord.outputs['Generated'], r_img.inputs['Vector'])

# Procedural sedimentary bands
r_wave = rnodes.new('ShaderNodeTexWave')
r_wave.wave_type = 'BANDS'
r_wave.bands_direction = 'Z'
r_wave.inputs['Scale'].default_value = 6.0
r_wave.inputs['Distortion'].default_value = 1.8
rlinks.new(r_texcoord.outputs['Generated'], r_wave.inputs['Vector'])

r_ramp = rnodes.new('ShaderNodeValToRGB')
r_cr = rramp = r_ramp.color_ramp
r_cr.elements[0].position = 0.05
r_cr.elements[0].color = (0.85, 0.72, 0.52, 1.0) # Sandstone
r_cr.elements[1].position = 0.95
r_cr.elements[1].color = (0.92, 0.90, 0.84, 1.0) # Limestone
e1 = r_cr.elements.new(0.22)
e1.color = (0.65, 0.28, 0.16, 1.0) # Red clay
e2 = r_cr.elements.new(0.50)
e2.color = (0.35, 0.42, 0.50, 1.0) # Blue shale
e3 = r_cr.elements.new(0.75)
e3.color = (0.80, 0.55, 0.25, 1.0) # Gold sand

# Mix photo texture with strata bands
r_mix = rnodes.new('ShaderNodeMix')
r_mix.data_type = 'RGBA'
r_mix.blend_type = 'MULTIPLY'
r_mix.inputs['Factor'].default_value = 0.65
if os.path.exists(tex_path):
    rlinks.new(r_img.outputs['Color'], r_mix.inputs[6])
else:
    r_mix.inputs[6].default_value = (0.8, 0.8, 0.8, 1.0)
rlinks.new(r_ramp.outputs['Color'], r_mix.inputs[7])

rlinks.new(r_mix.outputs[2], r_bsdf.inputs['Base Color'])
r_bsdf.inputs['Roughness'].default_value = 0.85

# Bump from wave + photo
r_bump = rnodes.new('ShaderNodeBump')
r_bump.inputs['Strength'].default_value = 0.5
rlinks.new(r_wave.outputs['Color'], r_bump.inputs['Height'])
rlinks.new(r_bump.outputs['Normal'], r_bsdf.inputs['Normal'])

rlinks.new(r_bsdf.outputs['BSDF'], r_out.inputs['Surface'])

# 3. Corner V-Cut Terrain (Matching Mildly Elsewhere frame 2 & 14)
# Left rock block
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.5, 4.5, -6.0))
rock_l = bpy.context.active_object
rock_l.scale = (8.0, 8.0, 12.0)
rock_l.rotation_euler = (0, 0, math.radians(-15))
rock_l.data.materials.append(mat_rock)

# Right rock block meeting at an inside corner
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(4.5, 4.5, -6.0))
rock_r = bpy.context.active_object
rock_r.scale = (8.0, 8.0, 12.0)
rock_r.rotation_euler = (0, 0, math.radians(15))
rock_r.data.materials.append(mat_rock)

# Surface ground
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 8.0, 0.05))
ground = bpy.context.active_object
ground.scale = (24.0, 16.0, 0.1)
mat_ground = bpy.data.materials.new("Mat_Ground")
mat_ground.use_nodes = True
ground_bsdf = mat_ground.node_tree.nodes.get('Principled BSDF')
ground_bsdf.inputs['Base Color'].default_value = (0.42, 0.50, 0.28, 1.0)
ground_bsdf.inputs['Roughness'].default_value = 0.95
ground.data.materials.append(mat_ground)

# 4. Detailed Timber Derrick with Cross-Bracing (X-trusses)
mat_wood = bpy.data.materials.new("Mat_TimberDark")
mat_wood.use_nodes = True
w_bsdf = mat_wood.node_tree.nodes.get('Principled BSDF')
w_bsdf.inputs['Base Color'].default_value = (0.28, 0.20, 0.14, 1.0)
w_bsdf.inputs['Roughness'].default_value = 0.7

# 4 main corner legs
legs = [
    ((-1.4, -0.2, 0.0), (-0.4, 0.8, 9.0)),
    (( 1.4, -0.2, 0.0), ( 0.4, 0.8, 9.0)),
    (( 1.4,  2.6, 0.0), ( 0.4, 1.6, 9.0)),
    ((-1.4,  2.6, 0.0), (-0.4, 1.6, 9.0))
]
for start, end in legs:
    mid = ((start[0]+end[0])/2, (start[1]+end[1])/2, (start[2]+end[2])/2)
    dz, dx, dy = end[2]-start[2], end[0]-start[0], end[1]-start[1]
    length = math.sqrt(dx*dx + dy*dy + dz*dz)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=length, location=mid)
    leg = bpy.context.active_object
    leg.data.materials.append(mat_wood)
    leg.rotation_euler = (math.atan2(dy, dz), -math.atan2(dx, dz), 0)

# Multi-tier cross-girts and X-braces
tiers = [1.8, 3.6, 5.4, 7.2, 8.8]
for i in range(len(tiers) - 1):
    z1 = tiers[i]
    z2 = tiers[i+1]
    t1 = z1 / 9.0
    t2 = z2 / 9.0
    w1 = 1.4 * (1 - t1) + 0.4 * t1
    w2 = 1.4 * (1 - t2) + 0.4 * t2
    
    # Horizontal girt at z1
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 1.2, z1))
    g = bpy.context.active_object
    g.scale = (w1 * 2, w1 * 1.8, 0.08)
    g.data.materials.append(mat_wood)
    
    # Front X brace between z1 and z2
    # Diagonal 1
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=math.sqrt((w1+w2)**2 + (z2-z1)**2), location=(0, 1.2 - (w1+w2)*0.45, (z1+z2)/2))
    d1 = bpy.context.active_object
    d1.data.materials.append(mat_wood)
    d1.rotation_euler = (0, math.atan2(w1+w2, z2-z1), 0)
    # Diagonal 2
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=math.sqrt((w1+w2)**2 + (z2-z1)**2), location=(0, 1.2 - (w1+w2)*0.45, (z1+z2)/2))
    d2 = bpy.context.active_object
    d2.data.materials.append(mat_wood)
    d2.rotation_euler = (0, -math.atan2(w1+w2, z2-z1), 0)

# Wooden shack on left (matching frame 2)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.2, 2.0, 1.0))
shack = bpy.context.active_object
shack.scale = (2.4, 2.0, 1.8)
shack.data.materials.append(mat_wood)

# Wooden roof of shack
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-4.2, 2.0, 2.0))
roof = bpy.context.active_object
roof.scale = (2.6, 2.2, 0.1)
roof.rotation_euler = (0, math.radians(10), 0)
roof.data.materials.append(mat_wood)

# Water / Oil tank on right (matching frame 2)
bpy.ops.mesh.primitive_cylinder_add(radius=1.1, depth=2.0, location=(4.4, 2.5, 1.0))
tank = bpy.context.active_object
tank.data.materials.append(mat_wood)

# 5. Oil Gusher Eruption (Violent black fountain with spray drops)
mat_crude = bpy.data.materials.new("Mat_Crude")
mat_crude.use_nodes = True
c_bsdf = mat_crude.node_tree.nodes.get('Principled BSDF')
c_bsdf.inputs['Base Color'].default_value = (0.01, 0.01, 0.012, 1.0)
c_bsdf.inputs['Roughness'].default_value = 0.05
c_bsdf.inputs['Specular IOR Level'].default_value = 0.95

# Main jet column
bpy.ops.mesh.primitive_cylinder_add(radius=0.55, depth=18.0, location=(0, 1.2, 9.0))
jet = bpy.context.active_object
jet.scale = (1.0, 1.0, 1.0)
jet.data.materials.append(mat_crude)

# Spray droplets / cloud around gusher top
import random
random.seed(42)
for _ in range(45):
    sx = random.uniform(-1.5, 1.5)
    sy = random.uniform(-0.5, 2.5)
    sz = random.uniform(8.0, 18.0)
    srad = random.uniform(0.1, 0.35)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=srad, location=(sx, sy, sz))
    drop = bpy.context.active_object
    drop.scale = (1.0, 1.0, random.uniform(1.5, 2.5))
    drop.data.materials.append(mat_crude)

# Wellhead cutaway slot running down the center corner
bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=13.0, location=(0, 0.8, -6.5))
pipe = bpy.context.active_object
pipe.data.materials.append(mat_crude)

# 6. Camera - Centered Front Perspective Matching Frame 2
bpy.ops.object.camera_add(location=(0, -20.0, 1.5))
cam = bpy.context.active_object
cam.rotation_euler = (math.radians(84), 0, 0)
cam.data.lens = 45
bpy.context.scene.camera = cam

# Render single frame
output_path = "/Users/laheri/.gemini/antigravity/brain/b57e3de4-69d8-4c4f-810f-a9204584591e/scratch/high_fidelity_test.jpg"
scene.render.filepath = output_path
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 95

bpy.ops.render.render(write_still=True)
print("Rendered high-fidelity test frame to", output_path)
