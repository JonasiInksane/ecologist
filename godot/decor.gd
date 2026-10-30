extends Node2D
# The props (docs/design/art.md): fences, lamps, shelves, plants and the cat, placed on the plot from data/decor.json
# and drawn in front of the world, behind people and machines, in the campaign light (main.gd's sprite shader). A
# prop shows only while what holds it up is there: the ground under it, the wall behind it or the ceiling over it, so
# building and digging can take it away. Lamps add their light to lighting.gd and a glow after dusk.

const SHEET := "res://art/decor.png"
const CELL := 8.0

var main: Node
var sheet: Texture2D
var data: Dictionary = {}
var shown: Array = []
var glow := Node2D.new()
var glow_power := -1.0

func setup(owner: Node) -> void:
    main = owner

func _ready() -> void:
    data = JSON.parse_string(FileAccess.get_file_as_string("res://data/decor.json"))
    sheet = main._load_texture(SHEET)
    use_parent_material = true
    show_behind_parent = true
    texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    var add := CanvasItemMaterial.new()
    add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
    glow.material = add
    glow.z_index = 40
    glow.draw.connect(_draw_glow)
    add_child(glow)

func _process(_delta: float) -> void:
    var power: float = main.lighting.lamp_power(main.lighting.level)
    if absf(power - glow_power) > 0.01:
        glow_power = power
        glow.queue_redraw()

func _region(placement: Dictionary) -> Rect2:
    var r: Array = data.sprites[placement.sprite]
    return Rect2(r[0], r[1], r[2], r[3])

# Whether each prop's anchor holds, from the world's cells (render_data's first plane: material in blue) and the
# building layer. Returns true when that changed.
func refresh(cells: PackedByteArray, back: PackedByteArray, width: int, height: int) -> bool:
    var now: Array = []
    for placement in data.placements:
        var size := _region(placement).size
        var cx := int(floor((float(placement.x) + size.x / 2.0) / CELL))
        var ok := true
        match String(placement.anchor):
            "ground":
                ok = _solid(cells, cx, int(floor(float(placement.y) / CELL)), width, height)
            "ceiling":
                ok = _solid(cells, cx, int(floor((float(placement.y) - size.y - 1.0) / CELL)), width, height)
            "wall":
                var cy := int(floor((float(placement.y) - size.y / 2.0) / CELL))
                ok = cx >= 0 and cy >= 0 and cx < width and cy < height and (back[cy * width + cx] & 0x0F) != 0
        now.append(ok)
    if now == shown:
        return false
    shown = now
    queue_redraw()
    glow.queue_redraw()
    return true

func _solid(cells: PackedByteArray, x: int, y: int, width: int, height: int) -> bool:
    return x >= 0 and y >= 0 and x < width and y < height and cells[(y * width + x) * 4 + 2] != 0

# The lamps of the props that are standing, for lighting.gd.
func lamps() -> Array:
    var list: Array = []
    for i in data.placements.size():
        var placement: Dictionary = data.placements[i]
        if placement.has("light") and i < shown.size() and shown[i]:
            var light: Dictionary = placement.light
            var top := float(placement.y) - _region(placement).size.y
            list.append({"x": float(placement.x) + float(light.dx), "y": top + float(light.dy), "radius": float(light.radius),
                "strength": float(light.strength), "color": Color(String(light.color)), "pool": bool(light.get("pool", false)),
                "indoor_day": float(light.get("indoor_day", 0.0))})
    return list

func _draw() -> void:
    if sheet == null:
        return
    for i in data.placements.size():
        if i < shown.size() and shown[i]:
            var placement: Dictionary = data.placements[i]
            var region := _region(placement)
            draw_texture_rect_region(sheet, Rect2(Vector2(float(placement.x), float(placement.y) - region.size.y), region.size), region)

# Halos round the lamps after dusk, added over everything.
func _draw_glow() -> void:
    if glow_power <= 0.0:
        return
    for i in data.placements.size():
        var placement: Dictionary = data.placements[i]
        if not placement.has("glow") or i >= shown.size() or not shown[i]:
            continue
        var light: Dictionary = placement.light
        var at := Vector2(float(placement.x) + float(light.dx), float(placement.y) - _region(placement).size.y + float(light.dy))
        var radius := float(placement.glow)
        var color := Color(String(light.color))
        for step in 3:
            var r := radius * (2.4 - step * 0.7)
            glow.draw_circle(at, r, Color(color.r, color.g, color.b, (0.07 + step * 0.05) * glow_power))
