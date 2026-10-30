extends Node2D

const CELL := 8.0
const WIDTH := 512
const HEIGHT := 128
const SEED := 7
var TOOLS: Array = [
    ["Water", 1, Color("5daee7")], ["Oil", 9, Color("b6a16b")],
    ["Honey", 3, Color("edb151")], ["Steam", 8, Color("c3d5da")],
    ["Mercury", 5, Color("a9bbc5")], ["Stone", -2, Color("8b9b9d")],
    ["Dirt", -1, Color("bc9673")], ["Erase", 0, Color("d78c83")],
    ["Sand · fine grains", 101, Color("d7b979")], ["Sugar · sucrose", 102, Color("fff0c9")],
    ["Salt · sodium chloride", 103, Color("d6edf1")], ["Ethanol", 35, Color("b2d3dc")],
    ["Blood", 36, Color("c64d5c")], ["Blood plasma", 37, Color("e4bf57")],
    ["Vinegar", 38, Color("d1cc9e")], ["Brine", 39, Color("70b6cd")],
    ["Heat", 201, Color("ee936b")], ["Cool", 202, Color("8ecbea")]
]

var world := EcologistWorld.new()
var camera := Camera2D.new()
var surface := Sprite2D.new()
var texture: ImageTexture
var grain_texture: ImageTexture
var solution_texture: ImageTexture
var liquid_material := ShaderMaterial.new()
var animation_time := 0.0
var paused := false
var dirty := true
var drawing := false
var panning := false
var radius := 3
var selected := 0
var status_clock := 0.0
var pause_button: Button
var radius_label: Label
var info_label: Label
var status_label: Label
var tool_buttons: Array[Button] = []
var material_picker := OptionButton.new()
var workshop: PanelContainer
var inspector_label: Label
var category_picker := OptionButton.new()
var tool_search := LineEdit.new()
var tool_categories: Dictionary = {}
var machine_codes: Dictionary = {}
var machine_view: Array = []
var last_liquid := 1
var day := true
var breezy := true
var pending_wire := -1

func _ready() -> void:
    world.reset_demo(SEED)
    _load_catalog()
    surface.centered = false
    surface.show_behind_parent = true
    # The texture holds two metadata planes; the shader expands each world cell to 8x8 pixels.
    surface.scale = Vector2(CELL, CELL / 2)
    surface.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    liquid_material.shader = preload("res://liquid.gdshader")
    surface.material = liquid_material
    add_child(surface)
    camera.position = Vector2(104, 74) * CELL
    add_child(camera)
    _build_ui()
    _select(9)
    _refresh_texture()

func _load_catalog() -> void:
    for tool in TOOLS:
        var code: int = tool[1]
        tool_categories[code] = "Powders" if code >= 101 and code <= 103 else "Tools" if code == 0 or code >= 201 else "Terrain" if code < 0 else "Liquids"
    var catalog: Array = JSON.parse_string(FileAccess.get_file_as_string("res://generated/sandbox_catalog.json"))
    var powders := {-21:101, -67:102, -20:103, -38:104, -44:105, -74:106, -71:107}
    for item in catalog:
        var code: int = powders.get(int(item.code), int(item.code))
        tool_categories[code] = item.category
        if item.category == "Machines" and code != -25:
            machine_codes[code] = true
        var exists := false
        for tool in TOOLS:
            if tool[1] == code:
                exists = true
        if not exists:
            TOOLS.append([item.name, code, Color(item.color)])

func _filter_tools() -> void:
    material_picker.clear()
    var category := category_picker.get_item_text(category_picker.selected)
    var query := tool_search.text.to_lower()
    for i in TOOLS.size():
        if category != "All" and tool_categories.get(TOOLS[i][1], "Tools") != category:
            continue
        if not query.is_empty() and not str(TOOLS[i][0]).to_lower().contains(query):
            continue
        material_picker.add_item(TOOLS[i][0], i)
    var found := material_picker.get_item_index(selected)
    if found >= 0:
        material_picker.select(found)
    else:
        material_picker.select(-1)

func _style(color: Color, border := Color.TRANSPARENT) -> StyleBoxFlat:
    var box := StyleBoxFlat.new()
    box.bg_color = color
    box.border_color = border
    box.set_border_width_all(1)
    box.set_corner_radius_all(6)
    box.content_margin_left = 12
    box.content_margin_right = 12
    box.content_margin_top = 8
    box.content_margin_bottom = 8
    return box

