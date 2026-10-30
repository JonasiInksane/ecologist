extends SceneTree
# Renders M2 for the report: a tanker at the curb pumping sea water through the fill coupling and a pipe run into a
# tote (m2-yard.png), the laptop shop (m2-shop.png), and a beet batch in the kettle with the kitchen panel open
# (m2-kettle.png).

func _initialize() -> void:
    call_deferred("run")

func _shot(game, name: String, center: Vector2, zoom: float) -> int:
    game.set_process(false)
    game.camera.zoom = Vector2.ONE * zoom
    game.camera.position = center * 8.0
    game._refresh_texture()
    # A zero-length frame updates the HUD without moving the camera back to the player.
    game.status_clock = 0.25
    game._process(0.0)
    game.camera.position = center * 8.0
    game._clamp_camera()
    await process_frame
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
    game.workshop.model.cash = 2000.0
    # The yard: a tote and a fill coupling by the road, a pipe run with a valve, and the tanker pumping.
    var tote: int = plot.equipment_place("tote", 352, 99).id
    var coupling: int = plot.equipment_place("coupling", 372, 99).id
    for y in range(90, 98):
        plot.build(372, y, 1006)
    for x in range(354, 372):
        plot.build(x, 90, 1006 if x != 363 else 1007)
    for y in range(91, 94):
        plot.build(354, y, 1006)
    game.shop.model.order("brackwater", 1, 5)
    game.shop.model.step(244 * 60)
    for i in 420:
        game.shop.step()
        plot.advance(1)
    var shot: int = await _shot(game, "m2-yard", Vector2(378, 91), 2.2)
    print("Tote ", plot.equipment_info(tote).mass, " g, coupling ", plot.equipment_info(coupling).setting, " · ", game.shop.model.status())
    # The laptop shop, with a kettle and lime on the way.
    game.shop.model.order("pipedreams", 3, 1)
    game.shop.model.order("calcium", 0, 2)
    game.shop.open()
    game.shop.select_supplier(4)
    game.shop.select_item(3)
    game.shop.refresh()
    shot = shot | await _shot(game, "m2-shop", Vector2(266, 93), 3.0)
    game.shop.close()
    # The kettle: shredded beets steeping in hot water, with the pH meter and refractometer bought.
    for tool in ["thermometer", "refractometer", "ph_meter", "shredder"]:
        game.workshop.model.purchase_equipment(tool)
    var kettle: int = plot.equipment_place("kettle", 274, 99).id
    plot.vessel_add(kettle, "cossettes", 10000, 20)
    plot.vessel_add(kettle, "water", 12000, 75)
    plot.equipment_set(kettle, 2)
    for i in 30:
        plot.equipment_set(kettle, 1 if plot.equipment_info(kettle).temperature > 72.0 else 2)
        plot.advance(60)
    plot.equipment_place("centrifuge", 282, 99)
    game.kitchen.open(kettle)
    game.kitchen.refresh()
    shot = shot | await _shot(game, "m2-kettle", Vector2(279, 94), 3.0)
    print("Kettle ", plot.equipment_info(kettle).temperature, " °C, brix ", plot.equipment_info(kettle).brix)
    quit(shot)
