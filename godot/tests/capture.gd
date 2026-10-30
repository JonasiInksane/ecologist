extends SceneTree

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    var game = load("res://main.tscn").instantiate()
    root.add_child(game)
    # Exercise the real fixed-timestep loop and GPU rendering before capturing.
    var ticks := 360 if "--long" in OS.get_cmdline_user_args() else 90
    for frame in ticks:
        await physics_frame
    print("Rendered scene: ", Engine.get_frames_per_second(), " fps after ", game.world.stats().tick, " ticks")
    print("Frame CPU: ", Performance.get_monitor(Performance.TIME_PROCESS) * 1000, " ms; physics: ", Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000, " ms")
    game._toggle_pause()
    game._refresh_texture()
    game.status_clock = 0.25
    await process_frame
    await RenderingServer.frame_post_draw
    if game.world.stats().tick < 89:
        push_error("The playable scene did not advance its fixed-timestep simulation")
        quit(1)
        return
    var path := ProjectSettings.globalize_path("res://../.test-artifacts/ecologist-native.png")
    var result := root.get_texture().get_image().save_png(path)
    print("Capture: ", path, " result=", result)
    quit(result)
