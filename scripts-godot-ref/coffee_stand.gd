class_name CoffeeStand
extends Node3D
## Free coffee stand: a delicious risk.

var uses_left: int = 2
var _cup: MeshInstance3D

func _ready() -> void:
	Game.register_interactable(self)
	_build()

func _build() -> void:
	var mat_red := StandardMaterial3D.new()
	mat_red.albedo_color = Color(0.75, 0.2, 0.15)
	var counter := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(1.2, 1.0, 0.6)
	counter.mesh = b
	counter.position = Vector3(0, 0.5, 0)
	counter.material_override = mat_red
	add_child(counter)
	var awning := MeshInstance3D.new()
	var b2 := BoxMesh.new()
	b2.size = Vector3(1.5, 0.08, 0.8)
	awning.mesh = b2
	awning.position = Vector3(0, 1.8, 0)
	awning.material_override = mat_red
	add_child(awning)
	_cup = MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = 0.08
	c.bottom_radius = 0.06
	c.height = 0.14
	c.radial_segments = 10
	_cup.mesh = c
	_cup.position = Vector3(0.2, 1.07, 0)
	var mat_cup := StandardMaterial3D.new()
	mat_cup.albedo_color = Color(0.98, 0.98, 0.95)
	_cup.material_override = mat_cup
	add_child(_cup)
	var sb := StaticBody3D.new()
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(1.3, 1.1, 0.7)
	col.shape = shape
	col.position = Vector3(0, 0.55, 0)
	sb.add_child(col)
	add_child(sb)

func get_hint() -> String:
	if uses_left > 0 and Game.coffee_ready():
		return "Grab free coffee"
	return "Coffee stand (out of samples)"

func interact(p: Player) -> void:
	if uses_left <= 0:
		Game.toast.emit("The stand is empty. The lady shrugs.")
		return
	if not Game.coffee_ready():
		Game.toast.emit("'One at a time, dear,' says the lady.")
		return
	uses_left -= 1
	if uses_left <= 0:
		_cup.visible = false
	Game.use_coffee()

func reset() -> void:
	uses_left = 2
	_cup.visible = true
