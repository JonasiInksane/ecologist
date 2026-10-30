extends Node
# Day and night on the campaign plot. The light of the hour follows the game clock: full day from 07:00 to 19:00,
# dawn and dusk over two hours with a warm tint, dark from 21:00 to 05:00. The world shader and the sprite shader
# multiply what they draw by it (lighting.gdshaderinc): the outdoor light, the light in rooms (cells with a
# background wall), which a lamp keeps warm after dark, and up to 16 point lights from the lamps, which come on at
# dusk. main.gd calls update_light every frame and apply() when it changed; the sandbox does not use it.

const NIGHT := Color(0.26, 0.31, 0.5)
const LAMP := Color(1.0, 0.86, 0.66)
const MAX_LIGHTS := 16

var level := 1.0
# Point lights: {x, y, radius (world pixels), strength, color}.
var lamps: Array = []
var dirty := true

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

# Lamps are off by day and come up through dusk.
static func lamp_power(light: float) -> float:
    return clampf((0.85 - light) / 0.5, 0.0, 1.0)

func update_light(minute: float) -> void:
    var light := daylight(minute)
    if absf(light - level) > 0.002:
        level = light
        dirty = true

func set_lamps(list: Array) -> void:
    lamps = list
    dirty = true

# The lamps burning now, as the shader's arrays.
func spots() -> Array:
    var power := lamp_power(level)
    var lit: Array = []
    if power <= 0.0:
        return lit
    for lamp in lamps:
        if lit.size() < MAX_LIGHTS:
            lit.append(lamp)
    return lit

func apply(materials: Array) -> void:
    var power := lamp_power(level)
    var burning := spots()
    var positions := PackedVector4Array()
    var colors := PackedVector3Array()
    positions.resize(MAX_LIGHTS)
    colors.resize(MAX_LIGHTS)
    for i in burning.size():
        var lamp: Dictionary = burning[i]
        positions[i] = Vector4(lamp.x, lamp.y, lamp.radius, lamp.strength * power)
        var color: Color = lamp.color
        colors[i] = Vector3(color.r, color.g, color.b)
    var outside := ambient(level)
    var inside := indoor(level)
    for material in materials:
        material.set_shader_parameter("lit", true)
        material.set_shader_parameter("ambient_light", Vector3(outside.r, outside.g, outside.b))
        material.set_shader_parameter("room_light", Vector3(inside.r, inside.g, inside.b))
        material.set_shader_parameter("light_count", burning.size())
        material.set_shader_parameter("light_spots", positions)
        material.set_shader_parameter("light_colors", colors)
    dirty = false

static func off(materials: Array) -> void:
    for material in materials:
        material.set_shader_parameter("lit", false)
