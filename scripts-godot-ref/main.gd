extends Node3D
## Builds the store, lights, player, and interactive nodes. Handles run restarts + debug shots.

var player: Player
var coffee_stand: CoffeeStand
var _quota_items: Array = []
var _shot_held: bool = false
var _auto_shot_done: bool = false

const PRODUCT_COLORS := [
	Color(0.8, 0.25, 0.2), Color(0.9, 0.55, 0.15), Color(0.95, 0.85, 0.3),
	Color(0.4, 0.7, 0.3), Color(0.2, 0.6, 0.65), Color(0.75, 0.35, 0.6),
	Color(0.5, 0.35, 0.2), Color(0.85, 0.85, 0.88),
]

func _ready() -> void:
	_build_environment()
	_build_store()
	_build_player()
	_spawn_quota_items()
	Game.start_run()
	print("[GAME] Prisma Panic starting — the store is open.")

func _process(_delta: float) -> void:
	if not Game.run_active and Input.is_key_pressed(KEY_R):
		_reset_run()
	var f12 := Input.is_key_pressed(KEY_F12)
	if f12 and not _shot_held:
		_take_shot("f12")
	_shot_held = f12
	if not _auto_shot_done and Game.run_time > 4.0:
		_auto_shot_done = true
		_take_shot("auto")

func _take_shot(tag: String) -> void:
	var dir := "/home/lex/prisma-panic/shots"
	DirAccess.make_dir_recursive_absolute(dir)
	var img := get_viewport().get_texture().get_image()
	var path := dir + "/%s_%d.png" % [tag, Time.get_ticks_msec()]
	img.save_png(path)
	print("[GAME] screenshot: %s" % path)

func _reset_run() -> void:
	player.reset_run()
	coffee_stand.reset()
	_spawn_quota_items()
	Game.start_run()
	Game.toast.emit("A new shift. Try not to have an accident.")

func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.07, 0.08, 0.1)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.9, 0.92, 1.0)
	env.ambient_light_energy = 0.35
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-70, -30, 0)
	sun.light_color = Color(1.0, 0.98, 0.92)
	sun.light_energy = 1.2
	sun.shadow_enabled = true
	add_child(sun)
	# Fluorescent point lights on a grid
	for lx in [-15, -5, 5, 15]:
		for lz in [-9, 9]:
			var pl := PointLight3D.new()
			pl.light_color = Color(0.95, 0.97, 1.0)
			pl.energy = 0.75
			pl.omni_range = 15.0
			pl.omni_attenuation = 1.6
			pl.position = Vector3(lx, 3.0, lz)
			add_child(pl)

