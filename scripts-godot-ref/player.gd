class_name Player
extends CharacterBody3D
## Third-person player: camera orbit, movement, urgency animation, interaction.

const SPAWN := Vector3(-18, 0, 12)
const INIT_YAW := -1.5708  # camera behind, facing into the store (+X)
const WALK := 4.6
const SPRINT := 7.4
const ACCEL := 12.0
const FRICTION := 16.0
const GRAVITY := 24.0
const CAM_DIST := 4.4
const JN_BLUE := Color(0.23, 0.35, 0.55)   # dry denim
const WET_BLUE := Color(0.10, 0.17, 0.32)  # soaked denim

var cam_yaw: float = INIT_YAW
var cam_pitch: float = -0.35
var cam_shake: float = 0.0

var jeans_mat: StandardMaterial3D
var hips: Node3D
var head: Node3D
var legs: Array = []
var arms: Array = []
var walk_phase: float = 0.0
var sprinting: bool = false
var relieving: bool = false
var interact_target: Node = null

var cam_rig: Node3D
var cam: Camera3D

var _sfx: AudioStreamPlayer
var _drip_stream: AudioStreamWAV
var _shhh_stream: AudioStreamWAV
var _splash_stream: AudioStreamWAV
var _plop_stream: AudioStreamWAV
var _drip_t: float = 0.0
var _shhh_t: float = 0.0
var _e_held: bool = false
var _wade_amp: float = 0.0

func _ready() -> void:
	add_to_group("player")
	_build_body()
	_build_camera()
	_build_sfx()
	Game.accident_happened.connect(_on_accident)
	position = SPAWN
	rotation.y = INIT_YAW

func _build_body() -> void:
	var col := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.38
	capsule.height = 1.75
	col.shape = capsule
	col.position = Vector3(0, 0.95, 0)
	add_child(col)

	var mat_black := StandardMaterial3D.new()
	mat_black.albedo_color = Color(0.11, 0.11, 0.13)
	mat_black.roughness = 0.9
	var mat_skin := StandardMaterial3D.new()
	mat_skin.albedo_color = Color(0.87, 0.7, 0.58)
	var mat_silver := StandardMaterial3D.new()
	mat_silver.albedo_color = Color(0.75, 0.75, 0.78)
	mat_silver.metallic = 0.9
	jeans_mat = StandardMaterial3D.new()
	jeans_mat.albedo_color = JN_BLUE
	jeans_mat.roughness = 0.95

	hips = Node3D.new()
	hips.position = Vector3(0, 0.9, 0)
	add_child(hips)

	hips.add_child(_box(0.5, 0.28, 0.34, Vector3(0, 0, 0), jeans_mat))

	# Belt + silver rectangular buckle (reference still)
	hips.add_child(_cyl(0.29, 0.07, Vector3(0, 0.16, 0), mat_black))
	hips.add_child(_box(0.12, 0.07, 0.03, Vector3(0, 0.16, 0.27), mat_silver))

	# Torso: black top
	hips.add_child(_cyl(0.3, 0.6, Vector3(0, 0.5, 0), mat_black))

	# Legs
	for s in [-1, 1]:
		var leg := Node3D.new()
		leg.position = Vector3(s * 0.14, -0.1, 0)
		hips.add_child(leg)
		leg.add_child(_cyl(0.14, 0.68, Vector3(0, -0.34, 0), jeans_mat))
		leg.add_child(_box(0.2, 0.1, 0.34, Vector3(0, -0.66, 0.06), mat_black))
		legs.append(leg)

	# Arms
	for s in [-1, 1]:
		var arm := Node3D.new()
		arm.position = Vector3(s * 0.42, 0.68, 0)
		hips.add_child(arm)
		arm.add_child(_cyl(0.08, 0.55, Vector3(0, -0.24, 0), mat_black))
		arms.append(arm)

	# Head + cap (reference still)
	head = Node3D.new()
	head.position = Vector3(0, 1.02, 0)
	hips.add_child(head)
	var skull := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.21
	sphere.height = 0.42
	sphere.radial_segments = 12
	sphere.rings = 8
	skull.mesh = sphere
	skull.material_override = mat_skin
	head.add_child(skull)
	head.add_child(_cyl(0.22, 0.09, Vector3(0, 0.14, 0), mat_black))
	head.add_child(_box(0.3, 0.03, 0.18, Vector3(0, 0.1, -0.24), mat_black))