func _label(text: String, size := 14, color := Color("afc3c9")) -> Label:
    var label := Label.new()
    label.text = text
    label.add_theme_font_size_override("font_size", size)
    label.add_theme_color_override("font_color", color)
    return label

func _button(text: String, action: Callable) -> Button:
    var button := Button.new()
    button.text = text
    button.focus_mode = Control.FOCUS_NONE
    button.add_theme_stylebox_override("normal", _style(Color("1d3036")))
    button.add_theme_stylebox_override("hover", _style(Color("2c444b")))
    button.add_theme_stylebox_override("pressed", _style(Color("36545c")))
    button.add_theme_font_size_override("font_size", 14)
    button.pressed.connect(action)
    return button

func _build_ui() -> void:
    var layer := CanvasLayer.new()
    add_child(layer)
    var panel := PanelContainer.new()
    panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
    panel.offset_bottom = 124
    panel.add_theme_stylebox_override("panel", _style(Color("101e24")))
    layer.add_child(panel)
    var column := VBoxContainer.new()
    column.add_theme_constant_override("separation", 12)
    panel.add_child(column)
    var heading := HBoxContainer.new()
    heading.add_theme_constant_override("separation", 16)
    column.add_child(heading)
    heading.add_child(_label("ecologist", 28, Color("e1f2e5")))
    var subtitle := _label("MATERIALS & MACHINES", 12, Color("8cb8aa"))
    subtitle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    heading.add_child(subtitle)
    heading.add_child(_button("Day / night", _toggle_day))
    heading.add_child(_button("Wind on / off", _toggle_wind))
    heading.add_child(_button("Workshop", _toggle_workshop))
    pause_button = _button("Pause  ·  Space", _toggle_pause)
    heading.add_child(pause_button)
    heading.add_child(_button("Step  ·  N", _single_step))
    heading.add_child(_button("Reset sandbox  ·  R", _reset))
    var palette := HBoxContainer.new()
    palette.add_theme_constant_override("separation", 6)
    column.add_child(palette)
    material_picker.custom_minimum_size.x = 220
    for category in ["All", "Liquids", "Terrain", "Powders", "Machines", "Tools"]:
        category_picker.add_item(category)
    category_picker.item_selected.connect(func(_index): _filter_tools())
    palette.add_child(category_picker)
    tool_search.placeholder_text = "Find material…"
    tool_search.custom_minimum_size.x = 130
    tool_search.text_changed.connect(func(_text): _filter_tools())
    palette.add_child(tool_search)
    material_picker.item_selected.connect(func(index): _select(material_picker.get_item_id(index)))
    palette.add_child(material_picker)
    for i in [0, 8, 9, 10, 16, 17]:
        var button := _button(["Water", "Sand", "Sugar", "Salt", "Heat", "Cool"][[0, 8, 9, 10, 16, 17].find(i)], _select.bind(i))
        button.add_theme_color_override("font_color", TOOLS[i][2])
        palette.add_child(button)
    var spacer := Control.new()
    spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    palette.add_child(spacer)
    palette.add_child(_button("−", _resize_brush.bind(-1)))
    radius_label = _label("Brush 3")
    palette.add_child(radius_label)
    palette.add_child(_button("+", _resize_brush.bind(1)))
    var footer := PanelContainer.new()
    footer.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
    footer.offset_top = -66
    footer.add_theme_stylebox_override("panel", _style(Color("101e24")))
    layer.add_child(footer)
    var foot_column := VBoxContainer.new()
    footer.add_child(foot_column)
    var foot_row := HBoxContainer.new()
    foot_column.add_child(foot_row)
    info_label = _label("Paint: left drag   ·   Pan: middle drag / Shift + drag   ·   Zoom: wheel   ·   Brush: [ ]", 13)
    info_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    foot_row.add_child(info_label)
    status_label = _label("")
    foot_row.add_child(status_label)
    inspector_label = _label("Fine grains · Pour sugar into water. Heat or cool it to explore concentration.", 12, Color("91b7b2"))
    foot_column.add_child(inspector_label)
    workshop = preload("res://workshop_panel.gd").new()
    workshop.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
    workshop.offset_left = -440
    workshop.offset_top = 124
    workshop.offset_bottom = -66
    layer.add_child(workshop)
    workshop.hide()
    _filter_tools()
    _select(0)

