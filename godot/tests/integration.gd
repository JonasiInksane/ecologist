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
    world.setup(512, 128, 7)
    world.paint(30, 100, 1, -18)
    check(world.ignite(30, 100, 1), "Ignite heats fuel under the brush")
    world.advance(4)
    check(world.inspect(30, 100).burning and world.stats().burning > 0, "Hot wood in open air burns")
    check(world.inspect(31, 100).air and world.inspect(31, 100).oxygen <= 21.0, "Inspect reports the air's oxygen")
    check(world.fire_data().size() == 512 * 128, "One fire byte per cell")
    world.flow(false, true)
    check(not world.stats().pressure and world.stats().momentum, "Pressure and momentum can be switched separately")
    # M0: the campaign plot, its player, building, doors and world saves.
    var plot := EcologistWorld.new()
    plot.setup_plot(7)
    var hero: Dictionary = plot.player_state()
    check(hero.active and hero.health == 100.0, "The campaign plot starts with a player")
    plot.advance(30)
    check(plot.player_state().on_ground, "The player stands on the shack floor")
    check(plot.inspect(270, 96).solid == 80, "The shack has a closed door")
    plot.player_input(false, true, false, false, false)
    plot.advance(240)
    check(plot.player_state().x + 20 <= 270 * 8, "The closed door stops the player")
    check(plot.use_door_near_player() and plot.inspect(270, 96).solid == 0, "The interact key opens the nearest door")
    plot.advance(4)
    check(not plot.toggle_door(270, 96), "A door does not close on the player")
    plot.advance(120)
    check(plot.player_state().x > 280 * 8, "The player walks out through the open door")
    check(plot.build(300, 98, -18) == 4 and plot.inspect(300, 98).solid == 18, "Campaign build places a wood tile")
    check(plot.build(int(plot.player_state().x / 8), 96, -2) == 0, "Solid tiles are never built inside the player")
    check(plot.build(300, 90, 1003) == 4 and (int(plot.inspect(300, 90).back) & 0x40) != 0, "Ladders go on the background layer")
    check(plot.back_data().size() == 512 * 128, "One background byte per cell")
    var save_path := ProjectSettings.globalize_path("res://../.test-artifacts/world-save-test.ecosave")
    check(plot.save_world(save_path) == "", "The world saves")
    var copy := EcologistWorld.new()
    check(copy.load_world(save_path) == "", "The world loads")
    plot.player_input(false, false, false, false, false)
    plot.advance(60)
    copy.advance(60)
    check(copy.stats().tick == plot.stats().tick and copy.player_state().x == plot.player_state().x and copy.render_data() == plot.render_data(), "A loaded world continues identically")
    check(copy.load_world(ProjectSettings.globalize_path("res://project.godot")) != "", "Other files are refused as saves")
    # M1: the shack kitchen, driven through the adapter: fill a pan, cook candy, pour, set, collect, carry, save.
    var shack := EcologistWorld.new()
    shack.setup_plot(7)
    var kinds: Array = shack.equipment_kinds()
    check(kinds.size() == 6 and kinds[3].id == "saucepan" and kinds[0].support and not kinds[3].support, "Six kinds of kitchen equipment")
    var ids := {}
    for info in shack.equipment_list():
        ids[info.kind] = info.id
    var pan: int = ids.get("saucepan", -1)
    var stove: int = ids.get("stove", -1)
    var mold: int = ids.get("candy_mold", -1)
    var sink: int = ids.get("sink", -1)
    check(ids.size() == 5 and shack.equipment_info(pan).resting_on == stove and shack.inspect(259, 95).solid == 81, "The shack starts with a stove, a pan on it, a sink, a table and a mold")
    check(shack.equipment_at(259, 95) == pan and shack.equipment_at(259, 97) == stove and shack.equipment_at(259, 92) == -1, "Cells find their equipment")
    check(shack.vessel_add(pan, "sugar", 600, 20) == "" and shack.vessel_add(pan, "water", 200, 15) == "", "Sugar and water go in the pan")
    check(shack.vessel_add(pan, "sugar", 5000, 20) == "it would overflow", "A pan cannot overflow")
    check(shack.equipment_set(stove, 2) and not shack.equipment_set(pan, 2), "Only stoves have a flame")
    var pan_info: Dictionary = shack.equipment_info(pan)
    for i in 300:
        pan_info = shack.equipment_info(pan)
        if pan_info.temperature >= 150.0:
            break
        if pan_info.sugar_crystals < 0.01:
            shack.equipment_set(stove, 1 if pan_info.temperature > 138.0 else 3)
        shack.advance(60)
    check(pan_info.temperature >= 150.0 and pan_info.stage == "hard crack" and pan_info.brix > 0.97, "Boiled down to the hard crack with every crystal dissolved")
    check(shack.budget("stove_joules") > 100000.0, "The stove's gas is metered")
    var poured: Dictionary = shack.vessel_pour(pan, mold)
    shack.equipment_set(stove, 0)
    check(float(poured.grams) > 600.0 and poured.error == "", "Hot candy pours into the mold")
    for i in 120:
        if shack.equipment_info(mold).set:
            break
        shack.advance(60)
    var candy: Dictionary = shack.vessel_collect(mold)
    check(candy.id == "hard_candy_a" and candy.grade == "A" and float(candy.grams) > 600.0, "Candy poured at 150 °C sets glass-clear, grade A")
    check(shack.vessel_collect(mold).error == "the mold is empty", "An empty mold has nothing to collect")
    check(shack.vessel_add(pan, "sea_water", 1000, 20) == "" and shack.equipment_info(pan).salinity > 0.03, "Sea water reads as brine")
    var moved: Dictionary = shack.equipment_move(pan, 244, 95)
    pan = moved.id
    check(pan >= 0 and shack.equipment_info(pan).resting_on == sink and shack.equipment_info(pan).mass > 999.0, "A pan is carried to the sink, contents and all")
    check(shack.equipment_remove(sink) == "take what stands on it off first" and shack.equipment_remove(pan) == "empty it first", "Equipment in use cannot be picked up")
    var drained: float = shack.vessel_drain(pan, true)
    check(drained > 999.0 and shack.equipment_remove(pan) == "", "A drained pan is picked up")
    var bench: Dictionary = shack.equipment_place("table", 400, 99)
    check(int(bench.id) >= 0 and shack.equipment_place("stove", 401, 99).error == "something is in the way", "New equipment is placed and does not overlap")
    var kitchen_path := ProjectSettings.globalize_path("res://../.test-artifacts/kitchen-save-test.ecosave")
    shack.vessel_add(mold, "water", 300, 60)
    check(shack.save_world(kitchen_path) == "", "A world with a kitchen saves")
    var kitchen_copy := EcologistWorld.new()
    check(kitchen_copy.load_world(kitchen_path) == "" and kitchen_copy.equipment_list().size() == shack.equipment_list().size(), "The kitchen loads with every piece")
    shack.advance(60)
    kitchen_copy.advance(60)
    check(kitchen_copy.equipment_info(mold).temperature == shack.equipment_info(mold).temperature and kitchen_copy.budget("stove_joules") == shack.budget("stove_joules"), "A loaded kitchen carries on identically")
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
        check(game.campaign and game.world == game.campaign_world, "The game starts in campaign mode")
        check(game.build_items.size() >= 10 and game.player_texture != null, "Build palette and player sprite load")
        game._set_mode(false)
        check(game.world == game.sandbox_world and not game.build_bar.visible, "Tab switches to the free sandbox")
        game._set_mode(true)
        var cash_before: float = game.workshop.model.cash
        var spot := Vector2i(int(game.player.x / 8) - 4, 86)
        game._select_build(0)
        game.removing = false
        game.last_build = Vector2i(-1, -1)
        game._campaign_build(spot)
        check(is_equal_approx(game.workshop.model.cash, cash_before - 2.0), "Building charges the tile's cost")
        game.removing = true
        game.last_build = Vector2i(-1, -1)
        game._campaign_build(spot)
        check(is_equal_approx(game.workshop.model.cash, cash_before - 1.0), "Removing a tile refunds half its cost")
        game.removing = false
        game._campaign_build(Vector2i(20, 90))
        check(is_equal_approx(game.workshop.model.cash, cash_before - 1.0) and game.world.inspect(20, 90).solid == 0, "Building out of reach is refused")
        # M1 in the game: the kitchen kit bar, the kitchen panel, ingredients from stock and the tap, gas billing.
        check(game.kit_items.size() == 6 and game.kitchen != null and not game.kitchen.visible, "The kitchen kit loads")
        game._set_kit_mode(true)
        check(game.kit_buttons[0].visible and not game.build_buttons[0].visible, "K swaps the build bar to the kitchen kit")
        var game_ids := {}
        for info in game.world.equipment_list():
            game_ids[info.kind] = info.id
        var game_pan: int = game_ids.saucepan
        var pan_cell := Vector2i(int(game.world.equipment_info(game_pan).x), int(game.world.equipment_info(game_pan).y))
        check(game._equipment_click(pan_cell, false) and game.kitchen.visible and game.kitchen.current == game_pan, "Clicking a pan opens the kitchen panel")
        var sugar: float = game.workshop.model.amount("sugar")
        game.kitchen.ingredient.select(0)
        game.kitchen.grams.value = 100
        game.kitchen._add()
        check(is_equal_approx(game.workshop.model.amount("sugar"), sugar - 100.0) and is_equal_approx(game.world.equipment_info(game_pan).mass, 100.0), "Sugar comes out of stock into the pan")
        var tap_cash: float = game.workshop.model.cash
        game.kitchen.ingredient.select(2)
        game.kitchen._add()
        check(game.workshop.model.cash < tap_cash and is_equal_approx(game.world.equipment_info(game_pan).mass, 200.0), "Tap water is billed")
        check(game.kitchen.flame_row.visible and game.kitchen.readings.text.contains("thermometer"), "The panel shows the flame and asks for a thermometer")
        game.kitchen._buy_tool("thermometer")
        game.kitchen.refresh()
        check(game.workshop.model.equipment.has("thermometer") and game.kitchen.readings.text.contains("°C"), "A thermometer reveals the temperature")
        game.kitchen._set_flame(3)
        var gas_cash: float = game.workshop.model.cash
        game.kitchen.reset()
        game.world.advance(600)
        game.kitchen.bill()
        check(game.workshop.model.cash < gas_cash - 0.1, "Gas is billed as the stove burns")
        game.kitchen.open(game_pan)
        game.kitchen._set_flame(0)
        game.kitchen._collect()
        check(game.kitchen.note.text.begins_with("Let it cool"), "Collecting hot syrup is refused with the reason")
        var kit_cash: float = game.workshop.model.cash
        game._select_kit(4)
        check(game._equipment_click(Vector2i(266, 99), false) and game.world.equipment_at(266, 99) >= 0 and is_equal_approx(game.workshop.model.cash, kit_cash - 8.0), "The kit places a candy mold on the floor for its price")
        check(game._equipment_click(Vector2i(266, 99), true) and game.world.equipment_at(266, 99) == -1 and is_equal_approx(game.workshop.model.cash, kit_cash - 4.0), "Picking it up again refunds half")
        game.kitchen.open(game_pan)
        var carried_mass: float = game.world.equipment_info(game_pan).mass
        game.kitchen._move()
        check(game.kitchen.carrying == game_pan and not game.kitchen.visible, "Move picks the pan up to carry")
        game._equipment_click(Vector2i(266, 99), false)
        check(game.kitchen.carrying == -1 and game.world.equipment_at(266, 99) >= 0 and is_equal_approx(game.world.equipment_info(game.world.equipment_at(266, 99)).mass, carried_mass), "The carried pan is put down on the floor with its syrup")
        game.free()
    print("Ecologist integration: %d checks, %d failures" % [checks, failures])
    quit(1 if failures else 0)
