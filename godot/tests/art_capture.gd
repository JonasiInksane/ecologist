extends SceneTree
# Renders the campaign look for the art pass (docs/design/art.md): the plot by day (art-day.png), the shack up close
# (art-shack.png), dusk with the lamps coming on (art-dusk.png), night (art-night.png) and the dug ground with a
# puddle (art-ground.png).

func _initialize() -> void:
    call_deferred("run")

func _shot(game, name: String, center: Vector2, zoom: float) -> int:
    game.set_process(false)
    game.camera.zoom = Vector2.ONE * zoom
    game.camera.position = center * 8.0
    game._clamp_camera()
    game._follow_sun()
    game._refresh_texture()
    for i in 2:
        await process_frame
    game.status_clock = 0.25
    game._process(0.0)
    game.queue_redraw()
    for i in 3:
        await process_frame
    await RenderingServer.frame_post_draw
    var path := ProjectSettings.globalize_path("res://../.test-artifacts/%s.png" % name)
    var result := root.get_texture().get_image().save_png(path)
    print("Capture: ", path, " result=", result)
    return result

func _at(game, hour: float) -> void:
    game.shop.model.minute = hour * 60.0

func run() -> void:
    var game = load("res://main.tscn").instantiate()
    game.legacy_plot = true
    root.add_child(game)
    await physics_frame
    game.set_physics_process(false)
    var town: PeopleModel = game.people.model
    town.data.visit_chance = 0.0
    town.first_done = true
    town.walkers.append({"id": 90, "name": "Mrs. Okafor and Biscuit", "look": 9, "kind": "dog", "dog": 0, "x": 300.0,
        "dir": -1, "turn": 386.0, "pause": 0.0, "line": ""})
    _at(game, 10.5)
    var shot: int = await _shot(game, "art-day", Vector2(268, 90), 2.0)
    shot = shot | await _shot(game, "art-shack", Vector2(256, 93), 3.2)
    _at(game, 19.9)
    shot = shot | await _shot(game, "art-dusk", Vector2(268, 90), 2.0)
    _at(game, 23.0)
    shot = shot | await _shot(game, "art-night", Vector2(268, 90), 2.0)
    # A hole dug in the yard with water in it, to see the soil, roots, stones and the rock below.
    _at(game, 13.0)
    for x in range(300, 312):
        for y in range(100, 107):
            game.world.build(x, y, game.REMOVE_CODE)
    game.world.paint(305, 104, 2, 1)
    for i in 120:
        game.world.advance(1)
    shot = shot | await _shot(game, "art-ground", Vector2(305, 100), 3.0)
    quit(shot)