func _select(index: int) -> void:
    selected = clampi(index, 0, TOOLS.size() - 1)
    var item := material_picker.get_item_index(selected)
    if item < 0:
        category_picker.select(0)
        tool_search.clear()
        _filter_tools()
        item = material_picker.get_item_index(selected)
    if item >= 0:
        material_picker.select(item)
    if TOOLS[selected][1] > 0 and TOOLS[selected][1] < 40:
        last_liquid = TOOLS[selected][1]
    if info_label != null:
        var code: int = TOOLS[selected][1]
        info_label.text = "Wire: click a switch, then its targets; click the switch again to finish." if code == 302 else "Pump: click an empty inlet cell, then an empty outlet cell. Click again to toggle." if code == 301 else "Machine: click to place or adjust. Choose a liquid first for filters, membranes and sources." if machine_codes.has(code) else "Paint: left drag   ·   Pan: middle drag / Shift + drag   ·   Zoom: wheel   ·   Brush: [ ]"
    for i in tool_buttons.size():
        tool_buttons[i].add_theme_stylebox_override("normal", _style(Color("29433f") if i == selected else Color("1d3036"), Color("91bdae") if i == selected else Color.TRANSPARENT))

func _resize_brush(change: int) -> void:
    radius = clampi(radius + change, 1, 16)
    radius_label.text = "Brush %d" % radius
    queue_redraw()

func _toggle_pause() -> void:
    paused = not paused
    pause_button.text = "Resume  ·  Space" if paused else "Pause  ·  Space"
    status_clock = 0.25

func _single_step() -> void:
    if not paused:
        _toggle_pause()
    world.advance(1)
    workshop.model.step(1)
    dirty = true

func _reset() -> void:
    world.reset_demo(SEED)
    dirty = true

func _toggle_workshop() -> void:
    workshop.visible = not workshop.visible
    drawing = false
    panning = false

func _toggle_day() -> void:
    day = not day
    world.environment(1.0 if day else 0.0, 0.4 if breezy else 0.0)
    liquid_material.set_shader_parameter("sunlight", 1.0 if day else 0.0)
    inspector_label.text = "Environment: %s · wind %s" % ["day" if day else "night", "on" if breezy else "off"]

func _toggle_wind() -> void:
    breezy = not breezy
    world.environment(1.0 if day else 0.0, 0.4 if breezy else 0.0)
    inspector_label.text = "Environment: %s · wind %s" % ["day" if day else "night", "on" if breezy else "off"]

func _pointer_over_ui() -> bool:
    var pointer := get_viewport().get_mouse_position()
    return pointer.y < 124 or pointer.y > get_viewport_rect().size.y - 66 or (workshop != null and workshop.visible and pointer.x > get_viewport_rect().size.x - 440)

func _input(event: InputEvent) -> void:
    # Always release a drag, including when the pointer ends over a button.
    if event is InputEventMouseButton and not event.pressed:
        if event.button_index == MOUSE_BUTTON_LEFT:
            drawing = false
            if not Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
                panning = false
        if event.button_index == MOUSE_BUTTON_MIDDLE:
            panning = false

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo:
        match event.keycode:
            KEY_SPACE: _toggle_pause()
            KEY_N: _single_step()
            KEY_R: _reset()
            KEY_BRACKETLEFT: _resize_brush(-1)
            KEY_BRACKETRIGHT: _resize_brush(1)
        if event.keycode >= KEY_1 and event.keycode <= KEY_8:
            _select(event.keycode - KEY_1)
    if event is InputEventMouseButton and event.pressed and not _pointer_over_ui():
        match event.button_index:
            MOUSE_BUTTON_LEFT:
                panning = event.shift_pressed
                drawing = not panning
                if drawing and machine_codes.has(TOOLS[selected][1]):
                    var cell := Vector2i((get_global_mouse_position() / CELL).floor())
                    if TOOLS[selected][1] == 302:
                        world.wire_action(cell.x, cell.y)
                    else:
                        world.device_action(cell.x, cell.y, TOOLS[selected][1], last_liquid)
                    drawing = false
                    dirty = true
                    inspector_label.text = world.stats().message
            MOUSE_BUTTON_MIDDLE:
                panning = true
                drawing = false
            MOUSE_BUTTON_WHEEL_UP: _zoom(1.15)
            MOUSE_BUTTON_WHEEL_DOWN: _zoom(1.0 / 1.15)
    if event is InputEventMouseMotion:
        if panning:
            camera.position -= event.relative / camera.zoom
            _clamp_camera()
        queue_redraw()

func _zoom(factor: float) -> void:
    var before := get_global_mouse_position()
    camera.zoom = Vector2.ONE * clampf(camera.zoom.x * factor, 0.25, 5.0)
    camera.force_update_scroll()
    camera.position += before - get_global_mouse_position()
    _clamp_camera()

