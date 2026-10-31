class_name RoomsModel
extends RefCounted
# The base's rooms (docs/design/rooms.md): slots on a grid, carved into the world's cells so the simulation runs
# inside them. A slot is PITCH cells wide and LEVEL cells tall; level 0 stands on the ground line, positive levels
# stack upward on rooms below, negative levels are dug into the earth. Each room owns its left wall and its ceiling
# slab; the floor is the ceiling of the slot below (or the ground's concrete cap). Neighbours side by side share a
# doorway; neighbours above and below share a ladder up through a hatch.

const PITCH := 24
const LEVEL := 12
const SLAB := 2
const WALL := 2
const DOOR_ROWS := 6
const HATCH := 4 # the ladder's column, from the slot's left edge
const GROUND := 48
const ORIGIN_X := 244 # slot 0's left edge, so the start room's middle is the spawn column (256)
const MIN_SLOT := -10
const MAX_SLOT := 9
const MIN_LEVEL := -6
const MAX_LEVEL := 3

const REMOVE := 1000
const LADDER := 1003
const BACK_KIND := 1100
const SLAB_BLOCK := 24 # steel
const TYPES := {
    "workshop": {"name": "Workshop", "wall": 4, "cost": 120.0, "about": "a plain room to start anything in"},
    "lab": {"name": "Lab", "wall": 5, "cost": 200.0, "about": "steel walls for tanks, pumps and pipes"},
    "grow": {"name": "Grow room", "wall": 6, "cost": 180.0, "about": "white tiles and grow lights for plants"},
    "cellar": {"name": "Cellar", "wall": 7, "cost": 90.0, "about": "bare concrete, cheap storage"},
}
const DIG_COST := 60.0 # extra for a room below the ground

var world
var rooms := {} # Vector2i(slot, level) -> type id

func _init(target = null) -> void:
    world = target

static func key(slot: int, level: int) -> Vector2i:
    return Vector2i(slot, level)

# The slot's cell rectangle: left wall to the far side of its interior, ceiling slab to the last interior row.
static func slot_rect(slot: int, level: int) -> Rect2i:
    return Rect2i(ORIGIN_X + slot * PITCH, GROUND - (level + 1) * LEVEL, PITCH, LEVEL)

# The open inside of a room, in cells.
static func interior(slot: int, level: int) -> Rect2i:
    var r := slot_rect(slot, level)
    return Rect2i(r.position.x + WALL, r.position.y + SLAB, PITCH - WALL, LEVEL - SLAB)

static func slot_at(cell: Vector2i) -> Vector2i:
    return Vector2i(floori(float(cell.x - ORIGIN_X) / PITCH), floori(float(GROUND - 1 - cell.y) / LEVEL))

func has(slot: int, level: int) -> bool:
    return rooms.has(key(slot, level))

func cost(type: String, level: int) -> float:
    return float(TYPES[type].cost) + (DIG_COST if level < 0 else 0.0)

# Why a room can't go here, or "" if it can: next to a room on its level, on top of a room, or (underground) under
# one. The first room needs nothing.
func refusal(slot: int, level: int) -> String:
    if slot < MIN_SLOT or slot > MAX_SLOT or level < MIN_LEVEL or level > MAX_LEVEL:
        return "too far from the base"
    if has(slot, level):
        return "there is a room here already"
    if rooms.is_empty():
        return ""
    var beside := has(slot - 1, level) or has(slot + 1, level)
    if level > 0:
        return "" if has(slot, level - 1) else "a room above ground needs a room under it"
    if level == 0:
        return "" if beside else "build next to a room"
    return "" if beside or has(slot, level + 1) else "dig next to or under a room"

# Carves the room into the world and links it to its neighbours. Returns "" or why not.
func add(slot: int, level: int, type: String) -> String:
    if not TYPES.has(type):
        return "no such room"
    var why := refusal(slot, level)
    if not why.is_empty():
        return why
    rooms[key(slot, level)] = type
    _carve(slot, level)
    _link(slot, level)
    return ""

func _put(x: int, y: int, code: int) -> void:
    world.build(x, y, code)

func _solid(x: int, y: int) -> void:
    # clear what is there (earth, liquids stay out of the way of a 2x2 tile), then lay steel
    if int(world.inspect(x, y).get("solid", 0)) != SLAB_BLOCK:
        _put(x, y, REMOVE)
        _put(x, y, -SLAB_BLOCK)

func _carve(slot: int, level: int) -> void:
    var r := slot_rect(slot, level)
    var inside := interior(slot, level)
    var wall: int = TYPES[rooms[key(slot, level)]].wall
    # the ceiling slab, the left wall, the right wall (the next slot's left wall) and, underground, the floor
    for x in range(r.position.x, r.end.x + WALL, 2):
        _solid(x, r.position.y)
    for y in range(r.position.y, r.end.y, 2):
        _solid(r.position.x, y)
        _solid(r.end.x, y)
    if level < 0:
        for x in range(r.position.x, r.end.x + WALL, 2):
            _solid(x, r.end.y)
    # hollow it out and put the wall up behind
    for y in range(inside.position.y, inside.end.y, 2):
        for x in range(inside.position.x, inside.end.x, 2):
            while int(world.inspect(x, y).get("solid", 0)) != 0 and world.build(x, y, REMOVE) > 0:
                pass
            _put(x, y, BACK_KIND + wall)

func _link(slot: int, level: int) -> void:
    for side in [-1, 1]:
        if has(slot + side, level):
            _doorway(slot + (1 if side > 0 else 0), level)
    if has(slot, level - 1):
        _hatch(slot, level - 1)
    if has(slot, level + 1):
        _hatch(slot, level)

# Opens the wall on the left edge of `slot` at `level` into a doorway, floor up.
func _doorway(slot: int, level: int) -> void:
    var r := slot_rect(slot, level)
    var wall: int = TYPES[rooms.get(key(slot, level), rooms.get(key(slot - 1, level), "workshop"))].wall
    for y in range(r.end.y - DOOR_ROWS, r.end.y, 2):
        while int(world.inspect(r.position.x, y).get("solid", 0)) != 0 and world.build(r.position.x, y, REMOVE) > 0:
            pass
        _put(r.position.x, y, BACK_KIND + wall)

# A hatch in the ceiling of the room at `level`, two tiles wide so the player fits, with a ladder from its floor up
# into the room above.
func _hatch(slot: int, level: int) -> void:
    var r := slot_rect(slot, level)
    var above := slot_rect(slot, level + 1)
    for x in [r.position.x + HATCH, r.position.x + HATCH + 2]:
        while int(world.inspect(x, r.position.y).get("solid", 0)) != 0 and world.build(x, r.position.y, REMOVE) > 0:
            pass
        for y in range(above.end.y - 2, r.end.y, 2):
            _put(x, y, LADDER)

func save_data() -> Array:
    var out := []
    for k in rooms:
        out.append([k.x, k.y, rooms[k]])
    return out

func load_data(data: Array) -> void:
    rooms.clear()
    for entry in data:
        rooms[key(int(entry[0]), int(entry[1]))] = String(entry[2])
