class_name FreezerZone
extends Area3D
## The freezer aisle: refreshing, and your bladder absolutely hates it.

const COLD_MOD: float = 1.6

var _inside: bool = false

func _ready() -> void:
	body_entered.connect(_on_body)
	body_exited.connect(_on_exit)
	_build()

func _build() -> void:
	var floor_mat := StandardMaterial3D.new()
	floor_mat.albedo_color = Color(0.55, 0.78, 0.92)
	var floor := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(10, 0.06, 8)
	floor.mesh = b
	floor.position = Vector3(0, 0.03, 0)
	floor.material_override = floor_mat
	add_child(floor)
	var light := PointLight3D.new()
	light.light_color = Color(0.4, 0.7, 1.0)
	light.energy = 1.6
	light.position = Vector3(0, 2.6, 0)
	add_child(light)
	for i in 3:
		var box := MeshInstance3D.new()
		var bb := BoxMesh.new()
		bb.size = Vector3(2.2, 0.5, 1.0)
		box.mesh = bb
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(0.85, 0.92, 0.98)
		box.material_override = m
		box.position = Vector3(-3.0 + i * 3.0, 0.3, 0.0)
		add_child(box)
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(10, 2.0, 8)
	col.shape = shape
	col.position = Vector3(0, 1.0, 0)
	add_child(col)

func _on_body(body: Node3D) -> void:
	if body is CharacterBody3D:
		if _inside:
			return
		_inside = true
		Game.add_mod(COLD_MOD)
		Game.toast.emit("The freezer aisle. So refreshing. (You'll regret this.)")

func _on_exit(body: Node3D) -> void:
	if body is CharacterBody3D and _inside:
		_inside = false
		Game.remove_mod(COLD_MOD)
