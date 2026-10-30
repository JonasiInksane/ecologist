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
    check(kinds.size() == 12 and kinds[3].id == "saucepan" and kinds[0].support and not kinds[3].support and kinds[8].closed and kinds[8].ports == 4, "Twelve kinds of equipment, with closed tanks and ports")
    var ids := {}
    for info in shack.equipment_list():
        ids[info.kind] = info.id
    var pan: int = ids.get("saucepan", -1)
    var stove: int = ids.get("stove", -1)
    var mold: int = ids.get("candy_mold", -1)
    var sink: int = ids.get("sink", -1)
    check(ids.size() == 6 and ids.has("laptop") and shack.equipment_info(pan).resting_on == stove and shack.inspect(259, 95).solid == 81, "The shack starts with a stove, a pan on it, a sink, a table, a mold and the laptop")
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
        check(game.kit_items.size() == 12 and game.kitchen != null and not game.kitchen.visible, "The kitchen kit loads")
        game._set_kit_mode(true)
        check(game.kit_buttons[0].visible and not game.build_buttons[0].visible, "K swaps the build bar to the kitchen kit")
        check(game.kit_buttons[0].theme_type_variation == "SlotSelected" and game.hud.counts.kit[0].text == str(int(game.kit_items[0].cost)), "The hotbar frames the selected slot and shows its price")
        game.status_clock = 0.25
        game._process(0.0)
        check(game.hud.visible and not game.top_panel.visible and not game.footer.visible and game.hud.cash.text == "%.2f" % game.workshop.model.cash, "The campaign shows the HUD, not the sandbox bars")
        var was_paused: bool = game.paused
        game.hud.toggle_menu()
        check(game.hud.menu.visible and game.paused, "Esc opens the menu and pauses")
        game.hud.toggle_menu()
        check(not game.hud.menu.visible and game.paused == was_paused, "Closing the menu resumes")
        # Day and night follow the game clock; rooms stay lit by a lamp after dark.
        check(game.lighting.daylight(480.0) == 1.0 and game.lighting.daylight(0.0) == 0.0 and absf(game.lighting.daylight(360.0) - 0.5) < 0.01 and absf(game.lighting.daylight(1200.0) - 0.5) < 0.01, "Daylight: full from 07:00, dark from 21:00, half at 06:00 and 20:00")
        var morning: float = game.shop.model.minute
        game._follow_sun()
        check(not game.lighting.visible and game.liquid_material.get_shader_parameter("stars") == 0.0, "No night overlay or stars by day")
        game.shop.model.minute = 23.0 * 60.0
        game._refresh_texture()
        game._follow_sun()
        var rooms := 0
        for runs in game.lighting.rooms:
            rooms += runs.size() / 2
        check(game.lighting.visible and game.lighting.level == 0.0 and rooms > 0 and game.liquid_material.get_shader_parameter("stars") == 1.0 and game.world.stats().has("tick"), "At 23:00 the plot is dark, with stars, and the shack's rooms are lamp-lit")
        check(game.lighting.indoor(0.0).v > game.lighting.ambient(0.0).v * 1.5, "A room at night is much brighter than outdoors")
        game.shop.model.minute = morning
        game._follow_sun()
        check(not game.lighting.visible, "Morning again")
        game.workshop.hide()
        game._toggle_workshop()
        check(game.workshop.visible and game.workshop.tabs.is_tab_hidden(1) and not game.workshop.saves.visible, "The stock window shows only the stock in the campaign")
        game._toggle_workshop()
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
        var gas_before: float = game.world.budget("stove_joules")
        game.world.advance(600)
        game.kitchen.bill()
        var gas_bill: float = (game.world.budget("stove_joules") - gas_before) / 1000.0 * float(game.kitchen.data.gas_price_per_kj)
        check(gas_bill > 0.005 and is_equal_approx(game.workshop.model.cash, gas_cash - gas_bill), "Gas is billed as the stove burns")
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
        # M2 in the game: the laptop shop, a van with a crate, the kettle, pipes, a valve, a pump and a tanker.
        game.workshop.model.cash = 3000.0
        var laptop: int = game_ids.laptop
        var laptop_cell := Vector2i(int(game.world.equipment_info(laptop).x), int(game.world.equipment_info(laptop).y))
        game._set_kit_mode(false)
        check(game._equipment_click(laptop_cell, false) and game.shop.visible and not game.kitchen.visible, "Clicking the laptop opens the shop")
        game.shop.select_supplier(4)
        game.shop.select_item(3)
        game.shop.count.value = 1
        game.shop._order()
        check(is_equal_approx(game.workshop.model.cash, 2850.0) and game.shop.model.orders.size() == 1 and game.shop.model.orders[0].item == "kettle", "A kettle is ordered on the laptop")
        game.shop.model.step(241 * 60)
        check(not game.shop.model.truck.is_empty() and not game.shop.truck_rect().has_area(), "The van is still driving up")
        game.shop.model.step(3 * 60)
        check(game.shop.truck_at(Vector2i(390, 96)) and not game.shop.truck_at(Vector2i(370, 96)), "The van parks at the curb")
        game.shop.click_truck()
        check(not game.shop.model.truck.is_empty() and game.inspector_label.text.begins_with("Walk over") and game.hud.toast_label.text.begins_with("Walk over") and game.hud.toast_panel.visible, "The van is out of reach from the shack, said in a toast")
        game.shop.model.unload()
        game._refresh_kit()
        check(game.shop.model.crates.get("kettle", 0) == 1 and game.hud.counts.kit[10].text == "×1", "The kettle's crate waits in the kit")
        game._set_kit_mode(true)
        game._select_kit(10)
        var cash_now: float = game.workshop.model.cash
        check(game._equipment_click(Vector2i(276, 99), false) and game.world.equipment_at(276, 99) >= 0 and game.shop.model.crates.is_empty() and game.workshop.model.cash == cash_now, "The kettle is unpacked from its crate")
        var kettle: int = game.world.equipment_at(276, 99)
        game.kitchen.open(kettle)
        check(game.kitchen.flame_row.visible and game.kitchen.flame_buttons[1].text == "Simmer" and game.kitchen.place_text.text.contains("2 ports"), "The kettle has its own burner and two drains")
        game.kitchen._set_flame(3)
        check(int(game.world.equipment_info(kettle).setting) == 3, "Its flame turns up to high")
        game.kitchen._set_flame(0)
        check(game._equipment_click(Vector2i(276, 99), true) and game.shop.model.crates.get("kettle", 0) == 1 and game.workshop.model.cash == cash_now, "Picking the kettle up packs it back in its crate")
        game._equipment_click(Vector2i(276, 99), false)
        kettle = game.world.equipment_at(276, 99)
        game.kitchen.open(kettle)
        game.workshop.model.store("sugar_beet", 20000.0)
        game.kitchen._buy_tool("shredder")
        game.kitchen.ingredient.select(3)
        game.kitchen.grams.value = 10000
        game.kitchen._add()
        var kettle_info: Dictionary = game.world.equipment_info(kettle)
        check(float(kettle_info.beet_g) > 9999.0 and float(kettle_info.shredded) > 0.99 and game.kitchen.note.text.begins_with("Shredded"), "Beets go through the shredder into the kettle as cossettes")
        game.kitchen._buy_tool("ph_meter")
        game.kitchen.ingredient.select(2)
        game.kitchen.grams.value = 12000
        game.kitchen._add()
        game.kitchen.refresh()
        check(game.kitchen.readings.text.contains("pH 7") and game.kitchen.contents_text.text.contains("cossettes"), "The pH meter reads the beets in water")
        game._set_kit_mode(false)
        var build_index := {}
        for i in game.build_items.size():
            build_index[int(game.build_items[i].code)] = i
        game._select_build(build_index[1006])
        game.removing = false
        game.last_build = Vector2i(-1, -1)
        cash_now = game.workshop.model.cash
        game._campaign_build(Vector2i(282, 92))
        game._campaign_build(Vector2i(285, 92))
        check(game.world.inspect(283, 92).solid == 25 and game.world.inspect(285, 92).solid == 25 and is_equal_approx(game.workshop.model.cash, cash_now - 4.0), "Dragging lays pipe cell by cell without gaps")
        game.removing = true
        game.last_build = Vector2i(-1, -1)
        game._campaign_build(Vector2i(285, 92))
        check(game.world.inspect(285, 92).solid == 0 and game.world.inspect(284, 92).solid == 25 and is_equal_approx(game.workshop.model.cash, cash_now - 3.5), "Removing takes out one pipe cell for half its cost")
        game.removing = false
        game._select_build(build_index[1007])
        game.last_build = Vector2i(-1, -1)
        game._campaign_build(Vector2i(285, 92))
        check(game.world.inspect(285, 92).solid == 26 and is_equal_approx(game.workshop.model.cash, cash_now - 11.5), "A valve goes in at the end of the run")
        var valve_open: bool = game.world.inspect(285, 92).open
        check(game._toggle_fitting(Vector2i(285, 92)), "Clicking a valve works it")
        game.world.advance(1)
        check(game.world.inspect(285, 92).open != valve_open, "The valve opens or shuts")
        game._select_build(build_index[1008])
        game.last_build = Vector2i(-1, -1)
        game._campaign_build(Vector2i(282, 96))
        check(int(game.world.stats().pending_inlet) == 96 * 512 + 282 and is_equal_approx(game.workshop.model.cash, cash_now - 51.5), "The pump's inlet goes down and the pump is paid for")
        game.last_build = Vector2i(-1, -1)
        game._campaign_build(Vector2i(282, 93))
        check(int(game.world.stats().pending_inlet) == -1 and game.world.inspect(282, 93).solid == 9 and is_equal_approx(game.workshop.model.cash, cash_now - 51.5), "The outlet connects the pump at no extra cost")
        check(game._toggle_fitting(Vector2i(282, 96)) and game.world.stats().message == "Pump off", "Clicking a pump end switches it")
        var plot_world: EcologistWorld = game.campaign_world
        var tote_id: int = plot_world.equipment_place("tote", 360, 99).id
        var coupling_id: int = plot_world.equipment_place("coupling", 370, 99).id
        for y in range(90, 98):
            plot_world.build(370, y, 1006)
        for x in range(362, 370):
            plot_world.build(x, 90, 1006)
        for y in range(91, 94):
            plot_world.build(362, y, 1006)
        check(tote_id >= 0 and coupling_id >= 0 and plot_world.inspect(362, 93).solid == 25, "A tote and a fill coupling by the road, piped together")
        game.shop.model.order("brackwater", 1, 2)
        game.shop.model.step(244 * 60)
        var hooked := false
        for i in 1200:
            game.shop.step()
            hooked = hooked or (game.shop.hooked == coupling_id and int(plot_world.equipment_info(coupling_id).setting) == 1)
            plot_world.advance(1)
            if not game.shop.model.tanker_here():
                break
        check(hooked and not game.shop.model.tanker_here() and game.shop.model.message.contains("200 L"), "The tanker hooks up to the coupling and pumps 200 L")
        game.shop.step()
        for i in 120:
            plot_world.advance(1)
        check(float(plot_world.equipment_info(tote_id).mass) > 180000.0 and int(plot_world.equipment_info(coupling_id).setting) == 0 and game.shop.hooked == -1, "The sea water ends up in the tote and the coupling is unhooked")
        game.shop.save_path = "res://../.test-artifacts/logistics-save-test.json"
        game.shop.model.order("calcium", 0, 1)
        check(game.shop.save() == "", "Deliveries save")
        game.shop.model.order("calcium", 0, 2)
        check(game.shop.load_save() == "" and game.shop.model.orders.size() == 1 and int(game.shop.model.orders[0].count) == 1, "Deliveries load")
        game.free()
    print("Ecologist integration: %d checks, %d failures" % [checks, failures])
    quit(1 if failures else 0)