func _cyl(r: float, h: float, pos: Vector3, mat: Material) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = r
	c.bottom_radius = r
	c.height = h
	c.radial_segments = 10
	m.mesh = c
	m.material_override = mat
	m.position = pos
	return m

func _box(w: float, h: float, d: float, pos: Vector3, mat: Material) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(w, h, d)
	m.mesh = b
	m.material_override = mat
	m.position = pos
	return m

func _build_camera() -> void:
	cam_rig = Node3D.new()
	add_child(cam_rig)
	cam = Camera3D.new()
	cam.fov = 68.0
	cam.near = 0.05
	cam.far = 80.0
	cam.position = Vector3(0, 1.0, CAM_DIST)
	cam.rotation.x = cam_pitch
	cam_rig.rotation.y = cam_yaw
	cam_rig.add_child(cam)

func _build_sfx() -> void:
	_sfx = AudioStreamPlayer.new()
	_sfx.volume_db = -4.0
	add_child(_sfx)
	_drip_stream = AudioGen.sine(680.0, 0.06, 0.6)
	_shhh_stream = AudioGen.noise(0.09, 0.3, 0.15)
	_splash_stream = AudioGen.splash()
	_plop_stream = AudioGen.plop()

func _play_sfx(stream: AudioStreamWAV, vol: float) -> void:
	_sfx.stream = stream
	_sfx.volume_db = linear_to_db(vol)
	_sfx.play()

func _physics_process(delta: float) -> void:
	_update_interactable()
	if not Game.run_active:
		_idle(delta)
		return
	_mouse_look()
	if relieving:
		_relieve(delta)
	else:
		_move(delta)
	_interact_input()
	_animate(delta)
	_camera_feedback(delta)

func _mouse_look() -> void:
	if Input.get_mouse_mode() != Input.MOUSE_MODE_CAPTURED and not Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		return
	var m: Vector2 = Input.get_mouse_motion()
	cam_yaw -= m.x * 0.0024
	cam_pitch = clampf(cam_pitch - m.y * 0.002, -1.1, -0.05)

func _move(delta: float) -> void:
	var k := Input
	var fwd := k.is_key_pressed(KEY_W) or k.is_key_pressed(KEY_UP)
	var back := k.is_key_pressed(KEY_S) or k.is_key_pressed(KEY_DOWN)
	var left := k.is_key_pressed(KEY_A) or k.is_key_pressed(KEY_LEFT)
	var right := k.is_key_pressed(KEY_D) or k.is_key_pressed(KEY_RIGHT)
	var want_sprint := k.is_key_pressed(KEY_SHIFT)
	var wish := Vector3(
		(1.0 if right else 0.0) - (1.0 if left else 0.0), 0.0,
		(1.0 if back else 0.0) - (1.0 if fwd else 0.0))
	var moving := wish != Vector3.ZERO
	if moving:
		wish = wish.normalized().rotated(Vector3.UP, cam_yaw)
	sprinting = want_sprint and moving
	var target_speed := 0.0
	if moving:
		target_speed = (SPRINT if sprinting else WALK)
		if Game.wet:
			target_speed *= 0.88  # wet pants are heavy and cold
	var target_vel := wish * target_speed
	var blend := ACCEL if moving else FRICTION
	velocity.x = move_toward(velocity.x, target_vel.x, blend * delta)
	velocity.z = move_toward(velocity.z, target_vel.z, blend * delta)
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	if moving and is_on_floor():
		walk_phase += delta * (9.0 if sprinting else 7.0)
	if moving:
		rotation.y = lerp_angle(rotation.y, atan2(-wish.x, -wish.z), 12.0 * delta)
	move_and_slide()

func _relieve(delta: float) -> void:
	var k := Input
	var wants_move := k.is_key_pressed(KEY_W) or k.is_key_pressed(KEY_S) \
		or k.is_key_pressed(KEY_A) or k.is_key_pressed(KEY_D) or k.is_key_pressed(KEY_SHIFT)
	if wants_move:
		stop_relieving()
		return
	Game.relieve(delta)
	velocity.x = move_toward(velocity.x, 0.0, FRICTION * delta)
	velocity.z = move_toward(velocity.z, 0.0, FRICTION * delta)
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	move_and_slide()
	if interact_target:
		var to: Vector3 = interact_target.global_position - global_position
		to.y = 0.0
		if to.length_squared() > 0.001:
			rotation.y = lerp_angle(rotation.y, atan2(-to.x, -to.z), 10.0 * delta)
	_shhh_t -= delta
	if _shhh_t <= 0.0:
		_shhh_t = 0.16
		_play_sfx(_shhh_stream, 0.1)
	if Game.pressure <= 4.0:
		stop_relieving()
		Game.toast.emit("Ahhh. That's the spot. (The pants, sadly, stay as they are.)")

