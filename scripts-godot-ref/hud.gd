extends CanvasLayer
## HUD: bladder bar, urgency state, quota, closing clock, toasts, hints, run summary.

var bar: ProgressBar
var bar_fill: StyleBoxFlat
var state_label: Label
var wet_label: Label
var toast_label: Label
var hint_label: Label
var timer_label: Label
var closing_label: Label
var quota_label: Label
var relieve_bar: ProgressBar
var relieve_label: Label
var summary_panel: Panel
var summary_label: Label

var _toast_msg: String = ""
var _toast_t: float = 0.0

const STATE_COLORS := [
	Color(0.35, 0.8, 0.4),
	Color(0.85, 0.85, 0.3),
	Color(0.95, 0.6, 0.15),
	Color(0.9, 0.25, 0.2),
]

func _ready() -> void:
	layer = 10
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	bar = ProgressBar.new()
	bar.custom_minimum_size = Vector2(340, 30)
	bar.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	bar.position = Vector2(24, -56)
	bar.max_value = 100.0
	bar.show_percentage = false
	bar_fill = StyleBoxFlat.new()
	bar_fill.bg_color = STATE_COLORS[0]
	bar.add_theme_stylebox_override("fill", bar_fill)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.06, 0.06, 0.08, 0.85)
	bar.add_theme_stylebox_override("background", bg)
	root.add_child(bar)

	state_label = Label.new()
	state_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	state_label.position = Vector2(24, -86)
	state_label.add_theme_font_size_override("font_size", 18)
	root.add_child(state_label)

	timer_label = Label.new()
	timer_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	timer_label.position = Vector2(24, 12)
	root.add_child(timer_label)

	quota_label = Label.new()
	quota_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	quota_label.position = Vector2(24, 40)
	root.add_child(quota_label)

	closing_label = Label.new()
	closing_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	closing_label.position = Vector2(0, 12)
	closing_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	closing_label.add_theme_font_size_override("font_size", 22)
	root.add_child(closing_label)

	toast_label = Label.new()
	toast_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	toast_label.position = Vector2(0, 56)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.add_theme_font_size_override("font_size", 22)
	root.add_child(toast_label)

	hint_label = Label.new()
	hint_label.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	hint_label.position = Vector2(-130, -56)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.add_theme_font_size_override("font_size", 20)
	root.add_child(hint_label)

	wet_label = Label.new()
	wet_label.text = "WET PANTS"
	wet_label.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	wet_label.position = Vector2(-130, -112)
	wet_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wet_label.add_theme_font_size_override("font_size", 34)
	wet_label.modulate = Color(0.55, 0.8, 1.0, 0.9)
	wet_label.visible = false
	root.add_child(wet_label)

	relieve_bar = ProgressBar.new()
	relieve_bar.custom_minimum_size = Vector2(240, 16)
	relieve_bar.set_anchors_preset(Control.PRESET_CENTER)
	relieve_bar.position = Vector2(-120, -36)
	relieve_bar.max_value = 100.0
	relieve_bar.show_percentage = false
	relieve_bar.visible = false
	var rf := StyleBoxFlat.new()
	rf.bg_color = Color(0.4, 0.7, 1.0)
	relieve_bar.add_theme_stylebox_override("fill", rf)
	root.add_child(relieve_bar)
	relieve_label = Label.new()
	relieve_label.text = "DRAINING..."
	relieve_label.set_anchors_preset(Control.PRESET_CENTER)
	relieve_label.position = Vector2(-120, -58)
	relieve_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	relieve_label.visible = false
	root.add_child(relieve_label)

	summary_panel = Panel.new()
	summary_panel.custom_minimum_size = Vector2(640, 330)
	summary_panel.set_anchors_preset(Control.PRESET_CENTER)
	summary_panel.position = Vector2(-320, -165)
	var ps := StyleBoxFlat.new()
	ps.bg_color = Color(0.04, 0.04, 0.06, 0.93)
	summary_panel.add_theme_stylebox_override("panel", ps)
	summary_label = Label.new()
	summary_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	summary_label.position = Vector2(30, 0)
	summary_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	summary_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	summary_label.add_theme_font_size_override("font_size", 24)
	summary_panel.add_child(summary_label)
	summary_panel.visible = false
	root.add_child(summary_panel)

	var controls := Label.new()
	controls.text = "WASD move · SHIFT sprint · E interact · mouse look (or hold RMB) · R restart"
	controls.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	controls.position = Vector2(-560, 12)
	controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	controls.add_theme_font_size_override("font_size", 14)
	controls.modulate = Color(1, 1, 1, 0.55)
	root.add_child(controls)

	Game.pressure_changed.connect(_on_pressure)
	Game.accident_happened.connect(_on_accident)
	Game.toast.connect(_on_toast)
	Game.run_ended.connect(_on_run_ended)
	Game.run_started.connect(_on_run_started)
	Game.quota_changed.connect(_on_quota)

func _process(delta: float) -> void:
	if Game.run_active:
		var rt := Game.run_time
		timer_label.text = "SHIFT %d:%02d" % [int(rt / 60.0), int(fmod(rt, 60.0))]
		var ct := Game.closing_time
		closing_label.text = "CLOSING IN %d:%02d" % [int(ct / 60.0), int(fmod(ct, 60.0))]
		closing_label.modulate = Color(1, 0.35, 0.3) if ct < 60.0 else Color(1, 1, 1, 0.85)
	if _toast_t > 0.0:
		_toast_t -= delta
		toast_label.text = _toast_msg
		toast_label.modulate.a = clampf(_toast_t / 0.6, 0.0, 1.0)
	else:
		toast_label.text = ""
	var t := Time.get_ticks_msec() / 1000.0
	if Game.run_active and Game.get_state() == 3 and not Game.wet:
		state_label.modulate.a = 0.5 + 0.5 * abs(sin(t * 8.0))
	else:
		state_label.modulate.a = 0.9
	var p: Player = get_tree().get_first_node_in_group("player")
	if p and p.relieving:
		relieve_bar.visible = true
		relieve_label.visible = true
		relieve_bar.value = clampf(100.0 - Game.pressure, 0.0, 100.0)
	else:
		relieve_bar.visible = false
		relieve_label.visible = false

func set_hint(text: String) -> void:
	hint_label.text = text

func _on_pressure(value: float, name: String) -> void:
	bar.value = value
	bar_fill.bg_color = STATE_COLORS[Game.get_state()]
	state_label.text = "BLADDER: %s  %d%%" % [name, int(value)]
	wet_label.visible = Game.wet

func _on_accident() -> void:
	wet_label.visible = true

func _on_toast(msg: String) -> void:
	_toast_msg = msg
	_toast_t = 3.2

func _on_run_started() -> void:
	summary_panel.visible = false
	wet_label.visible = false
	Game.toast.emit("Quota first, then the exit. And find a toilet before the pants decide for you.")

func _on_quota(c: int, tot: int) -> void:
	quota_label.text = "QUOTA %d/%d" % [c, tot]

func _on_run_ended(s: Dictionary) -> void:
	var mm := int(s.time / 60.0)
	var ss := int(fmod(s.time, 60.0))
	summary_label.text = (
		"RUN COMPLETE\n\n%s\n\nShift time: %d:%02d\nAccidents: %d\nQuota: %d/%d\n\nSCORE: %d\n\n[ Press R to run again ]"
		% [s.ending, mm, ss, s.accidents, s.quota, s.quota_total, s.score])
	summary_panel.visible = true
