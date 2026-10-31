extends SceneTree
# The base's rooms (docs/design/rooms.md): carving rooms into an empty world, linking neighbours, and walking and
# climbing between them with the real physics.

var checks := 0
var failures := 0

func check(condition: bool, description: String) -> void:
    checks += 1
    if not condition:
        failures += 1
        push_error(description)

func _initialize() -> void:
    var world := EcologistWorld.new()
    world.setup_base(7)
    var p: Dictionary = world.player_state()
    check(p.active and int(world.inspect(256, RoomsModel.GROUND).solid) != 0 and world.equipment_list().is_empty(), "The base starts empty: open air over the ground, nothing built")
    var rooms := RoomsModel.new(world)
    check(rooms.refusal(3, 0) == "" and rooms.add(0, 0, "workshop") == "", "The first room goes anywhere")
    var inside := RoomsModel.interior(0, 0)
    check(inside.size == Vector2i(22, 10) and int(world.inspect(inside.position.x + 3, inside.position.y + 3).solid) == 0, "A room is 22 by 10 open cells")
    check(int(world.inspect(inside.position.x, inside.position.y).back) & 15 == 4, "Its wall is the workshop's plaster")
    var r := RoomsModel.slot_rect(0, 0)
    check(int(world.inspect(r.position.x, r.position.y + 5).solid) == 24 and int(world.inspect(r.end.x, r.position.y + 5).solid) == 24 and int(world.inspect(r.position.x + 8, r.position.y).solid) == 24, "Steel walls and a ceiling slab close it in")
    check(rooms.refusal(2, 0) == "build next to a room" and rooms.refusal(1, 1) == "a room above ground needs a room under it" and rooms.refusal(3, -1) == "dig next to or under a room", "Rooms must join the base")
    check(rooms.add(1, 0, "lab") == "" and int(world.inspect(r.end.x, r.end.y - 2).solid) == 0 and int(world.inspect(r.end.x, r.end.y - 9).solid) == 24, "A room beside opens a doorway in the shared wall")
    check(rooms.add(0, 1, "grow") == "" and int(world.inspect(r.position.x + RoomsModel.HATCH, r.position.y).solid) == 0 and int(world.inspect(r.position.x + RoomsModel.HATCH, r.position.y + 4).back) & 64 != 0, "A room above opens a hatch with a ladder")
    check(rooms.add(0, -1, "cellar") == "" and int(world.inspect(inside.position.x + 3, RoomsModel.GROUND + 5).solid) == 0 and int(world.inspect(inside.position.x + 3, RoomsModel.GROUND + 12).solid) == 24, "A cellar is dug out under the ground with a steel floor")
    check(rooms.cost("cellar", -1) > rooms.cost("cellar", 0) and rooms.add(0, 0, "lab") == "there is a room here already", "Digging costs extra and slots hold one room")
    # walk right into the lab, then back and up the ladder into the grow room
    world.advance(20)
    world.player_input(false, true, false, false, false)
    for i in 120:
        world.advance(1)
    p = world.player_state()
    check(p.x > (r.end.x + 3) * 8 and p.on_ground, "The player walks through the doorway into the lab")
    var ladder_x := (r.position.x + RoomsModel.HATCH) * 8 + 6
    for i in 400:
        p = world.player_state()
        world.player_input(p.x > ladder_x + 2, p.x < ladder_x - 2, false, absf(p.x - ladder_x) <= 4, false)
        world.advance(1)
    p = world.player_state()
    check(p.y + p.height <= (r.position.y) * 8 + 1, "The player climbs the ladder up into the grow room")
    var saved := rooms.save_data()
    var again := RoomsModel.new(null)
    again.load_data(saved)
    check(again.rooms.size() == 4 and again.rooms[Vector2i(0, -1)] == "cellar", "Rooms save and load")
    call_deferred("game_checks")

# The base in the game: one bare room at the start, rooms bought in room mode, furniture placed and taken back.
func game_checks() -> void:
    var game = load("res://main.tscn").instantiate()
    root.add_child(game)
    await physics_frame
    game.set_physics_process(false)
    check(game.rooms.rooms.size() == 1 and game.rooms.has(0, 0) and game.world.equipment_list().is_empty() and game.furniture.placed.is_empty(), "The game starts in one bare room")
    game.workshop.model.cash = 1000.0
    game.room_type = 1
    check(game._build_room(Vector2i(1, 0)) == "" and game.rooms.rooms[Vector2i(1, 0)] == "lab" and is_equal_approx(game.workshop.model.cash, 800.0), "A lab is bought next to it")
    check(game._build_room(Vector2i(3, 0)) == "build next to a room" and is_equal_approx(game.workshop.model.cash, 800.0), "A room apart from the base is refused, free")
    game.room_type = 3
    check(game._build_room(Vector2i(0, -1)) == "" and is_equal_approx(game.workshop.model.cash, 650.0), "A cellar costs extra to dig")
    var tank := -1
    for i in game.furniture.pieces.size():
        if game.furniture.pieces[i].id == "tank":
            tank = i
    game.furnish_index = tank
    var inside := RoomsModel.interior(1, 0)
    var at := Vector2((inside.position.x + 8) * 8.0, (inside.position.y + 4) * 8.0)
    check(game._furnish(at) == "" and game.furniture.placed.size() == 1 and is_equal_approx(game.workshop.model.cash, 500.0), "A tank is placed in the lab for its price")
    var spot: Rect2 = game.furniture.rect_of(game.furniture.placed[0])
    check(is_equal_approx(spot.end.y, inside.end.y * 8.0), "It stands on the lab's floor")
    check(game._furnish(at) == "something is in the way", "Two pieces can't overlap")
    check(game._furnish(Vector2(40, 40)) == "furniture goes inside a room", "Furniture goes inside rooms only")
    check(game.furniture.remove_at(spot.get_center()) == "tank" and game.furniture.placed.is_empty(), "A placed piece can be taken back")
    game.free()
    print("Rooms: %d checks, %d failures" % [checks, failures])
    quit(1 if failures else 0)