func _idle(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	move_and_slide()
	_animate(delta)
	_camera_feedback(delta)

func _interact_input() -> void:
	var k := Input
	var e_now := k.is_key_pressed(KEY_E)
	if e_now and not _e_held:
		if relieving:
			stop_relieving()
		elif interact_target and interact_target.has_method("interact"):
			interact_target.interact(self)
	_e_held = e_now
	if k.is_key_pressed(KEY_ESCAPE) and relieving:
		stop_relieving()

func start_relieving() -> void:
	relieving = true
	HUD.set_hint("")
	_play_sfx(_shhh_stream, 0.1)

func stop_relieving() -> void:
	relieving = false

func _update_interactable() -> void:
	var best: Node = null
	var best_d := 2.1
	for it in Game.interactables:
		if not is_instance_valid(it):
			continue
		var d := global_position.distance_to(it.global_position)
		if d < best_d:
			best_d = d
			best = it
	if best != interact_target:
		interact_target = best
		if best and best.has_method("get_hint"):
			HUD.set_hint("[E] %s" % best.get_hint())
		else:
			HUD.set_hint("")

func _animate(delta: float) -> void:
	var st := Game.get_state()
	var urgency := clampf((Game.pressure - 30.0) / 70.0, 0.0, 1.0)
	if not Game.run_active:
		urgency = 0.0
	var speed := Vector2(velocity.x, velocity.z).length()
	var swing := clampf(speed / WALK, 0.0, 1.3)
	for i in legs.size():
		var side := 1.0 if i == 0 else -1.0
		legs[i].rotation.x = sin(walk_phase) * 0.55 * swing * side
		arms[i].rotation.x = -sin(walk_phase) * 0.5 * swing * side
	_wade_amp = move_toward(_wade_amp, urgency * 0.22, 2.0 * delta)
	var t := Time.get_ticks_msec() / 1000.0
	hips.rotation.z = sin(t * (4.0 + 8.0 * urgency)) * _wade_amp * swing
	hips.position.y = 0.9 - urgency * 0.06
	if st == 3 and not Game.wet and Game.run_active:
		hips.position.y += abs(sin(t * 10.0)) * 0.045  # the critical squeeze-hop
	head.rotation.z = -hips.rotation.z * 0.6
	if st == 3 and not relieving and Game.run_active:
		_drip_t -= delta
		if _drip_t <= 0.0:
			_drip_t = 0.45
			_play_sfx(_drip_stream, 0.14)
	var target_color := WET_BLUE if Game.wet else JN_BLUE
	jeans_mat.albedo_color = jeans_mat.albedo_color.lerp(target_color, 4.0 * delta)

func _camera_feedback(delta: float) -> void:
	var st := Game.get_state()
	var target_shake := 0.0
	if Game.run_active:
		if st == 3:
			target_shake = 0.05
		elif st == 2:
			target_shake = 0.015
	cam_shake = move_toward(cam_shake, target_shake, 1.5 * delta)
	cam_rig.rotation.y = cam_yaw - rotation.y
	cam.rotation.x = cam_pitch
	var off := Vector3.ZERO
	if cam_shake > 0.001:
		var t := Time.get_ticks_msec() / 1000.0
		off = Vector3(sin(t * 23.7) * cam_shake, cos(t * 29.3) * cam_shake * 0.6, sin(t * 31.1) * cam_shake * 0.3)
	cam.position = Vector3(0, 1.0, CAM_DIST) + off
	var target_fov := 68.0 - st * 1.5  # urgency squeezes the lens
	cam.fov = lerpf(cam.fov, target_fov, 3.0 * delta)

func _on_accident() -> void:
	_play_sfx(_splash_stream, 0.8)
	_play_sfx(_plop_stream, 0.7)
	cam_shake = 0.14

func reset_run() -> void:
	position = SPAWN
	velocity = Vector3.ZERO
	rotation.y = INIT_YAW
	cam_yaw = INIT_YAW
	cam_pitch = -0.35
	relieving = false
	walk_phase = 0.0
	_wade_amp = 0.0
	cam_shake = 0.0
	HUD.set_hint("")
