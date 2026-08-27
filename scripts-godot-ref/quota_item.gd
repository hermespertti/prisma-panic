class_name QuotaItem
extends Area3D
## A glowing quota item. Collect them all, then get out.

var _spinner: MeshInstance3D

func _ready() -> void:
	body_entered.connect(_on_body)
	_spinner = MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(0.35, 0.35, 0.35)
	_spinner.mesh = b
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.9, 0.55, 0.1)
	m.emission_enabled = true
	m.emission = Color(1.0, 0.6, 0.15)
	m.emission_energy_multiplier = 1.4
	_spinner.material_override = m
	add_child(_spinner)
	var col := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = Vector3(0.7, 0.7, 0.7)
	col.shape = s
	add_child(col)

func _process(delta: float) -> void:
	if is_instance_valid(_spinner):
		_spinner.rotation.y += delta * 1.8

func _on_body(body: Node3D) -> void:
	if not (body is CharacterBody3D) or not Game.run_active:
		return
	Game.add_quota()
	Game.toast.emit("Quota item secured. (%d/%d)" % [Game.quota_collected, Game.quota_total])
	queue_free()
