extends Node
## Global run state + bladder pressure system (autoload "Game").
##
## The bladder is a resource like health or ammo: it fills over time, events push on it,
## toilets drain it, and at 100% something happens. Everything else in the game reads
## from it.

signal pressure_changed(value: float, state_name: String)
signal accident_happened()
signal toast(msg: String)
signal run_started()
signal run_ended(summary: Dictionary)
signal quota_changed(collected: int, total: int)

var pressure: float = 10.0
var wet: bool = false
var run_time: float = 0.0
var closing_time: float = 300.0
var run_active: bool = false
var accidents: int = 0
var score: int = 0

var quota_total: int = 3
var quota_collected: int = 0

var interactables: Array = []

const FULL: float = 100.0
const BASE_FILL: float = 1.2      # ~75s from empty to full at base rate
const RELIEF_RATE: float = 45.0   # per second while at a toilet
const ACCIDENT_RECOVERY: float = 35.0

const STATE_NAMES := ["FRESH", "SQUEEZY", "PRESSING", "CRITICAL"]

var _mods: Array = []
var _coffee_cd: float = 0.0

func _ready() -> void:
	randomize()

func start_run() -> void:
	pressure = 10.0
	wet = false
	run_time = 0.0
	closing_time = randf_range(240.0, 360.0)
	accidents = 0
	score = 0
	quota_collected = 0
	_mods.clear()
	_coffee_cd = 0.0
	run_active = true
	run_started.emit()
	pressure_changed.emit(pressure, state_name())
	quota_changed.emit(quota_collected, quota_total)

func _process(delta: float) -> void:
	if not run_active:
		return
	run_time += delta
	closing_time -= delta
	if closing_time <= 0.0:
		closing_time = 0.0
		end_run("caught")
		return
	if _coffee_cd > 0.0:
		_coffee_cd -= delta
	var rate := BASE_FILL
	for m in _mods:
		rate += m
	if wet:
		rate *= 1.15  # wet pants: the run is already decided, the bladder keeps up
	pressure = minf(pressure + rate * delta, FULL)
	if pressure >= FULL:
		_accident()
	pressure_changed.emit(pressure, state_name())

func get_state() -> int:
	if pressure < 40.0:
		return 0  # FRESH
	if pressure < 70.0:
		return 1  # SQUEEZY
	if pressure < 90.0:
		return 2  # PRESSING
	return 3      # CRITICAL

func state_name() -> String:
	return STATE_NAMES[get_state()]

func relieve(delta: float) -> void:
	if not run_active:
		return
	pressure = maxf(pressure - RELIEF_RATE * delta, 0.0)
	pressure_changed.emit(pressure, state_name())

func add_mod(v: float) -> void:
	_mods.append(v)

func remove_mod(v: float) -> void:
	_mods.erase(v)

func instant(v: float) -> void:
	pressure = clampf(pressure + v, 0.0, FULL)
	pressure_changed.emit(pressure, state_name())

func coffee_ready() -> bool:
	return _coffee_cd <= 0.0

func use_coffee() -> void:
	if not coffee_ready():
		return
	_coffee_cd = 30.0
	instant(12.0)
	add_mod(0.35)
	var t := Timer.new()
	t.wait_time = 25.0
	t.one_shot = true
	t.timeout.connect(func() -> void: _mods.erase(0.35))
	add_child(t)
	t.start()
	toast.emit("Free espresso. Tastes like victory. (Your bladder notes this.)")

func add_quota() -> void:
	if quota_collected >= quota_total:
		return
	quota_collected += 1
	add_score(10)
	quota_changed.emit(quota_collected, quota_total)

func quota_done() -> bool:
	return quota_collected >= quota_total

func register_interactable(n: Node) -> void:
	if not interactables.has(n):
		interactables.append(n)

func unregister_interactable(n: Node) -> void:
	interactables.erase(n)

func _accident() -> void:
	accidents += 1
	wet = true
	pressure = ACCIDENT_RECOVERY
	toast.emit("...SPLASH. You heard that, didn't you?")
	accident_happened.emit()
	pressure_changed.emit(pressure, state_name())

func add_score(v: int) -> void:
	score += v

func end_run(reason: String = "exit") -> void:
	if not run_active:
		return
	run_active = false
	var ending := ""
	if reason == "exit":
		if wet:
			score += 25
			ending = "WET EXIT — you peed your pants and walked out anyway"
		else:
			score += 50
			ending = "CLEAN EXIT — dry pants. Absolute legend."
	else:
		score += 10
		ending = "STORE CLOSED — the lights died mid-strut. Security found you at the deli counter."
	var s := {
		"time": run_time,
		"accidents": accidents,
		"wet": wet,
		"score": score,
		"ending": ending,
		"quota": quota_collected,
		"quota_total": quota_total,
	}
	print("[GAME] run ended (%s): %s" % [reason, s])
	run_ended.emit(s)
