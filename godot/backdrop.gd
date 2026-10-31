extends Node2D
# The campaign backdrop (docs/design/art.md): the inside of the factory hall (tools/make-backdrop.py) in three
# parallax layers standing on the floor line, with the sky for the hour, the sun or the moon, stars and clouds seen
# through the hall's tall windows. The lamps, sight glasses and vats glow, brighter after dusk. main.gd adds it behind the world, whose shader leaves the open sky clear, and
# sets the clock; it is not lit by the world's light, so it shades itself for the hour.

const HORIZON := 800.0
const ART := "res://art/backdrop/%s.png"
# Each layer and how far it moves with the camera (1 would be fixed to the world).
const LAYERS := [["far", 0.12], ["mid", 0.3], ["near", 0.55]]
# The sky at the top, the middle and the horizon through the day, by hour, in the palette's sky, night and dusk ramps.
const SKY_KEYS := [
    [0.0, "0b0c18", "121530", "242c66"],
    [4.5, "0b0c18", "121530", "242c66"],
    [6.0, "242c66", "8a3e6a", "f29a4a"],
    [7.5, "3f78c4", "7fb6ec", "d2e8f8"],
    [17.5, "3f78c4", "7fb6ec", "d2e8f8"],
    [19.5, "1a2048", "5a3c7a", "e2744f"],
    [21.0, "121530", "242c66", "5a3c7a"],
    [22.0, "0b0c18", "121530", "242c66"],
    [24.0, "0b0c18", "121530", "242c66"],
]
const SKY_HEIGHT := 440.0
const ROOF_COLOR := Color("1a2040")
const BANDS := 22
# Cloud sprites in clouds.png.
const CLOUDS := [Rect2(0, 0, 120, 44), Rect2(128, 0, 96, 36), Rect2(0, 48, 72, 30), Rect2(128, 48, 128, 40)]
const CLOUD_SPAN := 2600.0

var camera: Camera2D
var minute := 480.0
var level := 1.0
var textures := {}
var stars: Array = []
var clouds: Array = []

func _ready() -> void:
    z_index = -10
    texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    for layer in LAYERS:
        textures[layer[0]] = _load(ART % layer[0])
        textures[layer[0] + "-lights"] = _load(ART % (layer[0] + "-lights"))
    textures.clouds = _load(ART % "clouds")
    textures.sky = _load(ART % "sky")
    var rng := RandomNumberGenerator.new()
    rng.seed = 41
    for i in 160:
        stars.append([rng.randf() * 2400.0, rng.randf() * 360.0, rng.randf()])
    for i in 9:
        clouds.append([i % CLOUDS.size(), rng.randf() * CLOUD_SPAN, 120.0 + rng.randf() * 200.0, 0.6 + rng.randf() * 0.4])

func _load(path: String) -> Texture2D:
    if ResourceLoader.exists(path):
        return load(path)
    if not FileAccess.file_exists(path):
        return null
    var image := Image.load_from_file(ProjectSettings.globalize_path(path))
    return ImageTexture.create_from_image(image) if image != null else null

func _process(_delta: float) -> void:
    if visible:
        queue_redraw()

static func sky_colors(hour: float) -> Array:
    hour = fposmod(hour, 24.0)
    for i in SKY_KEYS.size() - 1:
        var a: Array = SKY_KEYS[i]
        var b: Array = SKY_KEYS[i + 1]
        if hour >= a[0] and hour <= b[0]:
            var t: float = 0.0 if b[0] == a[0] else (hour - a[0]) / (b[0] - a[0])
            return [Color(a[1]).lerp(Color(b[1]), t), Color(a[2]).lerp(Color(b[2]), t), Color(a[3]).lerp(Color(b[3]), t)]
    return [Color(SKY_KEYS[0][1]), Color(SKY_KEYS[0][2]), Color(SKY_KEYS[0][3])]

# How bright the hall's lamps and glowing fluids are: half by day, full by night.
func window_light() -> float:
    return 0.5 + 0.5 * clampf((0.9 - level) / 0.5, 0.0, 1.0)

# The layers darken with the light; the far ones stay a little paler, like the haze at night.
func layer_tint(depth: int) -> Color:
    # the hall goes to dark blue ahead of the plot at night, so its lamps and fluids carry it
    var light := preload("res://lighting.gd").ambient(pow(level, 1.4))
    var lift := (1.0 - level) * (0.1 - depth * 0.05)
    # indoors the hall stays in shade even by day, the far wall most, so the plot reads in front of it
    var shade: float = [0.58, 0.68, 0.8][depth]
    return Color(minf(light.r * shade + lift, 1.0), minf(light.g * shade + lift, 1.0), minf(light.b * (shade + 0.08) + lift * 1.6, 1.0))

func _view() -> Rect2:
    var size := get_viewport_rect().size / camera.zoom
    return Rect2(camera.get_screen_center_position() - size / 2.0, size)

