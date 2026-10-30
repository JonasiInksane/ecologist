extends SceneTree

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    var bytes := FileAccess.get_file_as_bytes("res://../.test-artifacts/liquid-visual-cells.bin")
    var image := Image.create_from_data(512, 256, false, Image.FORMAT_RGBA8, bytes)
    var texture := ImageTexture.create_from_image(image)
    var surface := Sprite2D.new()
    surface.centered = false
    surface.texture = texture
    surface.scale = Vector2(8, 4)
    var material := ShaderMaterial.new()
    material.shader = load("res://liquid.gdshader")
    material.set_shader_parameter("world_data", texture)
    material.set_shader_parameter("reference_mode", true)
    material.set_shader_parameter("reference_color", Vector3(30.0/255,46.0/255,64.0/255))
    surface.material = material
    root.add_child(surface)
    var times := [0.0, 3.25]
    for index in times.size():
        material.set_shader_parameter("animation_time", times[index])
        await process_frame
        await process_frame
        await RenderingServer.frame_post_draw
        var captured := root.get_texture().get_image()
        captured.convert(Image.FORMAT_RGBA8)
        var prefix := "res://../.test-artifacts/liquid-godot-%d" % index
        if captured.save_png(ProjectSettings.globalize_path(prefix + ".png")) != OK:
            quit(1)
            return
        var output := FileAccess.open(prefix + ".bin", FileAccess.WRITE)
        output.store_buffer(captured.get_data())
        output.close()
    print("Captured matched liquid fixture at two animation times")
    quit(0)
