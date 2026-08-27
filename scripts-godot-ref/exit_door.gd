class_name ExitDoor
extends Area3D
## The exit: the only reason to keep moving.

func _ready() -> void:
	body_entered.connect(_on_body)
	_build()

func _build() -> void:
	var mat_green := StandardMaterial3D.new()
	mat_green.albedo_color = Color(0.15, 0.7, 0.3)
	mat_green.emission_enabled = true
	mat_green.emission = Color(0.1, 0.8, 0.3)
	mat_green.emission_energy_multiplier = 1.6
	var panel := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(1.6, 0.4, 0.08)
	panel.mesh = b
	panel.position = Vector3(0, 2.3, 0)
	panel.material_override = mat_green
	add_child(panel)
	var door := MeshInstance3D.new()
	var b2 := BoxMesh.new()
	b2.size = Vector3(1.8, 2.6, 0.15)
	door.mesh = b2
	door.position = Vector3(0, 1.3, 0)
	var mat_d := StandardMaterial3D.new()
	mat_d.albedo_color = Color(0.6, 0.65, 0.7)
	door.material_override = mat_d
	add_child(door)
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(2.2, 3.0, 2.2)
	col.shape = shape
	col.position = Vector3(0, 1.5, 0)
	add_child(col)

func _on_body(body: Node3D) -> void:
	if not (body is CharacterBody3D):
		return
	if not Game.run_active:
		return
	if not Game.quota_done():
		var missing := Game.quota_total - Game.quota_collected
		Game.toast.emit("The register beeps: %d quota item%s still missing." % [missing, "" if missing == 1 else "s"])
		return
	Game.end_run("exit")