func _draw() -> void:
    if camera == null:
        return
    var view := _view()
    var hour := minute / 60.0
    var colors := sky_colors(hour)
    # the sky in bands, from its top colour down to the horizon
    var top := HORIZON - SKY_HEIGHT
    if view.position.y < top:
        draw_rect(Rect2(view.position.x, view.position.y, view.size.x, top - view.position.y + 1.0), colors[0])
    var band := SKY_HEIGHT / BANDS
    for i in BANDS:
        var t := float(i) / (BANDS - 1)
        var color: Color = colors[0].lerp(colors[1], t * 2.0) if t < 0.5 else colors[1].lerp(colors[2], (t - 0.5) * 2.0)
        draw_rect(Rect2(view.position.x, top + i * band, view.size.x, band + 1.0), color)
    draw_rect(Rect2(view.position.x, HORIZON, view.size.x, maxf(0.0, view.end.y - HORIZON)), colors[2])
    _draw_stars(view)
    _draw_bodies(view, hour)
    _draw_clouds(view)
    for i in LAYERS.size():
        _draw_layer(view, LAYERS[i][0], LAYERS[i][1], layer_tint(i))
    # the hall's roof above the back wall
    var far: Texture2D = textures.get("far")
    if far != null and view.position.y < HORIZON - far.get_height():
        draw_rect(Rect2(view.position.x, view.position.y, view.size.x, HORIZON - far.get_height() - view.position.y + 1.0), ROOF_COLOR * layer_tint(0))

func _draw_stars(view: Rect2) -> void:
    var night := clampf(1.0 - level * 1.6, 0.0, 1.0)
    if night <= 0.0:
        return
    var origin := view.position.x * 0.98
    for star in stars:
        var x: float = origin + star[0] - 400.0
        if x < view.position.x or x > view.end.x:
            continue
        var y: float = HORIZON - 80.0 - star[1]
        var twinkle: float = 0.6 + 0.4 * sin(Time.get_ticks_msec() * 0.002 + star[2] * 90.0) if star[2] > 0.8 else 1.0
        var size := 2.0 if star[2] > 0.92 else 1.0
        draw_rect(Rect2(Vector2(x, y).floor(), Vector2(size, size)), Color(1.0, 0.97, 0.86, night * twinkle))

# The sun crosses from the east (right, past the street) to the west through the day; the moon by night.
func _draw_bodies(view: Rect2, hour: float) -> void:
    var sheet: Texture2D = textures.sky
    if sheet == null:
        return
    var day_t := (hour - 5.5) / 15.0
    if day_t > 0.0 and day_t < 1.0:
        var at := Vector2(view.get_center().x + (0.45 - day_t * 0.9) * view.size.x, HORIZON - 60.0 - sin(PI * day_t) * 300.0)
        draw_circle(at, 28.0, Color(1.0, 0.9, 0.6, 0.12))
        draw_texture_rect_region(sheet, Rect2((at - Vector2(16, 16)).floor(), Vector2(32, 32)), Rect2(0, 0, 32, 32))
    var night_t := fposmod(hour - 19.5, 24.0) / 11.0
    if night_t > 0.0 and night_t < 1.0:
        var at := Vector2(view.get_center().x + (0.4 - night_t * 0.8) * view.size.x, HORIZON - 80.0 - sin(PI * night_t) * 280.0)
        draw_texture_rect_region(sheet, Rect2((at - Vector2(16, 16)).floor(), Vector2(32, 32)), Rect2(32, 0, 32, 32))

func _draw_clouds(view: Rect2) -> void:
    var sheet: Texture2D = textures.clouds
    if sheet == null:
        return
    var tint := Color.WHITE.lerp(Color("f8c8a8"), clampf(1.0 - absf(level - 0.5) / 0.4, 0.0, 1.0) * 0.8)
    tint = tint * Color(1, 1, 1).lerp(Color(0.32, 0.36, 0.56), 1.0 - level)
    tint.a = 0.95
    var drift := minute * 0.4
    var origin := view.position.x * 0.94
    for cloud in clouds:
        var region: Rect2 = CLOUDS[cloud[0]]
        var x := origin + fposmod(cloud[1] + drift, CLOUD_SPAN) - 300.0
        if x > view.end.x or x + region.size.x < view.position.x:
            continue
        var y: float = HORIZON - cloud[2]
        draw_texture_rect_region(sheet, Rect2(Vector2(x, y).floor(), region.size), region, tint * Color(1, 1, 1, cloud[3]))

func _draw_layer(view: Rect2, name: String, follow: float, tint: Color) -> void:
    var texture: Texture2D = textures.get(name)
    if texture == null:
        return
    var lights: Texture2D = textures.get(name + "-lights")
    var width := float(texture.get_width())
    var offset := view.position.x * (1.0 - follow)
    var x := floorf((view.position.x - offset) / width) * width + offset
    var glow := window_light()
    while x < view.end.x:
        var at := Vector2(roundf(x), HORIZON - texture.get_height())
        draw_texture(texture, at, tint)
        if lights != null and glow > 0.0:
            draw_texture(lights, at, Color(1, 1, 1, glow))
        x += width
