extends SceneTree

var failures := 0
var checks := 0

func check(condition: bool, description: String) -> void:
    checks += 1
    if not condition:
        failures += 1
        push_error(description)

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    var world := EcologistWorld.new()
    check(not world.setup(0, 128, 7), "Reject invalid dimensions")
    check(world.setup(512, 128, 7), "Allocate reference-size world")
    check(not world.paint(-1, 20, 3, 1), "Reject paint outside world")
    check(not world.paint(20, 20, 3, 99), "Reject undefined liquid")
    check(world.paint(20, 20, 3, 1), "Paint water")
    var before: float = world.stats().liquid_units
    check(before > 255, "Brush fills several cells")
    world.advance(180)
    check(world.stats().liquid_units == before, "Transport conserves water")
    check(world.inspect(20, 20).amount == 0, "Water falls from painted position")
    check(world.pixels().size() == 512 * 128 * 4, "One RGBA texel per cell")
    var state_before: Dictionary = world.stats()
    check(world.render_data().size() == 512 * 128 * 8, "Two compact visual metadata planes")
    check(world.stats() == state_before, "Visual classification preserves simulation clock, amount and RNG")
    world.paint(60, 40, 1, 8)
    check(world.inspect(60, 40).temperature == 110, "Steam uses the reference pouring temperature")
    check(world.paint(40, 40, 1, -2), "Paint stone")
    world.paint(40, 40, 1, 1)
    check(world.inspect(40, 40).solid == 2 and world.inspect(40, 40).amount == 0, "Pouring respects solid terrain")
    world.paint(40, 40, 1, 0)
    check(world.inspect(40, 40).solid == 0, "Erase terrain")
    world.paint(40, 40, 1, 39)
    check(world.inspect(40, 40).type == 1 and world.inspect(40, 40).salt > 0, "Brine uses the shared water and salt composition")
    world.paint_grains(320, 200, 1, 1)
    world.paint_grains(328, 200, 1, 1)
    var grain_before: int = world.stats().grains
    world.paint(40, 25, 1, 0)
    check(world.stats().grains < grain_before and world.stats().grains > 0, "Erase removes center grains and preserves grains in the neighboring cell")
    world.setup(512, 128, 7)
    world.advance(60)
    check(world.stats().active_chunks == 0, "Undisturbed chunks go to sleep")
    world.paint(40, 40, 1, 1)
    check(world.stats().active_chunks > 0, "Painting wakes sleeping chunks")
    world.reset_demo(7)
    check(world.stats().tick == 0 and world.stats().liquid_units > 0, "Reset playable scene")
    var scene := load("res://main.tscn") as PackedScene
    check(scene != null, "Load playable scene")
    if scene:
        var game = scene.instantiate()
        root.add_child(game)
        check(game.surface.show_behind_parent, "Opaque world rendering stays behind the brush overlay")
        game.set_physics_process(false)
        var codes: Array = []
        for tool in game.TOOLS:
            codes.append(tool[1])
        for liquid in range(1, 40):
            check(codes.has(liquid), "Liquid %d is available in the native palette" % liquid)
        game.category_picker.select(4)
        game.tool_search.text = "valve"
        game._filter_tools()
        check(game.material_picker.item_count == 1 and game.TOOLS[game.material_picker.get_item_id(0)][1] == -26, "Search and categories retain correct material IDs")
        game.tool_search.text = ""
        game.category_picker.select(0)
        game._filter_tools()
        var native = EcologistWorld.new()
        native.setup(32, 32, 7)
        check(native.device_action(10, 10, -11, 1) and native.device_action(12, 10, -66, 1), "Native switch and pixel display can be placed")
        native.wire_action(10, 10)
        native.wire_action(12, 10)
        native.wire_action(10, 10)
        native.device_action(10, 10, -11, 1)
        native.device_action(12, 10, -66, 1)
        native.advance(1)
        check(native.inspect(12, 10).active and native.device_data()[1].colour == 1, "Wiring drives display and chosen color reaches renderer")
        native.paint(20, 20, 1, 1)
        native.dye(20, 20, 1, 3)
        check(native.solution_data()[((20 * 32 + 20) * 4) + 3] > 0, "Dye produces visible solution tint data")
        check(native.paint(25, 25, 1, -51) and native.inspect(25, 25).solid == 51, "Original copper terrain reaches native world")
        game._toggle_pause()
        var tick: int = game.world.stats().tick
        game._single_step()
        check(game.world.stats().tick == tick + 1 and game.paused, "Single step advances exactly once and pauses")
        game._select(7)
        game._resize_brush(99)
        check(game.selected == 7 and game.radius == 16, "Tool selection and brush bounds")
        game._zoom(100.0)
        check(game.camera.zoom.x == 5.0, "Zoom is bounded")
        game._select(9)
        check(game.selected == 9, "Select fine sugar brush")
        check(game.world.paint_grains(800, 200, 8, 2) > 0, "Paint individual sugar grains")
        check(game.world.grain_pixels().size() == 512 * 128 * 64, "Grain field has one cell per display pixel")
        game._toggle_workshop()
        check(game.workshop.visible and game.workshop.model.cash == 500, "Workshop opens with finite starting cash")
        var money: float = game.workshop.model.cash
        game._reset()
        check(game.workshop.model.cash == money, "Sandbox reset cannot reset the workshop ledger")
        game.workshop.save_path = "res://../.test-artifacts/workshop-save-test.json"
        game.workshop._save()
        check(game.workshop.model.message.begins_with("Workshop saved"), "Workshop writes a real save file")
        game.workshop.model.buy("sugar", 50)
        var saved_cash: float = game.workshop.model.cash
        game.workshop._save()
        check(game.workshop.model.message.begins_with("Workshop saved"), "Atomic save replaces the existing file")
        game.workshop.model.buy("sugar", 50)
        game.workshop._load_save()
        check(game.workshop.model.cash == saved_cash, "Workshop loads the latest file without changing sandbox state")
        game.free()
    print("Ecologist integration: %d checks, %d failures" % [checks, failures])
    quit(1 if failures else 0)
