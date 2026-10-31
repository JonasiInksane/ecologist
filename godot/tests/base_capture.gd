extends SceneTree
# Renders the base (docs/design/rooms.md): the start room alone (base-start.png), then a small base built out
# left, right, up and down (base-built.png), and room mode with its slots (base-rooms.png).

func _initialize() -> void:
    call_deferred("run")

func _shot(game, name: String, center: Vector2, zoom: float) -> int:
    game.camera.zoom = Vector2.ONE * zoom
    game.camera.position = center
    game._clamp_camera()
    game._follow_sun()
    game._refresh_texture()
    for i in 2:
        await process_frame
    game.set_process(false)
    game.camera.position = center
    game.camera.force_update_scroll()
    game.status_clock = 0.25
    game.queue_redraw()
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
    game.shop.model.minute = 10.5 * 60.0
    var start := Vector2(256, RoomsModel.GROUND - 6) * 8
    var shot: int = await _shot(game, "base-start", start, 3.0)
    game.workshop.model.cash = 5000.0
    for spec in [[1, 0, 1], [-1, 0, 2], [0, 1, 2], [1, 1, 1], [0, -1, 3], [1, -1, 1], [0, -2, 3]]:
        game.room_type = spec[2]
        game._build_room(Vector2i(spec[0], spec[1]))
    game.world.advance(30)
    # furnish: a desk and a chair in the workshop, tanks, a vat and a still in the lab, racks in the grow rooms,
    # a generator and barrels in the cellars, lamps everywhere
    var g := RoomsModel.GROUND * 8.0
    var layout := [["desk", 0, 0, 0.3], ["chair", 0, 0, 0.55], ["shelf", 0, 0, 0.8], ["lamp", 0, 0, 0.5],
        ["tank", 1, 0, 0.25], ["vat", 1, 0, 0.55], ["still", 1, 0, 0.8], ["lamp", 1, 0, 0.5],
        ["grow_rack", -1, 0, 0.3], ["grow_rack", -1, 0, 0.7], ["hydro_tray", 0, 1, 0.5], ["pot_full", 0, 1, 0.8], ["grow_rack", 0, 1, 0.25],
        ["lab_bench", 1, 1, 0.4], ["pump_unit", 1, 1, 0.8], ["lamp", 1, 1, 0.5],
        ["generator", 0, -1, 0.35], ["barrel", 0, -1, 0.75], ["barrel", 0, -1, 0.83], ["workbench", 1, -1, 0.5], ["crate", 0, -2, 0.4], ["crate", 0, -2, 0.5], ["lamp", 0, -1, 0.5]]
    for spec in layout:
        game.furnish_index = 0
        for i in game.furniture.pieces.size():
            if game.furniture.pieces[i].id == spec[0]:
                game.furnish_index = i
        var inside := RoomsModel.interior(spec[1], spec[2])
        game._furnish(Vector2((inside.position.x + inside.size.x * spec[3]) * 8.0, (inside.position.y + 5) * 8.0))
    shot = shot | await _shot(game, "base-built", Vector2(256, RoomsModel.GROUND - 2) * 8, 1.6)
    game.room_mode = true
    game.room_type = 0
    shot = shot | await _shot(game, "base-rooms", Vector2(256, RoomsModel.GROUND - 2) * 8, 1.6)
    game.shop.model.minute = 22.5 * 60.0
    game.room_mode = false
    shot = shot | await _shot(game, "base-night", Vector2(256, RoomsModel.GROUND - 2) * 8, 1.6)
    quit(shot)
