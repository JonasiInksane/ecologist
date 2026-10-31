extends SceneTree
# Renders M3's town for the report: passers-by and a dog on the street (m3-street.png), Theo knocking with the door
# window open (m3-door.png), and Mister Velkov at the door at night (m3-night.png).

func _initialize() -> void:
    call_deferred("run")

func _shot(game, name: String, center: Vector2, zoom: float, hover := Vector2(-1, -1)) -> int:
    game.set_process(false)
    game.camera.zoom = Vector2.ONE * zoom
    game.camera.position = center * 8.0
    game._clamp_camera()
    game._refresh_texture()
    if hover.x >= 0:
        root.warp_mouse((hover - game.camera.get_screen_center_position()) * zoom + Vector2(root.size) / 2.0)
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

func _walker(town: PeopleModel, name: String, look: int, kind: String, x: float, dir: int, dog := -1) -> void:
    town.walkers.append({"id": town.next_id, "name": name, "look": look, "kind": kind, "dog": dog, "x": x,
        "dir": dir, "turn": 386.0, "pause": 0.0, "line": "Something smells amazing around here."})
    town.next_id += 1

func run() -> void:
    var game = load("res://main.tscn").instantiate()
    game.legacy_plot = true
    root.add_child(game)
    await physics_frame
    game.set_physics_process(false)
    var town: PeopleModel = game.people.model
    town.data.visit_chance = 0.0
    town.first_done = true
    # The street in the morning: a jogger, a dog walker, the postman and a man on the phone.
    game.shop.model.minute = 9.0 * 60.0
    _walker(town, "Gus", 1, "jog", 398.0, -1)
    _walker(town, "Mrs. Okafor and Biscuit", 9, "dog", 420.0, 1, 0)
    _walker(town, "Wendell", 0, "walk", 445.0, -1)
    _walker(town, "A man on the phone", 3, "walk", 468.0, 1)
    var shot: int = await _shot(game, "m3-street", Vector2(425, 92), 2.0, Vector2(420 * 8.0, 780.0))
    # Theo at the door, with the window open.
    town.walkers.clear()
    town._enqueue("theo", false)
    for i in 60 * 60:
        game.shop.model.step(1)
        game.people.step()
        if town.knocking():
            break
    game.workshop.model.store("syrup_simple_b", 800.0)
    game.people.open()
    shot = shot | await _shot(game, "m3-door", Vector2(266, 93), 3.0)
    game.people.close()
    town.refuse()
    for i in 60 * 60:
        game.shop.model.step(1)
        game.people.step()
        if town.visitor.is_empty():
            break
    # Mister Velkov at night.
    game.shop.model.minute = 23.0 * 60.0
    game._follow_sun()
    town._enqueue("velkov", false)
    for i in 60 * 60:
        game.shop.model.step(1)
        game.people.step()
        if town.knocking():
            break
    game.people.open()
    shot = shot | await _shot(game, "m3-night", Vector2(266, 93), 3.0)
    quit(shot)
