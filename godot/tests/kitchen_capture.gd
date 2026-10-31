extends SceneTree
# Renders the shack kitchen mid-cook for the M1 report: candy boiling on the stove, sea water in a salt pan, and
# the kitchen panel open with a thermometer and refractometer bought.

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    var game = load("res://main.tscn").instantiate()
    game.legacy_plot = true
    root.add_child(game)
    await physics_frame
    var ids := {}
    for info in game.world.equipment_list():
        ids[info.kind] = info.id
    game.workshop.model.purchase_equipment("thermometer")
    game.workshop.model.purchase_equipment("refractometer")
    game.world.vessel_add(ids.saucepan, "sugar", 600, 20)
    game.world.vessel_add(ids.saucepan, "water", 200, 15)
    game.world.equipment_set(ids.stove, 2)
    for i in 40:
        if game.world.equipment_info(ids.saucepan).sugar_crystals < 0.01:
            game.world.equipment_set(ids.stove, 3)
        game.world.advance(60)
    game.world.equipment_place("salt_pan", 266, 99)
    game.world.vessel_add(game.world.equipment_at(266, 99), "sea_water", 1500, 20)
    game._set_kit_mode(true)
    game._select_kit(1)
    game.kitchen.open(ids.saucepan)
    for frame in 30:
        await physics_frame
    game._toggle_pause()
    game.camera.zoom = Vector2.ONE * 3.0
    game.camera.position = Vector2(264 * 8, 93 * 8)
    game.set_process(false)
    game._refresh_texture()
    game.kitchen.refresh()
    game.status_clock = 0.25
    await process_frame
    await RenderingServer.frame_post_draw
    var path := ProjectSettings.globalize_path("res://../.test-artifacts/m1-kitchen.png")
    var result := root.get_texture().get_image().save_png(path)
    print("Capture: ", path, " result=", result, " pan ", game.world.equipment_info(ids.saucepan).temperature)
    quit(result)
