class_name AudioGen
## Procedural one-shot SFX — no audio assets needed for the prototype.

static func _wav(norm: PackedFloat32Array, vol: float) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(norm.size() * 2)
	for i in norm.size():
		var v := int(clampf(norm[i] * vol * 32767.0, -32768, 32767))
		data[i * 2] = v & 0xFF
		data[i * 2 + 1] = (v >> 8) & 0xFF
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = 44100
	w.stereo = false
	w.data = data
	return w

static func sine(freq: float, dur: float, vol: float) -> AudioStreamWAV:
	var sr := 44100
	var n := int(sr * dur)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := i / float(sr)
		var env := 1.0 - i / float(n)
		out[i] = sin(TAU * freq * t) * env
	return _wav(out, vol)

static func noise(dur: float, vol: float, lowpass: float = 0.25) -> AudioStreamWAV:
	var sr := 44100
	var n := int(sr * dur)
	var out := PackedFloat32Array()
	out.resize(n)
	var prev := 0.0
	for i in n:
		var env := 1.0 - i / float(n)
		var white := randf_range(-1.0, 1.0)
		prev = lerpf(prev, white, lowpass)
		out[i] = prev * env
	return _wav(out, vol)

static func splash() -> AudioStreamWAV:
	return noise(0.35, 0.8, 0.35)

static func plop() -> AudioStreamWAV:
	var sr := 44100
	var n := int(sr * 0.25)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var t := i / float(sr)
		var env := 1.0 - i / float(n)
		out[i] = sin(TAU * (140.0 + 220.0 * t) * t) * env
	return _wav(out, 0.9)