func _mat(r: float, g: float, b: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(r, g, b)
	m.roughness = 0.9
	return m

func _static_box(size: Vector3, mat: Material, pos: Vector3) -> StaticBody3D:
	var sb := StaticBody3D.new()
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.material_override = mat
	sb.add_child(mi)
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	sb.add_child(col)
	sb.position = pos
	add_child(sb)
	return sb

func _visual_box(size: Vector3, mat: Material, pos: Vector3) -> void:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.material_override = mat
	mi.position = pos
	add_child(mi)

func _build_store() -> void:
	# Floor
	_static_box(Vector3(46, 0.2, 36), _mat(0.78, 0.78, 0.75), Vector3(0, -0.1, 0))
	# Ceiling
	_visual_box(Vector3(46.4, 0.2, 36.4), _mat(0.16, 0.17, 0.2), Vector3(0, 3.4, 0))
	# Fluorescent strips (emissive, visual only)
	var strip_mat := StandardMaterial3D.new()
	strip_mat.albedo_color = Color(0.9, 0.95, 1.0)
	strip_mat.emission_enabled = true
	strip_mat.emission = Color(0.9, 0.97, 1.0)
	strip_mat.emission_energy_multiplier = 1.8
	for sx in [-15, -5, 5, 15]:
		for sz in [-10, 0, 10]:
			_visual_box(Vector3(1.0, 0.06, 5.0), strip_mat, Vector3(sx, 3.26, sz))
	# Walls
	var mat_wall := _mat(0.55, 0.58, 0.62)
	_static_box(Vector3(46.4, 3.2, 0.4), mat_wall, Vector3(0, 1.6, -18))
	_static_box(Vector3(46.4, 3.2, 0.4), mat_wall, Vector3(0, 1.6, 18))
	_static_box(Vector3(0.4, 3.2, 36.4), mat_wall, Vector3(-23, 1.6, 0))
	# East wall with door gap (z 10.8..13.2)
	_static_box(Vector3(0.4, 3.2, 28.8), mat_wall, Vector3(23, 1.6, -3.6))
	_static_box(Vector3(0.4, 3.2, 4.8), mat_wall, Vector3(23, 1.6, 15.6))
	# Bathroom walls (NW corner)
	_static_box(Vector3(0.4, 3.2, 4.5), mat_wall, Vector3(-16.5, 1.6, -15.75))
	_static_box(Vector3(0.4, 3.2, 1.0), mat_wall, Vector3(-16.5, 1.6, -11.5))
	_static_box(Vector3(6.5, 3.2, 0.4), mat_wall, Vector3(-19.75, 1.6, -11))
	# Bathroom floor tint
	_visual_box(Vector3(6.5, 0.04, 7.0), _mat(0.45, 0.6, 0.65), Vector3(-19.75, 0.02, -14.5))
	# Toilet against the west wall, bowl facing into the room
	var toilet := Toilet.new()
	toilet.position = Vector3(-22.0, 0, -15)
	toilet.rotation.y = 1.5708
	add_child(toilet)
	# Shelves
	_shelf(Vector3(-10, 0, -6), "z", 14.0)
	_shelf(Vector3(-3, 0, -6), "z", 14.0)
	_shelf(Vector3(4, 0, -6), "z", 14.0)
	_shelf(Vector3(8, 0, 4), "x", 12.0)
	# Coffee stand
	coffee_stand = CoffeeStand.new()
	coffee_stand.position = Vector3(10, 0, -10)
	add_child(coffee_stand)
	# Freezer aisle
	var freezer := FreezerZone.new()
	freezer.position = Vector3(10, 0, 11)
	add_child(freezer)
	# Ice-box pedestal for quota item 2
	_static_box(Vector3(0.7, 0.5, 0.7), _mat(0.85, 0.92, 0.98), Vector3(14, 0.25, 14))
	# Pedestal for quota item 3
	_static_box(Vector3(0.6, 1.0, 0.6), _mat(0.4, 0.42, 0.48), Vector3(20, 0.5, 12))
	# Exit door
	var exit := ExitDoor.new()
	exit.position = Vector3(22.6, 0, 12)
	add_child(exit)

func _shelf(pos: Vector3, along: String, len: float) -> void:
	var size := Vector3(1.0, 2.0, len) if along == "z" else Vector3(len, 2.0, 1.0)
	var sb := _static_box(size, _mat(0.85, 0.85, 0.82), pos + Vector3(0, 1.0, 0))
	for i in int(len / 1.2):
		for level in [0.55, 1.1, 1.65]:
			if randf() < 0.75:
				for side in [-1, 1]:
					var p := MeshInstance3D.new()
					var s := 0.25 + randf() * 0.15
					var bm := BoxMesh.new()
					bm.size = Vector3(s, s * 1.2, s * 0.8)
					p.mesh = bm
					var c: Color = PRODUCT_COLORS[randi() % PRODUCT_COLORS.size()]
					p.material_override = _mat(c.r, c.g, c.b)
					var off := Vector3(side * 0.53, 0, 0) if along == "z" else Vector3(0, 0, side * 0.53)
					var t := -len / 2.0 + 0.8 + i * 1.2
					var along_pos := Vector3(0, 0, t) if along == "z" else Vector3(t, 0, 0)
					p.position = pos + Vector3(0, level, 0) + off + along_pos
					add_child(p)

func _build_player() -> void:
	player = Player.new()
	add_child(player)
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

func _spawn_quota_items() -> void:
	for it in _quota_items:
		if is_instance_valid(it):
			it.queue_free()
	_quota_items.clear()
	var spots := [
		Vector3(-10, 2.2, -10),   # top of shelf 1
		Vector3(14, 0.78, 14),    # ice box in the freezer
		Vector3(20, 1.35, 12),    # pedestal near the exit
	]
	for s in spots:
		var q := QuotaItem.new()
		q.position = s
		add_child(q)
		_quota_items.append(q)
