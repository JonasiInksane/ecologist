extends SceneTree

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    var game = load("res://main.tscn").instantiate()
    root.add_child(game)
    game.set_physics_process(false)
    game.paused = true
    game.world.setup(512, 128, 7)
    game.camera.position = Vector2(100, 66) * 8
    game.camera.zoom = Vector2.ONE * 1.4
    var w = game.world
    for x in range(45, 155):
        w.paint(x, 95, 1, -2)
    for x in range(59, 85):
        w.paint(x, 93, 1, -23)
    for x in [59, 84]:
        for y in range(68, 93):
            w.paint(x, y, 1, -22)
    for x in range(60, 84):
        for y in range(78, 93):
            w.paint(x, y, 1, 1)
    for x in range(102, 131):
        w.paint(x, 93, 1, -51)
    for x in [101, 131]:
        for y in range(81, 93):
            w.paint(x, y, 1, -22)
    for x in range(84, 103):
        w.paint(x, 86, 1, -25)
    w.paint(92, 86, 1, 0)
    w.device_action(92, 86, -26, 1)
    w.device_action(83, 77, 301, 1)
    w.device_action(114, 72, 301, 1)
    w.device_action(96, 69, -11, 1)
    w.wire_action(96, 69)
    w.wire_action(92, 86)
    w.wire_action(96, 69)
    w.device_action(96, 69, -11, 1)
    for i in range(19):
        var blocks := [1, 2, 3, 6, 7, 10, 18, 19, 22, 23, 24, 40, 45, 46, 50, 51, 62, 70, 77]
        w.paint(52 + i * 5, 49, 2, -blocks[i])
    for i in range(10):
        var types := [1, 3, 5, 9, 11, 23, 26, 35, 36, 37]
        var x := 51 + i * 10
        for xx in range(x, x + 7):
            w.paint(xx, 64, 1, -22)
        for yy in range(56, 64):
            w.paint(x, yy, 1, -22)
            w.paint(x + 6, yy, 1, -22)
        for xx in range(x + 1, x + 6):
            for yy in range(59, 64):
                w.paint(xx, yy, 1, types[i])
    w.dye(70, 85, 6, 3)
    for i in range(1, 8):
        w.paint_grains((57 + i * 8) * 8, 91 * 8, 10, i)
    var started := Time.get_ticks_usec()
    for i in range(30):
        w.advance(1)
    print("Mixed sandbox physics: %.2f ms/tick" % ((Time.get_ticks_usec() - started) / 30000.0))
    game._refresh_texture()
    game.category_picker.select(4)
    game._filter_tools()
    for i in game.TOOLS.size():
        if game.TOOLS[i][1] == 302:
            game._select(i)
    game.info_label.text = "Sandbox port · glass vessels, material samples, pump and wired valve"
    game.inspector_label.text = "Machine controls: select a tool and click to place; select a liquid first to configure filters or sources."
    await process_frame
    await RenderingServer.frame_post_draw
    root.get_texture().get_image().save_png("res://../.test-artifacts/sandbox-port.png")
    print("Sandbox preview captured: %d tools, %d world machines" % [game.TOOLS.size(), w.stats().machines])
    game.free()
    quit()
