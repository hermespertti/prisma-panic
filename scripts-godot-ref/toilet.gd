class_name Toilet
extends Node3D
## A toilet: the only real solution to the problem.

func _ready() -> void:
	Game.register_interactable(self)
	_build_visual()

func _build_visual() -> void:
	var mat_white := StandardMaterial3D.new()
	mat_white.albedo_color = Color(0.92, 0.93, 0.9)
	var bowl := MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = 0.3
	s.height = 0.5
	s.radial_segments = 10
	s.rings = 6
	bowl.mesh = s
	bowl.scale = Vector3(1.0, 0.6, 1.2)
	bowl.position = Vector3(0, 0.45, 0)
	bowl.material_override = mat_white
	add_child(bowl)
	var seat := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = 0.32
	c.bottom_radius = 0.26
	c.height = 0.1
	c.radial_segments = 12
	seat.mesh = c
	seat.position = Vector3(0, 0.62, 0)
	seat.material_override = mat_white
	add_child(seat)
	var tank := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(0.5, 0.55, 0.2)
	tank.mesh = b
	tank.position = Vector3(0, 0.85, -0.35)
	tank.material_override = mat_white
	add_child(tank)
	var pl := PointLight3D.new()
	pl.light_color = Color(0.6, 1.0, 0.7)
	pl.energy = 0.5
	pl.position = Vector3(0, 1.7, 0)
	add_child(pl)

func get_hint() -> String:
	return "Use the toilet"

func interact(p: Player) -> void:
	if p.has_method("start_relieving"):
		p.start_relieving()
