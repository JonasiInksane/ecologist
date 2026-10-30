extends Node2D
# Day and night on the campaign plot. The light of the hour follows the game clock: full day from 07:00 to 19:00,
# dawn and dusk over two hours with a warm tint, dark from 21:00 to 05:00. This node multiplies everything drawn in
# the world (the cells, equipment, trucks and the player) by that light, and keeps rooms (cells with a background
# wall) lit by a lamp after dark. The sky darkens with it and the shader shows stars. main.gd places it over the
# world and calls update_light every frame; the sandbox does not use it.

const CELL := 8.0
const NIGHT := Color(0.26, 0.31, 0.5)
const LAMP := Color(1.0, 0.86, 0.66)

var level := 1.0
var width := 0
var height := 0
# Per row, the start and end columns of each run of indoor cells.
var rooms: Array = []

func _ready() -> void:
    var blend := CanvasItemMaterial.new()
    blend.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
    material = blend
    z_index = 50

# 1 in full day, 0 at night.
static func daylight(minute: float) -> float:
    var hour := fmod(minute, 1440.0) / 60.0
    if hour < 5.0 or hour >= 21.0:
        return 0.0
    if hour < 7.0:
        return smoothstep(5.0, 7.0, hour)
    if hour >= 19.0:
        return 1.0 - smoothstep(19.0, 21.0, hour)
    return 1.0

# The outdoor light: white by day, a cool blue at night, warmer around dawn and dusk.
static func ambient(light: float) -> Color:
    var color := NIGHT.lerp(Color.WHITE, light)
    var warm := clampf(1.0 - absf(light - 0.6) / 0.4, 0.0, 1.0)
    return Color(color.r, color.g * (1.0 - 0.16 * warm), color.b * (1.0 - 0.32 * warm))

static func indoor(light: float) -> Color:
    return ambient(light).lerp(LAMP, 1.0 - light)

# Rooms are the cells with a background wall (bits 0-3 of the building layer).
func set_rooms(back: PackedByteArray, w: int, h: int) -> void:
    width = w
    height = h
    rooms.clear()
    for y in h:
        var runs: Array[int] = []
        var x := 0
        while x < w:
            if back[y * w + x] & 0x0F:
                var start := x
                while x < w and back[y * w + x] & 0x0F:
                    x += 1
                runs.append_array([start, x])
            else:
                x += 1
        rooms.append(runs)
    queue_redraw()

func update_light(minute: float) -> void:
    var light := daylight(minute)
    visible = light < 0.999
    if absf(light - level) > 0.002:
        level = light
        queue_redraw()

# Multiplied over the world without overlaps: the outdoor light, and the lamp light over each run of room cells.
func _draw() -> void:
    if level >= 0.999 or width == 0:
        return
    var outside := ambient(level)
    var inside := indoor(level)
    for y in height:
        var runs: Array = rooms[y]
        var x := 0
        for i in range(0, runs.size(), 2):
            if runs[i] > x:
                draw_rect(Rect2(x * CELL, y * CELL, (runs[i] - x) * CELL, CELL), outside)
            draw_rect(Rect2(runs[i] * CELL, y * CELL, (runs[i + 1] - runs[i]) * CELL, CELL), inside)
            x = runs[i + 1]
        if x < width:
            draw_rect(Rect2(x * CELL, y * CELL, (width - x) * CELL, CELL), outside)
