import bpy, math

# ---------- materials ----------
def mat(name, color, rough=0.9, metal=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
    return m

M_JEANS = mat("M_Jeans", (0x3a/255, 0x5a/255, 0x8c/255), 0.95)
M_BLACK = mat("M_Black", (0x1b/255, 0x1d/255, 0x24/255), 0.9)
M_SKIN = mat("M_Skin", (0xe0/255, 0xb8/255, 0x94/255), 0.8)
M_BUCKLE = mat("M_Buckle", (0.95, 0.95, 0.95), 0.4, 0.7)
M_CAP = mat("M_Cap", (0.10, 0.11, 0.14), 0.85)

# ---------- helpers ----------
def meshify(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    return obj

def cyl(name, r1, r2, depth, mat, loc, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o

def box(name, sx, sy, sz, m, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    o.name = name
    o.data.materials.append(m)
    return o

def sphere(name, r, m, loc, seg=14, ring=10, squash=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = (1, 1, squash)
    bpy.ops.object.transform_apply(scale=True)
    o.name = name
    o.data.materials.append(m)
    return o

# ---------- character (facing +Z) ----------
# torso: a slightly barrel-chested jacket — the Prisma sales uniform
torso = cyl("Torso", 0.30, 0.26, 0.66, M_BLACK, (0, 0, 1.30), verts=14)
torso.scale = (1.15, 0.85, 1)
bpy.ops.object.transform_apply(scale=True)
# jacket hem
box("Hem", 0.62, 0.42, 0.10, M_BLACK, (0, 0, 1.02))
# collar
collar = cyl("Collar", 0.16, 0.19, 0.07, M_BLACK, (0, 0, 1.66), verts=12)

# jeans waist block (bulky — these are PRISMA 501s)
box("Waist", 0.56, 0.40, 0.22, M_JEANS, (0, 0, 0.88))
# hips flare
box("Hips", 0.52, 0.38, 0.12, M_JEANS, (0, 0, 0.78))
# belt
belt = cyl("Belt", 0.28, 0.28, 0.05, M_BLACK, (0, 0, 1.00), verts=14)
belt.scale = (1.1, 0.85, 1)
bpy.ops.object.transform_apply(scale=True)
# buckle
box("Buckle", 0.10, 0.03, 0.07, M_BUCKLE, (0, 0.26, 1.00))

# head — soft, slightly worried
head = sphere("Head", 0.175, M_SKIN, (0, 0, 1.79), squash=1.05)
# ears
for s in (-1, 1):
    ear = sphere(f"Ear_{s}", 0.045, M_SKIN, (s * 0.17, 0, 1.78), seg=8, ring=6)
    ear.scale = (0.6, 1, 1)
    bpy.ops.object.transform_apply(scale=True)
# cap: dome + brim over the +Z face (he always looks forward)
dome = sphere("CapDome", 0.185, M_CAP, (0, -0.015, 1.845), seg=14, ring=8)
dome.scale = (1.0, 1.02, 0.72)
bpy.ops.object.transform_apply(scale=True)
# cut the bottom half: just sink it and let the head poke below
dome.location.z = 1.86
brim = box("CapBrim", 0.24, 0.16, 0.025, M_CAP, (0, 0.20, 1.855))
# cap button
sphere("CapButton", 0.03, M_CAP, (0, -0.015, 1.99), seg=8, ring=6)

# ---------- legs (pivot groups at ±0.14, 0.7, 0 — game rotates group.rotation.x) ----------
def limb(name, parts):
    root = bpy.data.objects.new(f"ROOT_{name}", None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    return root

for s, side in ((-1, "L"), (1, "R")):
    # thigh+shin as one baggy jean cylinder (prisma jeans = wide), hanging DOWN from the hip pivot
    leg_c = cyl(f"Leg_{side}", 0.135, 0.155, 0.68, M_JEANS, (0, 0, -0.34), verts=10)
    # ankle cuff (the signature rolled hem)
    cuff = cyl(f"Cuff_{side}", 0.15, 0.15, 0.07, M_JEANS, (0, 0, -0.62), verts=10)
    # shoe — chunky, toes toward local -Y (front)
    shoe = box(f"Shoe_{side}", 0.21, 0.34, 0.11, M_BLACK, (0, -0.04, -0.665))
    root = limb(side, [leg_c, cuff, shoe])
    root.location = (s * 0.14, 0, 0.7)
    bpy.context.view_layer.update()

# ---------- arms (pivot groups at ±0.42, 1.5, 0) ----------
for s, side in ((-1, "L"), (1, "R")):
    upper = cyl(f"Arm_{side}", 0.065, 0.075, 0.34, M_BLACK, (0, 0, -0.16), verts=10)
    fore = cyl(f"Fore_{side}", 0.055, 0.065, 0.30, M_BLACK, (0, 0, -0.46), verts=10)
    hand = sphere(f"Hand_{side}", 0.075, M_SKIN, (0, 0, -0.66), seg=10, ring=8)
    hand.scale = (0.85, 1.15, 1.1)
    bpy.ops.object.transform_apply(scale=True)
    root = limb("ARM" + side, [upper, fore, hand])
    root.location = (s * 0.42, 0, 1.5)
    bpy.context.view_layer.update()

# name the roots exactly as the game expects: RootL / RootR for legs, ArmL / ArmR
root_objs = {o.name: o for o in bpy.data.objects if o.type == 'EMPTY'}
# relabel: first two leg roots created (L then R), then arms
leg_roots = [o for o in bpy.data.objects if o.name.startswith("ROOT_L") and o.name.endswith("L") and "ARM" not in o.name]
# simpler: find by position
for o in bpy.data.objects:
    if o.type != 'EMPTY':
        continue
    if abs(o.location.z - 0.7) < 0.01:
        o.name = "LegL" if o.location.x < 0 else "LegR"
    if abs(o.location.z - 1.5) < 0.01:
        o.name = "ArmL" if o.location.x < 0 else "ArmR"

# parent everything static under a ROOT
root = bpy.data.objects.new("HeroRoot", None)
bpy.context.scene.collection.objects.link(root)
for o in bpy.data.objects:
    if o is root:
        continue
    if o.type == 'MESH' and o.parent is None:
        o.parent = root
    if o.type == 'EMPTY' and o.parent is None:
        o.parent = root

# apply modifiers / cleanup
for o in bpy.data.objects:
    if o.type == 'MESH':
        for md in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=md.name)

print("objects:", len(bpy.data.objects))
print([o.name for o in bpy.data.objects if o.type == 'EMPTY'])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.shade_flat()
print("hero built")