func _clamp_camera() -> void:
    camera.position.x = clampf(camera.position.x, 0, WIDTH * CELL)
    camera.position.y = clampf(camera.position.y, 0, HEIGHT * CELL)
    camera.force_update_scroll()
    queue_redraw()

func _physics_process(_delta: float) -> void:
    if drawing and not _pointer_over_ui():
        var cell := Vector2i((get_global_mouse_position() / CELL).floor())
        var material: int = TOOLS[selected][1]
        if material >= 101 and material <= 107:
            var pixel := Vector2i(get_global_mouse_position().floor())
            dirty = world.paint_grains(pixel.x, pixel.y, radius * 4, material - 100) > 0 or dirty
        elif material == 201 or material == 202:
            dirty = world.heat(cell.x, cell.y, radius, 60.0 if material == 201 else -30.0) or dirty
        elif material >= 400:
            dirty = world.dye(cell.x, cell.y, radius, material - 400) or dirty
        else:
            dirty = world.paint(cell.x, cell.y, radius, material) or dirty
    if not paused:
        world.advance(1)
        workshop.model.step(1)
        dirty = true

func _process(delta: float) -> void:
    animation_time += delta
    liquid_material.set_shader_parameter("animation_time", animation_time)
    liquid_material.set_shader_parameter("view_origin", (camera.get_screen_center_position() - get_viewport_rect().size / camera.zoom / 2).floor())
    if dirty:
        _refresh_texture()
    status_clock += delta
    if status_clock >= 0.25:
        status_clock = 0.0
        var stats := world.stats()
        status_label.text = "%s · %d fps · %d grains" % ["Paused" if paused else "Running", Engine.get_frames_per_second(), stats.grains]
        var cell := Vector2i((get_global_mouse_position() / CELL).floor())
        var sample: Dictionary = world.inspect(cell.x, cell.y)
        if not sample.is_empty() and not _pointer_over_ui():
            if sample.has("machine"):
                inspector_label.text = "%s · %.1f °C · %s · setting %s · liquid #%s · %s" % [TOOLS[selected][0], sample.temperature, "active" if sample.active or sample.on or sample.open else "idle", sample.level if sample.machine != 14 else sample.period, sample.liquid, stats.message]
            else:
                inspector_label.text = "%s · %.1f °C · sugar %.2f · salt %.2f · stored water %.1f · %s" % [TOOLS[selected][0], sample.temperature, sample.sugar, sample.salt, sample.stored_water, stats.message]

func _refresh_texture() -> void:
    var pixels: PackedByteArray = world.render_data()
    var image := Image.create_from_data(WIDTH, HEIGHT * 2, false, Image.FORMAT_RGBA8, pixels)
    if texture == null:
        texture = ImageTexture.create_from_image(image)
        surface.texture = texture
        liquid_material.set_shader_parameter("world_data", texture)
    else:
        texture.update(image)
    var solution_image := Image.create_from_data(WIDTH, HEIGHT, false, Image.FORMAT_RGBA8, world.solution_data())
    if solution_texture == null:
        solution_texture = ImageTexture.create_from_image(solution_image)
        liquid_material.set_shader_parameter("solution_data", solution_texture)
        liquid_material.set_shader_parameter("has_solutions", true)
    else:
        solution_texture.update(solution_image)
    var grains: PackedByteArray = world.grain_pixels()
    liquid_material.set_shader_parameter("has_grains", not grains.is_empty())
    if not grains.is_empty():
        var grain_image := Image.create_from_data(WIDTH * 8, HEIGHT * 8, false, Image.FORMAT_R8, grains)
        if grain_texture == null:
            grain_texture = ImageTexture.create_from_image(grain_image)
            liquid_material.set_shader_parameter("grain_data", grain_texture)
        else:
            grain_texture.update(grain_image)
    dirty = false
    machine_view = world.device_data()
    pending_wire = world.stats().pending_wire
    queue_redraw()

