extends Node2D
# Furniture in the base's rooms (docs/design/rooms.md): the generated pieces in art/rooms/furniture.png, placed
# freely inside rooms. A floor piece stands on a room's floor, a ceiling piece hangs from its ceiling; pieces don't
# overlap. main.gd owns the mode and the cash; this node keeps the placements, checks them and draws them in the
# campaign light.

const ART := "res://art/rooms/furniture.png"
const DATA := "res://data/furniture.json"

var pieces: Array = []      # the catalogue from data/furniture.json
var placed: Array = []      # {id, x, y}: x the left edge, y the bottom edge, in world pixels
var rooms: RoomsModel
var texture: Texture2D
var frame: Texture2D # art/rooms/walls.png: the floor slab at (0, 64) and the room post at (384, 0)
var world

func _ready() -> void:
    z_index = 1
    texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    use_parent_material = true

func setup(model: RoomsModel) -> void:
    rooms = model
    var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DATA))
    pieces = data.pieces
    if ResourceLoader.exists(ART):
        texture = load(ART)

func piece(id: String) -> Dictionary:
    for p in pieces:
        if p.id == id:
            return p
    return {}

func size_of(id: String) -> Vector2:
    var r: Array = piece(id).region
    return Vector2(r[2], r[3])

# Where a piece would go with its middle under the pointer: snapped to the room's floor or ceiling. Returns the
# rect in world pixels, or an empty rect if the pointer is in no room.
func spot(id: String, pointer: Vector2) -> Rect2:
    var cell := Vector2i((pointer / 8.0).floor())
    var slot := RoomsModel.slot_at(cell)
    if not rooms.has(slot.x, slot.y):
        return Rect2()
    var inside := RoomsModel.interior(slot.x, slot.y)
    var size := size_of(id)
    var left := clampf(roundf(pointer.x - size.x / 2.0), inside.position.x * 8.0, inside.end.x * 8.0 - size.x)
    var top := inside.end.y * 8.0 - size.y if piece(id).stand == "floor" else inside.position.y * 8.0
    return Rect2(left, top, size.x, size.y)

func rect_of(entry: Dictionary) -> Rect2:
    var size := size_of(entry.id)
    return Rect2(entry.x, entry.y - size.y, size.x, size.y)

func refusal(id: String, rect: Rect2) -> String:
    if rect.size == Vector2.ZERO:
        return "furniture goes inside a room"
    if rect.size.y > RoomsModel.interior(0, 0).size.y * 8:
        return "too tall for a room"
    for entry in placed:
        if rect_of(entry).grow(-1).intersects(rect.grow(-1)):
            return "something is in the way"
    return ""

func place(id: String, rect: Rect2) -> void:
    placed.append({"id": id, "x": rect.position.x, "y": rect.end.y})
    queue_redraw()

# Removes the piece under the pointer; returns its id or "".
func remove_at(pointer: Vector2) -> String:
    for i in range(placed.size() - 1, -1, -1):
        if rect_of(placed[i]).has_point(pointer):
            var id: String = placed[i].id
            placed.remove_at(i)
            queue_redraw()
            return id
    return ""

func draw_piece(canvas: CanvasItem, id: String, rect: Rect2, tint := Color.WHITE) -> void:
    if texture == null:
        return
    var r: Array = piece(id).region
    canvas.draw_texture_rect_region(texture, rect, Rect2(r[0], r[1], r[2], r[3]), tint)

func _draw() -> void:
    _draw_frames()
    for entry in placed:
        draw_piece(self, entry.id, rect_of(entry))

# The rooms' steel frame drawn over its cells: the generated slab along ceilings and floors, the post up the walls.
func _draw_frames() -> void:
    if frame == null or world == null:
        return
    for k in rooms.rooms:
        var r := RoomsModel.slot_rect(k.x, k.y)
        for x in range(r.position.x, r.end.x + RoomsModel.WALL, 2):
            for y in [r.position.y, r.end.y]:
                if int(world.inspect(x, y).get("solid", 0)) == RoomsModel.SLAB_BLOCK:
                    var u := (x * 8) % 64
                    draw_texture_rect_region(frame, Rect2(x * 8, y * 8, 16, 16), Rect2(u, 64, 16, 16))
        for x in [r.position.x, r.end.x]:
            for y in range(r.position.y + RoomsModel.SLAB, r.end.y, 2):
                if int(world.inspect(x, y).get("solid", 0)) == RoomsModel.SLAB_BLOCK:
                    var v := ((y - r.position.y - RoomsModel.SLAB) * 8) % 80
                    draw_texture_rect_region(frame, Rect2(x * 8, y * 8, 16, 16), Rect2(384, v, 16, 16))
