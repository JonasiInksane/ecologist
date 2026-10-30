extends SceneTree

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    var game = load("res://main.tscn").instantiate()
    root.add_child(game)
    game.camera.position = Vector2(102, 78) * 8
    game.camera.zoom = Vector2.ONE * 1.5
    for i in 35:
        game.world.paint_grains(600, 260 + i * 4, 32, 1)
        game.world.paint_grains(840, 450 + i * 3, 24, 2)
    game.workshop.model.purchase_equipment("filter")
    game.workshop.model.start_job("filter_juice", true)
    game.workshop.model.add_to_vessel("vinegar", 100)
    game.workshop.model.add_to_vessel("bicarbonate", 20)
    game.workshop.model.react()
    for _frame in 240:
        await physics_frame
    print("Fine-grain rendered scene: ", Engine.get_frames_per_second(), " fps; grains=", game.world.stats().grains)
    game._toggle_pause()
    game._toggle_workshop()
    game._refresh_texture()
    var tabs := game.workshop.find_child("TabContainer", true, false) as TabContainer
    # Nodes created without an explicit name can have generated names; find by type.
    if tabs == null:
        for child in game.workshop.get_child(0).get_children():
            if child is TabContainer:
                tabs = child
    for index in 4:
        tabs.current_tab = index
        game.workshop.refresh()
        await process_frame
        await process_frame
        await RenderingServer.frame_post_draw
        var path := ProjectSettings.globalize_path("res://../.test-artifacts/workshop-%d.png" % index)
        if root.get_texture().get_image().save_png(path) != OK:
            quit(1)
            return
    print("Workshop captures: four tabs rendered successfully")
    game.free()
    quit(0)
