extends SceneTree
# Renders the base (docs/design/rooms.md): the start room alone (base-start.png), then a small base built out
# left, right, up and down (base-built.png) with glass tanks, a wide tank and a vat holding water and sea water,
# pumped through the generated pipes (close up in base-lab.png), and room mode with its slots (base-rooms.png).

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
    game.hud.toast_panel.hide() # the last "built" or "placed" toast would cover the rooms
    game.queue_redraw()
    for i in 3:
        await process_frame
    await RenderingServer.frame_post_draw
    var path := ProjectSettings.globalize_path("res://../.test-artifacts/%s.png" % name)
    var result := root.get_texture().get_image().save_png(path)
    print("Capture: ", path, " result=", result)
    return result

# Fills the vessels and runs pumps between them: in the lab, water from the first glass tank into the second (sea
# water) along the floor, with a valve; above, sea water from the wide tank up and over a bend into the vat.
# Returns 1 if a piece is missing.
func _plumb(game) -> int:
    var found := {}
    for info in game.world.equipment_list():
        found[info.kind] = found.get(info.kind, []) + [info]
    if found.get("glass_tank", []).size() != 2 or not found.has("wide_tank") or not found.has("vat"):
        print("Plumbing: missing vessels ", found.keys())
        return 1
    var a: Dictionary = found.glass_tank[0]
    var b: Dictionary = found.glass_tank[1]
    var wide: Dictionary = found.wide_tank[0]
    var vat: Dictionary = found.vat[0]
    var w = game.world
    w.vessel_add(int(a.id), "water", 150000, 20)
    w.vessel_add(int(b.id), "sea_water", 60000, 20)
    w.vessel_add(int(wide.id), "sea_water", 300000, 20)
    w.vessel_add(int(vat.id), "water", 20000, 20)
    var row: int = int(a.y) + int(a.height) - 1
    var x0: int = int(a.x) + 4
    w.build(x0, row, 1008)
    w.build(x0 + 1, row, 1008)
    for x in range(x0 + 2, int(b.x)):
        w.build(x, row, 1007 if x == x0 + 3 else 1006)
    # above: a pump at the wide tank's low left port, then up three cells, across and down into the vat's right port
    row = int(wide.y) + int(wide.height) - 1
    x0 = int(wide.x) - 1
    w.build(x0, row, 1008)
    w.build(x0 - 1, row, 1008)
    var into: int = int(vat.x) + int(vat.width)
    for y in range(row - 3, row + 1):
        w.build(x0 - 2, y, 1006)
        w.build(into, y, 1006)
    for x in range(into + 1, x0 - 2):
        w.build(x, row - 3, 1006)
    return 0

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
    # furnish: a desk and a chair in the workshop, two glass tanks in the lab (clear of the hatches) and a wide tank
    # and a vat in the lab above, racks in the grow rooms, a generator, barrels and a still below, lamps everywhere
    var g := RoomsModel.GROUND * 8.0
    var layout := [["desk", 0, 0, 0.3], ["chair", 0, 0, 0.55], ["shelf", 0, 0, 0.8], ["lamp", 0, 0, 0.5],
        ["glass_tank", 1, 0, 8 / 22.0], ["glass_tank", 1, 0, 16 / 22.0], ["lamp", 1, 0, 0.5], ["gauge", 1, 0, 0.92],
        ["grow_rack", -1, 0, 0.3], ["grow_rack", -1, 0, 0.7], ["hydro_tray", 0, 1, 0.5], ["pot_full", 0, 1, 0.8], ["grow_rack", 0, 1, 0.25],
        ["vat", 1, 1, 8.5 / 22.0], ["wide_tank", 1, 1, 0.95], ["lamp", 1, 1, 0.5],
        ["generator", 0, -1, 0.35], ["barrel", 0, -1, 0.75], ["barrel_stack", 0, -1, 0.88], ["workbench", 1, -1, 0.45], ["still", 1, -1, 0.85], ["crate", 0, -2, 0.4], ["crate_stack", 0, -2, 0.55], ["lamp", 0, -1, 0.5]]
    for spec in layout:
        game.furnish_index = 0
        for i in game.furniture.pieces.size():
            if game.furniture.pieces[i].id == spec[0]:
                game.furnish_index = i
        var inside := RoomsModel.interior(spec[1], spec[2])
        var why: String = game._furnish(Vector2((inside.position.x + inside.size.x * spec[3]) * 8.0, (inside.position.y + 5) * 8.0))
        if not why.is_empty():
            print("Furnish %s: %s" % [spec[0], why])
    shot = shot | _plumb(game)
    game.world.advance(240)
    shot = shot | await _shot(game, "base-built", Vector2(256, RoomsModel.GROUND - 2) * 8, 1.6)
    var lab := RoomsModel.slot_rect(1, 0)
    shot = shot | await _shot(game, "base-lab", Vector2(lab.position.x + 13, lab.position.y + 1) * 8, 3.0)
    game.room_mode = true
    game.room_type = 0
    shot = shot | await _shot(game, "base-rooms", Vector2(256, RoomsModel.GROUND - 2) * 8, 1.6)
    game.shop.model.minute = 22.5 * 60.0
    game.room_mode = false
    shot = shot | await _shot(game, "base-night", Vector2(256, RoomsModel.GROUND - 2) * 8, 1.6)
    quit(shot)
