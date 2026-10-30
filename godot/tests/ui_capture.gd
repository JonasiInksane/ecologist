extends SceneTree
# Renders the campaign interface for the report: the HUD and hotbar in the yard with a toast and a tooltip
# (ui-hud.png), the kitchen kit with the kettle's window open (ui-kitchen.png), the laptop shop (ui-shop.png), the
# plot at night (ui-night.png) and the pause menu (ui-menu.png).

func _initialize() -> void:
    call_deferred("run")

# hover: a cell to put the pointer over, for the tooltip.
func _shot(game, name: String, center: Vector2, zoom: float, hover := Vector2i(-1, -1)) -> int:
    game.set_process(false)
    game.camera.zoom = Vector2.ONE * zoom
    game.camera.position = center * 8.0
    game._clamp_camera()
    game._refresh_texture()
    if hover.x >= 0:
        var at: Vector2 = (Vector2(hover) * 8.0 + Vector2(4, 4) - game.camera.get_screen_center_position()) * zoom + Vector2(root.size) / 2.0
        root.warp_mouse(at)
    for i in 2:
        await process_frame
    game.status_clock = 0.25
    game._process(0.0)
    for i in 3:
        await process_frame
    await RenderingServer.frame_post_draw
    var path := ProjectSettings.globalize_path("res://../.test-artifacts/%s.png" % name)
    var result := root.get_texture().get_image().save_png(path)
    print("Capture: ", path, " result=", result)
    return result

func run() -> void:
    var game = load("res://main.tscn").instantiate()
    root.add_child(game)
    await physics_frame
    game.set_physics_process(false)
    var plot: EcologistWorld = game.campaign_world
    game.workshop.model.cash = 1240.0
    # The yard: a tote and a coupling by the road, a pipe run, and a van at the curb with an order on the way.
    plot.equipment_place("tote", 352, 99)
    plot.equipment_place("coupling", 372, 99)
    for y in range(90, 98):
        plot.build(372, y, 1006)
    for x in range(354, 372):
        plot.build(x, 90, 1006 if x != 363 else 1007)
    game.shop.model.order("hollis", 0, 2)
    game.shop.model.order("calcium", 0, 1)
    game.shop.model.step(124 * 60)
    for i in game.build_items.size():
        if int(game.build_items[i].code) == game.DOOR_CODE:
            game._select_build(i)
    game._notice("Hollis van at the curb. Walk over and click it to unload.")
    var shot: int = await _shot(game, "ui-hud", Vector2(310, 92), 1.4, Vector2i(363, 90))
    print("Tip: ", game.hud.tip_label.text)
    # The kitchen kit with a kettle of beets steeping and its window open.
    for tool in ["thermometer", "refractometer", "ph_meter", "shredder"]:
        game.workshop.model.purchase_equipment(tool)
    var kettle: int = plot.equipment_place("kettle", 274, 99).id
    plot.vessel_add(kettle, "cossettes", 10000, 20)
    plot.vessel_add(kettle, "water", 12000, 75)
    plot.equipment_set(kettle, 2)
    for i in 30:
        plot.equipment_set(kettle, 1 if plot.equipment_info(kettle).temperature > 72.0 else 2)
        plot.advance(60)
    game.shop.model.crates["centrifuge"] = 1
    game._refresh_kit()
    game._set_kit_mode(true)
    game._select_kit(10)
    game.kitchen.open(kettle)
    game.kitchen.refresh()
    shot = shot | await _shot(game, "ui-kitchen", Vector2(272, 93), 3.0, Vector2i(282, 97))
    game.kitchen.close()
    # The laptop shop with Pipe Dreams open and the kettle picked.
    game.shop.open()
    game.shop.select_supplier(4)
    game.shop.select_item(3)
    game.shop.refresh()
    shot = shot | await _shot(game, "ui-shop", Vector2(266, 93), 3.0)
    game.shop.close()
    # The same plot at night, with the shack lamp-lit and stars over the hills.
    game._set_kit_mode(false)
    game.shop.model.minute = 22.5 * 60.0
    game._follow_sun()
    shot = shot | await _shot(game, "ui-night", Vector2(282, 90), 2.0, Vector2i(266, 97))
    # The pause menu.
    game.hud.toggle_menu()
    shot = shot | await _shot(game, "ui-menu", Vector2(266, 93), 2.0)
    game.hud.toggle_menu()
    quit(shot)
