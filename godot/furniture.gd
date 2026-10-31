extends Node2D
# Furniture in the base's rooms (docs/design/rooms.md): the generated pieces in art/rooms/furniture.png, placed
# freely inside rooms. A floor piece stands on a room's floor, a ceiling piece hangs from its ceiling; pieces don't
# overlap. main.gd owns the mode and the cash; this node keeps the placements, checks them and draws them in the
# campaign light. Pieces with "equipment" (the glass tanks and the vat) are real equipment: main.gd places them in
# the world, which owns and draws them; here they only get their spot, on the cell grid, and their preview.

const ART := "res://art/rooms/furniture.png"
const VESSELS := "res://art/rooms/vessels.png"
const DATA := "res://data/furniture.json"
const WIDTH := 512 # the world's cells, as in main.gd
const HEIGHT := 128

var pieces: Array = []      # the catalogue from data/furniture.json
var placed: Array = []      # {id, x, y}: x the left edge, y the bottom edge, in world pixels
var rooms: RoomsModel
var texture: Texture2D
var vessels: Texture2D
var frame: Texture2D # art/rooms/walls.png: the floor slab at (0, 64) and the room post at (384, 0)
var world
var frame_tiles: Array = []

func _ready() -> void:
    z_index = 1
    texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    use_parent_material = true

func setup(model: RoomsModel) -> void:
    rooms = model
    var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(DATA))
    pieces = data.pieces
    texture = UiStyle.texture(ART)
    vessels = UiStyle.texture(VESSELS)

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
    if piece(id).has("equipment"):
        left = clampf(roundf(left / 16.0) * 16.0, inside.position.x * 8.0, floorf((inside.end.x * 8.0 - size.x) / 16.0) * 16.0)
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
    if world != null:
        for y in range(int(rect.position.y) / 8, ceili(rect.end.y / 8.0)):
            for x in range(int(rect.position.x) / 8, ceili(rect.end.x / 8.0)):
                if world.equipment_at(x, y) >= 0:
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
    var sheet := vessels if piece(id).has("equipment") else texture
    if sheet == null:
        return
    var r: Array = piece(id).region
    canvas.draw_texture_rect_region(sheet, rect, Rect2(r[0], r[1], r[2], r[3]), tint)

func _draw() -> void:
    if frame != null:
        for tile in frame_tiles:
            draw_texture_rect_region(frame, Rect2(tile[0], Vector2(16, 16)), Rect2(tile[1], Vector2(16, 16)))
    for entry in placed:
        draw_piece(self, entry.id, rect_of(entry))

# The rooms' steel frame drawn over its cells: the generated slab along ceilings and floors, the post up the walls.
# Found from the world's cells (render_data's first plane: material in blue) on each refresh, and redrawn only when
# it changed. Each entry is [where in the world, where in walls.png].
func refresh_frames(cells: PackedByteArray) -> void:
    var tiles: Array = []
    for k in rooms.rooms:
        var r := RoomsModel.slot_rect(k.x, k.y)
        for x in range(r.position.x, r.end.x + RoomsModel.WALL, 2):
            for y in [r.position.y, r.end.y]:
                if _material(cells, x, y) == RoomsModel.SLAB_BLOCK:
                    tiles.append([Vector2(x * 8, y * 8), Vector2((x * 8) % 64, 64)])
        for x in [r.position.x, r.end.x]:
            for y in range(r.position.y + RoomsModel.SLAB, r.end.y, 2):
                if _material(cells, x, y) == RoomsModel.SLAB_BLOCK:
                    tiles.append([Vector2(x * 8, y * 8), Vector2(384, ((y - r.position.y - RoomsModel.SLAB) * 8) % 80)])
    if tiles != frame_tiles:
        frame_tiles = tiles
        queue_redraw()

func _material(cells: PackedByteArray, x: int, y: int) -> int:
    if x < 0 or y < 0 or x >= WIDTH or y >= HEIGHT:
        return 0
    return cells[(y * WIDTH + x) * 4 + 2]