func _draw() -> void:
    draw_rect(Rect2(0, 0, WIDTH * CELL, HEIGHT * CELL), Color("42616a"), false, 1.0)
    for device in machine_view:
        var pos := Vector2(int(device.cell) % WIDTH, int(device.cell) / WIDTH) * CELL
        var live: bool = device.on or device.active or device.open
        var lit := Color("7ae08a") if live else Color("d47868")
        if device.kind in [25, 26, 27]:
            draw_rect(Rect2(pos + Vector2(2, 0), Vector2(4, 8)), Color("8297a5"))
            draw_rect(Rect2(pos + Vector2(0, 2), Vector2(8, 4)), Color("8297a5"))
            draw_rect(Rect2(pos + Vector2(3, 1), Vector2(2, 6)), Color("5fbae0") if device.active else Color("26383e"))
            if device.kind == 26:
                draw_line(pos + Vector2(2, 2), pos + Vector2(6, 6), lit, 1.5)
            elif device.kind == 27:
                draw_rect(Rect2(pos + Vector2(2, 2), Vector2(4, 4)), Color("cbd889"), false, 1)
        elif device.kind == 11:
            draw_rect(Rect2(pos + Vector2(1, 6), Vector2(6, 2)), Color("627582"))
            draw_line(pos + Vector2(4, 6), pos + Vector2(6 if device.on else 2, 1), lit, 2)
        elif device.kind == 15 and device.open:
            draw_rect(Rect2(pos, Vector2(8, 8)), Color("7b9a9b"), false, 1)
        else:
            draw_rect(Rect2(pos, Vector2(8, 8)), Color("16252d"))
            draw_rect(Rect2(pos + Vector2.ONE, Vector2(6, 6)), Color("4b606b"))
            draw_rect(Rect2(pos + Vector2(1, 1), Vector2(2, 2)), lit)
            if device.kind in [8, 9, 16, 17]:
                var down: bool = device.kind in [8, 17]
                draw_line(pos + Vector2(4, 2), pos + Vector2(4, 6), Color("87d2ec"), 1)
                draw_line(pos + Vector2(2, 4), pos + Vector2(4, 6 if down else 2), Color("87d2ec"), 1)
                draw_line(pos + Vector2(6, 4), pos + Vector2(4, 6 if down else 2), Color("87d2ec"), 1)
            elif device.kind == 30:
                for x in [2, 4, 6]:
                    draw_line(pos + Vector2(x, 3), pos + Vector2(x, 6), Color("ef8e4c") if live else Color("795442"), 1)
            elif device.kind in [58, 66]:
                var colors := [Color("fff1a6"), Color("ee806f"), Color("7ed594"), Color("79b9eb"), Color("c995df")]
                draw_rect(Rect2(pos + Vector2(2, 2), Vector2(4, 4)), colors[int(device.colour)] if live else Color("555846"))
            elif device.kind in [28, 29, 41, 59]:
                var angle: float = animation_time * (4.0 if live else 0.0)
                draw_line(pos + Vector2(4, 4) - Vector2.from_angle(angle) * 3, pos + Vector2(4, 4) + Vector2.from_angle(angle) * 3, Color("d0c8a7"), 1)
            elif device.kind == 61:
                draw_rect(Rect2(pos + Vector2(1, 2), Vector2(6, 4)), Color("264b81"))
            elif device.kind == 57:
                draw_rect(Rect2(pos + Vector2(2, 3), Vector2(4 * float(device.charge) / 1200.0, 3)), Color("7ae08a"))
            else:
                # Stable per-kind pixel glyph keeps different machine tools recognizable.
                for bit in 6:
                    if int(device.kind) & (1 << bit):
                        draw_rect(Rect2(pos + Vector2(2 + bit % 3 * 2, 4 + bit / 3 * 2), Vector2.ONE), Color("ece3b9"))
        if TOOLS[selected][1] == 302 or pending_wire >= 0:
            for target in device.targets:
                var end := Vector2(int(target) % WIDTH, int(target) / WIDTH) * CELL + Vector2(4, 4)
                draw_line(pos + Vector2(4, 4), end, Color(0.93, 0.78, 0.28, 0.75), 1.0 / camera.zoom.x)
    if pending_wire >= 0:
        var start := Vector2(pending_wire % WIDTH, pending_wire / WIDTH) * CELL + Vector2(4, 4)
        draw_line(start, get_global_mouse_position(), Color("f2c94c"), 1.0 / camera.zoom.x)
    if not _pointer_over_ui():
        var center := (get_global_mouse_position() / CELL).floor() * CELL + Vector2.ONE * CELL / 2
        var fine: bool = TOOLS[selected][1] >= 101 and TOOLS[selected][1] <= 107
        draw_arc(get_global_mouse_position() if fine else center, radius * (4.0 if fine else CELL), 0, TAU, 48, Color(0.85, 0.96, 0.91, 0.65), 1.0 / camera.zoom.x)
