extends Node2D

const CELL := 8.0
const WIDTH := 512
const HEIGHT := 128
const SEED := 7
# The campaign is the base (docs/design/rooms.md): one bare room over the factory hall, built out room by room.
const ROOM_TYPES := ["workshop", "lab", "grow", "cellar"]
const WORLD_SAVE := "user://world-v1.ecosave"
const PLAYER_ART := "res://art/player.png"
const DOOR_CODE := 1004
const REMOVE_CODE := 1000
const PIPE_CODE := 1006
const VALVE_CODE := 1007
const PUMP_CODE := 1008
# How far above the player the campaign camera looks, as a share of the view's height.
const FRAME_LIFT := 0.14
var TOOLS: Array = [
    ["Water", 1, Color("5daee7")], ["Oil", 9, Color("b6a16b")],
    ["Honey", 3, Color("edb151")], ["Steam", 8, Color("c3d5da")],
    ["Mercury", 5, Color("a9bbc5")], ["Stone", -2, Color("8b9b9d")],
    ["Dirt", -1, Color("bc9673")], ["Erase", 0, Color("d78c83")],
    ["Sand · fine grains", 101, Color("d7b979")], ["Sugar · sucrose", 102, Color("fff0c9")],
    ["Salt · sodium chloride", 103, Color("d6edf1")], ["Ethanol", 35, Color("b2d3dc")],
    ["Blood", 36, Color("c64d5c")], ["Blood plasma", 37, Color("e4bf57")],
    ["Vinegar", 38, Color("d1cc9e")], ["Brine", 39, Color("70b6cd")],
    ["Heat", 201, Color("ee936b")], ["Cool", 202, Color("8ecbea")],
    ["Ignite", 203, Color("ff9a3c")]
]

# The campaign plot (player, building with costs) and the free sandbox are separate worlds; Tab swaps them.
var campaign_world := EcologistWorld.new()
var sandbox_world := EcologistWorld.new()
var world: EcologistWorld
var campaign := true
var build_items: Array = []
var build_reach := 12
var build_selected := 0
var build_buttons: Array[Button] = []
var kit_items: Array = []
var kit_selected := 0
var kit_buttons: Array[Button] = []
var kit_mode := false
var kitchen: PanelContainer
var shop: PanelContainer
var people: PanelContainer
var hud: Control
var lighting: Node
var backdrop: Node2D
var decor: Node2D
var sprite_material := ShaderMaterial.new()
var sun_level := -1.0
var top_panel: PanelContainer
var footer: PanelContainer
var equipment_view: Array = []
var build_bar: Control
var palette: HBoxContainer
var mode_button: Button
var sandbox_only: Array[Button] = []
var campaign_only: Array[Button] = []
var hud_label: Label
var clock_label: Label
var player_texture: Texture2D
var player: Dictionary = {}
var walk_clock := 0.0
var removing := false
var last_build := Vector2i(-1, -1)
var notice_until := 0.0
var camera := Camera2D.new()
var surface := Sprite2D.new()
var texture: ImageTexture
var grain_texture: ImageTexture
var solution_texture: ImageTexture
var fire_texture: ImageTexture
var back_texture: ImageTexture
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
var pressure := true
var momentum := true
var pending_wire := -1
var rooms: RoomsModel
# The old plot (the workshop bay with its kitchen, the van and the town) instead of the base: tests of those
# systems set it before the game enters the tree.
var legacy_plot := false
var room_mode := false
var room_type := 0
var furniture: Node2D
var furnish_mode := false
var furnish_index := 0

func _ready() -> void:
    rooms = RoomsModel.new(campaign_world)
    if legacy_plot:
        campaign_world.setup_plot(SEED)
    else:
        campaign_world.setup_base(SEED)
        rooms.add(0, 0, "workshop")
    sandbox_world.reset_demo(SEED)
    world = campaign_world
    _load_catalog()
    _load_build_items()
    player_texture = _load_texture(PLAYER_ART)
    surface.centered = false
    surface.show_behind_parent = true
    # The texture holds two metadata planes; the shader expands each world cell to 8x8 pixels.
    surface.scale = Vector2(CELL, CELL / 2)
    surface.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    liquid_material.shader = preload("res://liquid.gdshader")
    surface.material = liquid_material
    var walls := _load_texture("res://art/rooms/walls.png")
    if walls != null:
        liquid_material.set_shader_parameter("wall_atlas", walls)
        liquid_material.set_shader_parameter("has_wall_atlas", true)
    add_child(surface)
    furniture = preload("res://furniture.gd").new()
    furniture.show_behind_parent = true
    furniture.setup(rooms)
    furniture.world = campaign_world
    furniture.frame = walls
    add_child(furniture)
    lighting = preload("res://lighting.gd").new()
    add_child(lighting)
    # Sprites drawn here and the props share the campaign light; the backdrop sits behind the world.
    sprite_material.shader = preload("res://sprite_light.gdshader")
    material = sprite_material
    backdrop = preload("res://backdrop.gd").new()
    backdrop.camera = camera
    backdrop.horizon = 800.0 if legacy_plot else RoomsModel.GROUND * CELL
    add_child(backdrop)
    decor = preload("res://decor.gd").new()
    decor.setup(self)
    if not legacy_plot:
        decor.data.placements = [] # the base starts bare: props come with the generated furniture
    add_child(decor)
    camera.position = Vector2(104, 74) * CELL
    add_child(camera)
    _build_ui()
    _select(9)
    _set_mode(true)
    _refresh_texture()

func _load_build_items() -> void:
    var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/build_costs.json"))
    build_items = data.items
    build_reach = int(data.reach_tiles)
    kit_items = JSON.parse_string(FileAccess.get_file_as_string("res://data/equipment.json")).items

# Imported when the editor has seen the file; read straight from disk otherwise (headless test runs).
func _load_texture(path: String) -> Texture2D:
    if ResourceLoader.exists(path):
        return load(path)
    var image := Image.load_from_file(ProjectSettings.globalize_path(path))
    return ImageTexture.create_from_image(image) if image != null else null

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
    # The sandbox keeps its tool bars; the campaign is drawn by the HUD and the themed windows under ui.
    var panel := PanelContainer.new()
    top_panel = panel
    panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
    panel.offset_bottom = 124
    panel.add_theme_stylebox_override("panel", _style(Color("101e24")))
    layer.add_child(panel)
    var column := VBoxContainer.new()
    column.add_theme_constant_override("separation", 12)
    panel.add_child(column)
    var heading := HBoxContainer.new()
    heading.add_theme_constant_override("separation", 10)
    column.add_child(heading)
    heading.add_child(_label("ecologist", 28, Color("e1f2e5")))
    heading.add_child(_label("MATERIALS & MACHINES", 12, Color("8cb8aa")))
    # The campaign clock and the next delivery; it takes the free width and clips rather than pushing buttons off.
    clock_label = _label("", 14, Color("e1f2e5"))
    clock_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    clock_label.clip_text = true
    heading.add_child(clock_label)
    mode_button = _button("Sandbox  ·  Tab", func(): _set_mode(not campaign))
    heading.add_child(mode_button)
    heading.add_child(_button("Day / night", _toggle_day))
    sandbox_only.append(_button("Wind on / off", _toggle_wind))
    sandbox_only.append(_button("Pressure on / off", _toggle_pressure))
    sandbox_only.append(_button("Momentum on / off", _toggle_momentum))
    for button in sandbox_only:
        heading.add_child(button)
    heading.add_child(_button("Workshop", _toggle_workshop))
    campaign_only.append(_button("Save · F5", _save_world))
    campaign_only.append(_button("Load · F9", _load_world))
    for button in campaign_only:
        heading.add_child(button)
    pause_button = _button("Pause  ·  Space", _toggle_pause)
    heading.add_child(pause_button)
    sandbox_only.append(_button("Step  ·  N", _single_step))
    sandbox_only.append(_button("Reset sandbox  ·  R", _reset))
    heading.add_child(sandbox_only[3])
    heading.add_child(sandbox_only[4])
    palette = HBoxContainer.new()
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
    for i in [0, 8, 9, 10, 16, 17, 18]:
        var button := _button(["Water", "Sand", "Sugar", "Salt", "Heat", "Cool", "Ignite"][[0, 8, 9, 10, 16, 17, 18].find(i)], _select.bind(i))
        button.add_theme_color_override("font_color", TOOLS[i][2])
        palette.add_child(button)
    var spacer := Control.new()
    spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    palette.add_child(spacer)
    palette.add_child(_button("−", _resize_brush.bind(-1)))
    radius_label = _label("Brush 3")
    palette.add_child(radius_label)
    palette.add_child(_button("+", _resize_brush.bind(1)))
    footer = PanelContainer.new()
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
    hud_label = _label("", 14, Color("e1f2e5"))
    foot_row.add_child(hud_label)
    status_label = _label("")
    foot_row.add_child(status_label)
    inspector_label = _label("Fine grains · Pour sugar into water. Heat or cool it to explore concentration.", 12, Color("91b7b2"))
    foot_column.add_child(inspector_label)
    var ui := Control.new()
    ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
    ui.theme = UiStyle.theme()
    ui.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    layer.add_child(ui)
    workshop = preload("res://workshop_panel.gd").new()
    workshop.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
    workshop.offset_left = -480
    workshop.offset_right = -12
    workshop.offset_top = 124
    workshop.offset_bottom = -132
    ui.add_child(workshop)
    workshop.hide()
    kitchen = preload("res://kitchen.gd").new()
    kitchen.setup(self)
    kitchen.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
    kitchen.grow_horizontal = Control.GROW_DIRECTION_BEGIN
    kitchen.offset_left = -480
    kitchen.offset_right = -12
    kitchen.offset_top = 124
    ui.add_child(kitchen)
    shop = preload("res://shop_panel.gd").new()
    shop.setup(self)
    ui.add_child(shop)
    people = preload("res://people_panel.gd").new()
    people.setup(self)
    ui.add_child(people)
    hud = preload("res://hud.gd").new()
    ui.add_child(hud)
    hud.setup(self)
    ui.move_child(hud, 0)
    build_bar = hud.bar
    for button in hud.slots.kit:
        kit_buttons.append(button)
    for button in hud.slots.build:
        build_buttons.append(button)
    _refresh_kit()
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

func _select_build(index: int) -> void:
    if build_selected != clampi(index, 0, build_items.size() - 1) and campaign and inspector_label != null:
        match int(build_items[clampi(index, 0, build_items.size() - 1)].code):
            PIPE_CODE: _notice("Pipe: drag to lay it cell by cell. Ends next to a tank's port couple to it.")
            VALVE_CODE: _notice("Valve: place it in a pipe run; click a valve to open or shut it.")
            PUMP_CODE: _notice("Pump: click the inlet cell, then the outlet cell. Click either end to switch it.")
    build_selected = clampi(index, 0, build_items.size() - 1)
    if hud != null:
        hud.highlight(kit_mode, build_selected, kit_selected)

func _select_kit(index: int) -> void:
    kit_selected = clampi(index, 0, kit_items.size() - 1)
    if hud != null:
        hud.highlight(kit_mode, build_selected, kit_selected)

# Crated pieces show how many delivered crates wait to be placed.
func _refresh_kit() -> void:
    for i in kit_items.size():
        var item: Dictionary = kit_items[i]
        if item.get("crate", false):
            hud.set_count(i, int(shop.model.crates.get(item.id, 0)))

# The build bar shows either building tiles or the kitchen kit.
func _set_kit_mode(on: bool) -> void:
    kit_mode = on
    _select_kit(kit_selected)

# The line over the hotbar: what the selected slot builds or places, and what it costs.
func _item_text() -> String:
    if kitchen.carrying >= 0:
        return "Carrying the %s · click to put it down" % kitchen.name_of(String(world.equipment_info(kitchen.carrying).get("kind", ""))).to_lower()
    if kit_mode:
        var item: Dictionary = kit_items[kit_selected]
        if item.get("crate", false):
            return "%s · %d in crates" % [item.name, int(shop.model.crates.get(item.id, 0))]
        return "%s · %d credits" % [item.name, int(item.cost)]
    var piece: Dictionary = build_items[build_selected]
    return "%s · %d credit%s per %s" % [piece.name.get_slice(" · ", 0), int(piece.cost), "" if int(piece.cost) == 1 else "s", "cell" if piece.get("cell", false) else "tile"]

# The tooltip at the pointer: equipment, the truck at the curb, valves and pumps.
func _hover_tip() -> String:
    var person: String = people.tip(get_global_mouse_position())
    if not person.is_empty():
        return person
    var cell := Vector2i((get_global_mouse_position() / CELL).floor())
    var id: int = world.equipment_at(cell.x, cell.y)
    if id >= 0:
        return kitchen.hover_text(id)
    if shop.truck_at(cell):
        return "%s · click to unload" % shop.model.status() if not shop.model.tanker_here() else shop.model.status()
    var solid := int(world.inspect(cell.x, cell.y).get("solid", 0))
    if solid == 26:
        var open: bool = world.inspect(cell.x, cell.y).get("open", false)
        return "Valve · %s · click to %s" % ["open" if open else "shut", "shut it" if open else "open it"]
    if solid == 8 or solid == 9:
        return "Pump %s · click to switch it" % ("inlet" if solid == 8 else "outlet")
    if solid == 25:
        return "Pipe"
    return ""

func _item_name() -> String:
    if kitchen != null and kitchen.carrying >= 0:
        return "Carrying"
    return kit_items[kit_selected].name if kit_mode else build_items[build_selected].name

# Clicks on equipment use it; with the kit selected, clicks place and pick up equipment instead of building.
func _equipment_click(cell: Vector2i, right: bool) -> bool:
    if kitchen.carrying >= 0:
        if right:
            kitchen.carrying = -1
            _notice("Left where it was.")
        elif _in_reach(_tile_at(cell)):
            kitchen.put_down(cell)
        else:
            _notice("Too far away to put it there.")
        return true
    var id: int = world.equipment_at(cell.x, cell.y)
    if id >= 0:
        if not _in_reach(_tile_at(cell)):
            _notice("Too far away to reach it.")
        elif right and kit_mode:
            kitchen.pick_up(id)
        elif right:
            _notice("Choose the kitchen kit (K) to pick equipment up.")
        else:
            kitchen.open(id)
        return true
    if not kit_mode:
        return false
    if not right:
        if _in_reach(_tile_at(cell)):
            kitchen.place(kit_items[kit_selected].id, cell)
        else:
            _notice("Too far away to put it there.")
    return true

func _set_mode(on: bool) -> void:
    if world != null:
        world.player_input(false, false, false, false, false)
    campaign = on
    world = campaign_world if on else sandbox_world
    world.environment(1.0 if day else 0.0, 0.4 if breezy else 0.0)
    world.flow(pressure, momentum)
    sun_level = -1.0
    lighting.dirty = true
    lighting.off([liquid_material, sprite_material])
    liquid_material.set_shader_parameter("styled", on)
    backdrop.visible = on
    decor.visible = on
    liquid_material.set_shader_parameter("stars", 0.0)
    liquid_material.set_shader_parameter("sunlight", 1.0 if day or on else 0.0)
    palette.visible = not on
    build_bar.visible = on
    top_panel.visible = not on
    footer.visible = not on
    hud.visible = on
    workshop.campaign_view(on)
    if not on:
        hud.close_menu()
    mode_button.text = "Sandbox  ·  Tab" if on else "Campaign  ·  Tab"
    if kitchen != null:
        kitchen.close()
    hud_label.visible = on
    for button in sandbox_only:
        button.visible = not on
    for button in campaign_only:
        button.visible = on
    clock_label.visible = on
    _label_pause()
    drawing = false
    panning = false
    camera.zoom = Vector2.ONE * (2.0 if on else 1.0)
    player = world.player_state()
    if on and player.get("active", false):
        camera.position = Vector2(player.x, player.y)
    elif not on:
        camera.position = Vector2(104, 74) * CELL
    _clamp_camera()
    _select_build(build_selected)
    _set_kit_mode(kit_mode)
    info_label.text = "Move: A D · Jump: Space · Climb: W S · Use: E or click · Build: left click · Remove: right click · Kit: K · Pause: P" if on else "Paint: left drag   ·   Pan: middle drag / Shift + drag   ·   Zoom: wheel   ·   Brush: [ ]"
    dirty = true

# A message that the hover inspector leaves on screen for a moment.
func _notice(text: String) -> void:
    inspector_label.text = text
    notice_until = animation_time + 2.5
    if hud != null and campaign:
        hud.toast(text)

func _tile_at(cell: Vector2i) -> Vector2i:
    return Vector2i(cell.x & ~1, cell.y & ~1)

func _in_reach(tile: Vector2i) -> bool:
    if not player.get("active", false):
        return false
    var center := Vector2(player.x + player.width / 2.0, player.y + player.height / 2.0)
    return center.distance_to(Vector2(tile) * CELL + Vector2.ONE * CELL) <= build_reach * 2 * CELL

func _item_for(code: int) -> Dictionary:
    for item in build_items:
        if int(item.code) == code:
            return item
    return {}

# The pipe, valve or pump build item at a cell, if one is there.
func _fitting_at(cell: Vector2i) -> Dictionary:
    var solid := int(world.inspect(cell.x, cell.y).get("solid", 0))
    for item in build_items:
        if item.get("cell", false) and (int(item.solid) == solid or (int(item.solid) == 8 and solid == 9)):
            return item
    return {}

# A click on a valve opens or shuts it; on a pump end it switches the pump (or cancels a lone inlet, refunded).
func _toggle_fitting(cell: Vector2i) -> bool:
    var solid := int(world.inspect(cell.x, cell.y).get("solid", 0))
    if solid != 26 and solid != 8 and solid != 9:
        return false
    if not _in_reach(_tile_at(cell)):
        _notice("Too far away to reach it.")
        return true
    var pending: bool = int(world.stats().pending_inlet) == cell.y * WIDTH + cell.x
    var was_open: bool = world.inspect(cell.x, cell.y).get("open", false)
    world.device_action(cell.x, cell.y, -26 if solid == 26 else 301, 1)
    if pending:
        workshop.model.cash += float(_item_for(PUMP_CODE).cost)
        _notice("Pump cancelled · refunded.")
    elif solid == 26:
        _notice("Valve shut." if was_open else "Valve open.")
    else:
        _notice(world.stats().message + ".")
    dirty = true
    return true

# Pipes are laid cell by cell along the drag, four-connected so a fast drag leaves no gaps; a valve or pump end
# goes down once per click. A pump is paid for when its inlet goes down.
func _lay(cell: Vector2i, item: Dictionary) -> void:
    var code := int(item.code)
    var steps: Array[Vector2i] = []
    if last_build == Vector2i(-1, -1):
        steps.append(cell)
    elif code == PIPE_CODE:
        var at := last_build
        while at != cell and steps.size() < 64:
            var gap := cell - at
            if absi(gap.x) >= absi(gap.y):
                at.x += signi(gap.x)
            else:
                at.y += signi(gap.y)
            steps.append(at)
    if steps.is_empty():
        return
    last_build = cell
    var model: WorkshopModel = workshop.model
    for at in steps:
        if not _in_reach(_tile_at(at)):
            _notice("Too far away to build there.")
            return
        var inlet := code == PUMP_CODE and int(world.stats().pending_inlet) < 0
        var cost: float = float(item.cost) if code != PUMP_CODE or inlet else 0.0
        if model.cash + 0.000001 < cost:
            _notice("Not enough credits for %s (%.2f)." % [item.name, cost])
            return
        if world.build(at.x, at.y, code) > 0:
            model.cash = maxf(0.0, model.cash - cost)
            dirty = true
            if code == PUMP_CODE:
                _notice(("Pump inlet placed · %.2f credits. Click the outlet cell." % cost) if inlet else "Pump connected. Click either end to switch it.")
            else:
                _notice("Built %s · %.2f credits" % [item.short.to_lower(), cost])
        elif steps.size() == 1:
            _notice("Fittings go in empty cells.")

# Credits returned for removing a tile, worked out cell by cell in the order the native remove follows.
func _salvage(tile: Vector2i) -> float:
    var cells: Array[Dictionary] = []
    var any_solid := false
    var any_ladder := false
    for y in range(tile.y, tile.y + 2):
        for x in range(tile.x, tile.x + 2):
            var cell: Dictionary = world.inspect(x, y)
            if cell.is_empty():
                continue
            cells.append(cell)
            any_solid = any_solid or int(cell.solid) != 0
            any_ladder = any_ladder or (int(cell.back) & 0x40) != 0
    var value := 0.0
    for cell in cells:
        var item: Dictionary = {}
        var share := 0.25
        if any_solid:
            if int(cell.solid) == 80:
                item = _item_for(DOOR_CODE)
                share = 1.0 / 12.0
            elif int(cell.solid) != 0:
                item = _item_for(-int(cell.solid))
        elif any_ladder:
            if int(cell.back) & 0x40:
                item = _item_for(1003)
        elif int(cell.back) & 0x0f:
            # wood 1 and brick 2 are built with 1001 and 1002; plaster 3 with 1009
            var wall := int(cell.back) & 0x0f
            item = _item_for(1009 if wall == 3 else 1000 + wall)
        if not item.is_empty():
            value += float(item.cost) * float(item.salvage) * share
    return value

func _campaign_build(cell: Vector2i) -> void:
    var tile := _tile_at(cell)
    var single: bool = removing and not _fitting_at(cell).is_empty()
    if not removing and build_items[build_selected].get("cell", false):
        if cell != last_build:
            _lay(cell, build_items[build_selected])
        return
    if (cell if single else tile) == last_build:
        return
    last_build = cell if single else tile
    if not _in_reach(tile):
        _notice("Too far away to build there.")
        return
    var model: WorkshopModel = workshop.model
    if removing:
        var fitting := _fitting_at(cell)
        if not fitting.is_empty():
            var refund := float(fitting.cost) * float(fitting.salvage)
            if world.build(cell.x, cell.y, REMOVE_CODE) > 0:
                model.cash += refund
                _notice("Removed the %s · %.2f credits back" % [String(fitting.short).to_lower(), refund])
                dirty = true
            return
        var refund := _salvage(tile)
        if world.build(tile.x, tile.y, REMOVE_CODE) > 0:
            model.cash += refund
            _notice("Removed · %.2f credits back" % refund if refund > 0 else "Removed")
            dirty = true
        return
    var item: Dictionary = build_items[build_selected]
    var cost: float = item.cost
    if model.cash + 0.000001 < cost:
        _notice("Not enough credits for %s (%.2f)." % [item.name, cost])
        return
    var changed: int = world.build(tile.x, tile.y, int(item.code))
    if changed > 0:
        var spent := cost * minf(1.0, changed / (12.0 if int(item.code) == DOOR_CODE else 4.0))
        model.cash = maxf(0.0, model.cash - spent)
        _notice("Built %s · %.2f credits" % [item.name, spent])
        dirty = true
    elif int(item.code) < 0 or int(item.code) == DOOR_CODE:
        _notice("Something is in the way.")

func _save_world() -> void:
    var path := ProjectSettings.globalize_path(WORLD_SAVE)
    var error: String = campaign_world.save_world(path + ".tmp")
    if error.is_empty():
        if FileAccess.file_exists(WORLD_SAVE):
            DirAccess.remove_absolute(path)
        if DirAccess.rename_absolute(path + ".tmp", path) != OK:
            error = "could not replace the old save"
    workshop._save()
    if error.is_empty():
        error = shop.save()
    if error.is_empty():
        error = people.save()
    if error.is_empty():
        var file := FileAccess.open(WORLD_SAVE + ".rooms.json", FileAccess.WRITE)
        if file == null:
            error = "could not write the rooms"
        else:
            file.store_string(JSON.stringify(rooms.save_data()))
    _notice("Game saved." if error.is_empty() else "Could not save the world: " + error)

func _load_world() -> void:
    if not FileAccess.file_exists(WORLD_SAVE):
        _notice("No saved game yet.")
        return
    var error: String = campaign_world.load_world(ProjectSettings.globalize_path(WORLD_SAVE))
    if not error.is_empty():
        _notice("Could not load the world: " + error)
        return
    workshop._load_save()
    kitchen.reset()
    if FileAccess.file_exists(WORLD_SAVE + ".rooms.json"):
        var data = JSON.parse_string(FileAccess.get_file_as_string(WORLD_SAVE + ".rooms.json"))
        if data is Array:
            rooms.load_data(data)
    var deliveries: String = shop.load_save()
    var town: String = people.load_save()
    _refresh_kit()
    _set_mode(true)
    if not deliveries.is_empty():
        _notice("Game loaded, but not the deliveries: " + deliveries + ".")
    elif not town.is_empty():
        _notice("Game loaded, but not the town: " + town + ".")
    else:
        _notice("Game loaded.")

func _resize_brush(change: int) -> void:
    radius = clampi(radius + change, 1, 16)
    radius_label.text = "Brush %d" % radius
    queue_redraw()

func _toggle_pause() -> void:
    paused = not paused
    _label_pause()

func _label_pause() -> void:
    pause_button.text = ("Resume  ·  " if paused else "Pause  ·  ") + ("P" if campaign else "Space")
    status_clock = 0.25

func _single_step() -> void:
    if not paused:
        _toggle_pause()
    world.advance(1)
    workshop.model.step(1)
    dirty = true

func _reset() -> void:
    sandbox_world.reset_demo(SEED)
    dirty = true
    if campaign:
        inspector_label.text = "The sandbox world was reset. Your plot is unchanged."

func _toggle_workshop() -> void:
    workshop.visible = not workshop.visible
    if workshop.visible:
        kitchen.close()
        shop.close()
        people.close()
    drawing = false
    panning = false

# The campaign's light follows the clock: the light on the world and the sprites, the backdrop's sky, the water's
# sun glints and solar machines.
func _follow_sun() -> void:
    lighting.update_light(shop.model.minute)
    backdrop.minute = shop.model.minute
    backdrop.level = lighting.level
    if lighting.dirty:
        lighting.apply([liquid_material, sprite_material])
    if absf(lighting.level - sun_level) > 0.01:
        sun_level = lighting.level
        world.environment(sun_level, 0.4 if breezy else 0.0)
        liquid_material.set_shader_parameter("sunlight", sun_level)

func _toggle_day() -> void:
    if campaign:
        return
    day = not day
    world.environment(1.0 if day else 0.0, 0.4 if breezy else 0.0)
    liquid_material.set_shader_parameter("sunlight", 1.0 if day else 0.0)
    inspector_label.text = "Environment: %s · wind %s" % ["day" if day else "night", "on" if breezy else "off"]

func _toggle_wind() -> void:
    breezy = not breezy
    world.environment(1.0 if day else 0.0, 0.4 if breezy else 0.0)
    inspector_label.text = "Environment: %s · wind %s" % ["day" if day else "night", "on" if breezy else "off"]

func _toggle_pressure() -> void:
    pressure = not pressure
    world.flow(pressure, momentum)
    inspector_label.text = "Pressure %s · liquid %s through connected vessels" % ["on" if pressure else "off", "levels" if pressure else "no longer levels"]

func _toggle_momentum() -> void:
    momentum = not momentum
    world.flow(pressure, momentum)
    inspector_label.text = "Momentum %s · waves, jets and splashes %s" % ["on" if momentum else "off", "on" if momentum else "off"]

# Any control under the pointer that takes the mouse (bars, panels, windows, the hotbar) keeps clicks off the world.
func _pointer_over_ui() -> bool:
    return get_viewport().gui_get_hovered_control() != null

func _input(event: InputEvent) -> void:
    # Always release a drag, including when the pointer ends over a button.
    if event is InputEventMouseButton and not event.pressed:
        if event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT:
            drawing = false
            if not Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
                panning = false
        if event.button_index == MOUSE_BUTTON_MIDDLE:
            panning = false

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and not event.echo:
        match event.keycode:
            KEY_TAB:
                _set_mode(not campaign)
                return
            KEY_F5:
                _save_world()
                return
            KEY_F9:
                _load_world()
                return
    if campaign and event is InputEventKey and event.pressed and not event.echo:
        var hovered := Vector2i((get_global_mouse_position() / CELL).floor())
        var target: int = world.equipment_at(hovered.x, hovered.y)
        if event.keycode == KEY_P:
            _toggle_pause()
        elif event.keycode == KEY_ESCAPE:
            if kitchen.visible or shop.visible or workshop.visible or people.visible or kitchen.carrying >= 0:
                kitchen.close()
                shop.close()
                people.close()
                workshop.hide()
                kitchen.carrying = -1
            else:
                hud.toggle_menu()
        elif event.physical_keycode == KEY_R:
            room_mode = not room_mode
            furnish_mode = false
            _notice("Rooms: click a green slot to build a %s · 1-4 picks the kind · R to leave" % RoomsModel.TYPES[ROOM_TYPES[room_type]].name if room_mode else "Back to building inside the rooms")
            queue_redraw()
        elif event.physical_keycode == KEY_F:
            furnish_mode = not furnish_mode
            room_mode = false
            _notice("Furnish: click in a room to place a %s · , and . pick another · right-click takes one back · F to leave" % _furnish_piece().name.to_lower() if furnish_mode else "Back to building inside the rooms")
            queue_redraw()
        elif furnish_mode and (event.keycode == KEY_COMMA or event.keycode == KEY_PERIOD):
            furnish_index = posmod(furnish_index + (1 if event.keycode == KEY_PERIOD else -1), furniture.pieces.size())
            var piece := _furnish_piece()
            _notice("%s · %d credits%s" % [piece.name, int(piece.cost), " · " + piece.about if not String(piece.about).is_empty() else ""])
            queue_redraw()
        elif room_mode and event.keycode >= KEY_1 and event.keycode <= KEY_4:
            room_type = event.keycode - KEY_1
            _notice("%s · %s" % [RoomsModel.TYPES[ROOM_TYPES[room_type]].name, RoomsModel.TYPES[ROOM_TYPES[room_type]].about])
            queue_redraw()
        elif event.physical_keycode == KEY_K:
            _set_kit_mode(not kit_mode)
        elif event.physical_keycode == KEY_E and target >= 0 and _in_reach(_tile_at(hovered)):
            kitchen.open(target)
        elif event.physical_keycode == KEY_E and world.use_door_near_player():
            dirty = true
        elif event.keycode >= KEY_0 and event.keycode <= KEY_9:
            if kit_mode:
                _select_kit(event.keycode - KEY_1)
            else:
                _select_build((event.keycode - KEY_1 + 10) % 10)
    elif event is InputEventKey and event.pressed and not event.echo:
        match event.keycode:
            KEY_SPACE: _toggle_pause()
            KEY_N: _single_step()
            KEY_R: _reset()
            KEY_BRACKETLEFT: _resize_brush(-1)
            KEY_BRACKETRIGHT: _resize_brush(1)
        if event.keycode >= KEY_1 and event.keycode <= KEY_8:
            _select(event.keycode - KEY_1)
    if campaign and event is InputEventMouseButton and event.pressed and not _pointer_over_ui():
        match event.button_index:
            MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT:
                var clicked := Vector2i((get_global_mouse_position() / CELL).floor())
                if room_mode:
                    if event.button_index == MOUSE_BUTTON_LEFT:
                        _build_room(RoomsModel.slot_at(clicked))
                    return
                if furnish_mode:
                    if event.button_index == MOUSE_BUTTON_LEFT:
                        _furnish(get_global_mouse_position())
                    else:
                        var taken: String = furniture.remove_at(get_global_mouse_position())
                        if not taken.is_empty():
                            workshop.model.cash += float(furniture.piece(taken).cost) * 0.5
                    return
                if _equipment_click(clicked, event.button_index == MOUSE_BUTTON_RIGHT):
                    return
                if not kit_mode and event.button_index == MOUSE_BUTTON_LEFT and _toggle_fitting(clicked):
                    return
                drawing = true
                removing = event.button_index == MOUSE_BUTTON_RIGHT
                last_build = Vector2i(-1, -1)
            MOUSE_BUTTON_MIDDLE:
                panning = true
            MOUSE_BUTTON_WHEEL_UP: _zoom(1.15)
            MOUSE_BUTTON_WHEEL_DOWN: _zoom(1.0 / 1.15)
    elif event is InputEventMouseButton and event.pressed and not _pointer_over_ui():
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

func _furnish_piece() -> Dictionary:
    return furniture.pieces[furnish_index]

# Places the chosen piece where the pointer is, paid from the cash.
func _furnish(pointer: Vector2) -> String:
    var piece := _furnish_piece()
    var spot: Rect2 = furniture.spot(piece.id, pointer)
    var why: String = furniture.refusal(piece.id, spot)
    if why.is_empty() and workshop.model.cash + 0.000001 < float(piece.cost):
        why = "not enough credits"
    if why.is_empty():
        workshop.model.cash -= float(piece.cost)
        furniture.place(piece.id, spot)
    else:
        _notice("Can't put it here: %s" % why)
    return why

# Builds a room of the chosen kind in a slot, paid from the cash.
func _build_room(slot: Vector2i) -> String:
    var type: String = ROOM_TYPES[room_type]
    var price: float = rooms.cost(type, slot.y)
    var why: String = rooms.refusal(slot.x, slot.y)
    if why.is_empty() and workshop.model.cash + 0.000001 < price:
        why = "not enough credits"
    if why.is_empty():
        workshop.model.cash -= price
        rooms.add(slot.x, slot.y, type)
        dirty = true
        _notice("Built a %s for %.0f credits" % [RoomsModel.TYPES[type].name.to_lower(), price])
    else:
        _notice("Can't build here: %s" % why)
    return why

# In room mode: every slot a room could go in, green if affordable, with the room under the pointer outlined.
func _draw_room_slots() -> void:
    var type: String = ROOM_TYPES[room_type]
    var font := ThemeDB.fallback_font
    var pointer := RoomsModel.slot_at(Vector2i((get_global_mouse_position() / CELL).floor()))
    for level in range(RoomsModel.MIN_LEVEL, RoomsModel.MAX_LEVEL + 1):
        for slot in range(RoomsModel.MIN_SLOT, RoomsModel.MAX_SLOT + 1):
            if not rooms.refusal(slot, level).is_empty():
                continue
            var r := RoomsModel.slot_rect(slot, level)
            var rect := Rect2(Vector2(r.position) * CELL, Vector2(r.size) * CELL).grow(-3)
            var ok: bool = workshop.model.cash + 0.000001 >= rooms.cost(type, level)
            var tint := Color(0.55, 0.95, 0.65) if ok else Color(1.0, 0.45, 0.4)
            var hot := Vector2i(slot, level) == pointer
            draw_rect(rect, Color(tint, 0.22 if hot else 0.08))
            draw_rect(rect, Color(tint, 0.9 if hot else 0.45), false, 1.0)
            draw_string(font, rect.get_center() + Vector2(-30, 4), "+ %.0f" % rooms.cost(type, level), HORIZONTAL_ALIGNMENT_CENTER, 60, 10, Color(tint, 0.9))

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
    if campaign:
        world.player_input(
            Input.is_physical_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT),
            Input.is_physical_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT),
            Input.is_physical_key_pressed(KEY_SPACE),
            Input.is_physical_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP),
            Input.is_physical_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN))
        if drawing and not _pointer_over_ui():
            _campaign_build(Vector2i((get_global_mouse_position() / CELL).floor()))
    elif drawing and not _pointer_over_ui():
        var cell := Vector2i((get_global_mouse_position() / CELL).floor())
        var material: int = TOOLS[selected][1]
        if material >= 101 and material <= 107:
            var pixel := Vector2i(get_global_mouse_position().floor())
            dirty = world.paint_grains(pixel.x, pixel.y, radius * 4, material - 100) > 0 or dirty
        elif material == 203:
            dirty = world.ignite(cell.x, cell.y, radius) or dirty
        elif material == 201 or material == 202:
            dirty = world.heat(cell.x, cell.y, radius, 60.0 if material == 201 else -30.0) or dirty
        elif material >= 400:
            dirty = world.dye(cell.x, cell.y, radius, material - 400) or dirty
        else:
            dirty = world.paint(cell.x, cell.y, radius, material) or dirty
    if not paused:
        world.advance(1)
        workshop.model.step(1)
        if campaign:
            kitchen.bill()
            if legacy_plot:
                shop.step()
                people.step()
        dirty = true

func _process(delta: float) -> void:
    animation_time += delta
    if campaign:
        player = world.player_state()
        if player.get("active", false):
            walk_clock += delta
            # Framed a little above the player, so the ground sits low and the factory hall fills the view (art.md).
            var target := Vector2(player.x + player.width / 2.0, player.y + player.height / 2.0 - get_viewport_rect().size.y / camera.zoom.y * FRAME_LIFT)
            camera.position = camera.position.lerp(target, 1.0 - exp(-delta * 8.0))
            _clamp_camera()
            if player.event == "respawn":
                _notice("You blacked out and woke up back at home.")
    liquid_material.set_shader_parameter("animation_time", animation_time)
    if campaign:
        _follow_sun()
    liquid_material.set_shader_parameter("view_origin", (camera.get_screen_center_position() - get_viewport_rect().size / camera.zoom / 2).floor())
    if dirty:
        _refresh_texture()
    var shake: float = world.stats().shake
    camera.offset = Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * shake * 0.6 if shake > 0.0 else Vector2.ZERO
    status_clock += delta
    if status_clock >= 0.25:
        status_clock = 0.0
        var stats := world.stats()
        status_label.text = "%s · %d fps · %d grains" % ["Paused" if paused else "Running", Engine.get_frames_per_second(), stats.grains]
        if campaign:
            hud.refresh(player, workshop.model.cash, shop.model.minute, shop.model.status(), _item_text(), paused)
            hud.set_orders(people.orders_text())
            hud.set_tip(_hover_tip() if not _pointer_over_ui() else "")
        if campaign and player.get("active", false):
            var delivery: String = shop.model.status()
            clock_label.text = "   %s%s" % [LogisticsModel.clock_text(shop.model.minute), "   ·   " + delivery if not delivery.is_empty() else ""]
            hud_label.text = "%.2f credits   ·   Health %d   ·   Breath %d   ·   %s   " % [workshop.model.cash, ceili(player.health), ceili(player.breath), "Removing" if removing and drawing else _item_name()]
            _refresh_kit()
        var cell := Vector2i((get_global_mouse_position() / CELL).floor())
        var sample: Dictionary = world.inspect(cell.x, cell.y)
        var label: String = _item_name() if campaign else TOOLS[selected][0]
        var hovered_equipment: int = world.equipment_at(cell.x, cell.y) if campaign else -1
        if not sample.is_empty() and not _pointer_over_ui() and animation_time >= notice_until:
            if hovered_equipment >= 0:
                inspector_label.text = kitchen.hover_text(hovered_equipment)
            elif sample.has("machine"):
                inspector_label.text = "%s · %.1f °C · %s · setting %s · liquid #%s · %s" % [label, sample.temperature, "active" if sample.active or sample.on or sample.open else "idle", sample.level if sample.machine != 14 else sample.period, sample.liquid, stats.message]
            elif sample.air:
                inspector_label.text = "%s · air %.1f °C · oxygen %.1f%% · CO₂ %.2f%% · %d burning · %s" % [label, sample.temperature, sample.oxygen, sample.co2, stats.burning, stats.message]
            else:
                inspector_label.text = "%s · %.1f °C%s · sugar %.2f · salt %.2f · stored water %.1f · %s" % [label, sample.temperature, " · burning" if sample.burning else "", sample.sugar, sample.salt, sample.stored_water, stats.message]

func _refresh_texture() -> void:
    if furniture != null:
        furniture.queue_redraw()
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
    var fire_image := Image.create_from_data(WIDTH, HEIGHT, false, Image.FORMAT_R8, world.fire_data())
    if fire_texture == null:
        fire_texture = ImageTexture.create_from_image(fire_image)
        liquid_material.set_shader_parameter("fire_data", fire_texture)
        liquid_material.set_shader_parameter("has_fire", true)
    else:
        fire_texture.update(fire_image)
    var back := world.back_data()
    var back_image := Image.create_from_data(WIDTH, HEIGHT, false, Image.FORMAT_R8, back)
    if back_texture == null:
        back_texture = ImageTexture.create_from_image(back_image)
        liquid_material.set_shader_parameter("back_data", back_texture)
        liquid_material.set_shader_parameter("has_back", true)
        sprite_material.set_shader_parameter("room_data", back_texture)
    if campaign and decor.refresh(pixels, back, WIDTH, HEIGHT):
        lighting.set_lamps(decor.lamps())
    else:
        back_texture.update(back_image)
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
    equipment_view = world.equipment_list() if campaign else []
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
    if campaign:
        _draw_campaign()
    elif not _pointer_over_ui():
        var center := (get_global_mouse_position() / CELL).floor() * CELL + Vector2.ONE * CELL / 2
        var fine: bool = TOOLS[selected][1] >= 101 and TOOLS[selected][1] <= 107
        draw_arc(get_global_mouse_position() if fine else center, radius * (4.0 if fine else CELL), 0, TAU, 48, Color(0.85, 0.96, 0.91, 0.65), 1.0 / camera.zoom.x)

# Sprite sheet frames: 0 idle, 1-4 walk, 5 jump, 6-7 climb. The 32 x 48 frame puts the 20 x 42 hitbox at (6, 6).
func _player_frame() -> int:
    if player.climbing:
        return 6 + (int(walk_clock * 6.0) % 2 if absf(player.vy) > 0.1 else 0)
    if not player.on_ground and not player.swimming:
        return 5
    if absf(player.vx) > 0.3:
        return 1 + int(walk_clock * 10.0) % 4
    return 0

func _draw_campaign() -> void:
    if legacy_plot:
        shop.draw_trucks(self, animation_time)
    kitchen.draw_equipment(self, equipment_view, animation_time)
    if legacy_plot:
        people.draw_people(self, animation_time)
    if room_mode:
        _draw_room_slots()
    if furnish_mode and not _pointer_over_ui():
        var piece := _furnish_piece()
        var spot: Rect2 = furniture.spot(piece.id, get_global_mouse_position())
        var why: String = furniture.refusal(piece.id, spot)
        if why.is_empty() and workshop.model.cash + 0.000001 < float(piece.cost):
            why = "not enough credits"
        if spot.size != Vector2.ZERO:
            furniture.draw_piece(self, piece.id, spot, Color(1, 1, 1, 0.6) if why.is_empty() else Color(1, 0.5, 0.45, 0.6))
    var pointer_cell := Vector2i((get_global_mouse_position() / CELL).floor())
    var inlet := int(world.stats().pending_inlet)
    if inlet >= 0:
        draw_line(Vector2(inlet % WIDTH, inlet / WIDTH) * CELL + Vector2(4, 4), get_global_mouse_position(), Color("87d2ec"), 1.0 / camera.zoom.x)
    if not _pointer_over_ui() and (kit_mode or kitchen.carrying >= 0) and world.equipment_at(pointer_cell.x, pointer_cell.y) < 0:
        var kind: String = kit_items[kit_selected].id
        if kitchen.carrying >= 0:
            kind = String(world.equipment_info(kitchen.carrying).get("kind", kind))
        var spot: Rect2 = kitchen.footprint(kind, pointer_cell)
        var fits: bool = _in_reach(_tile_at(pointer_cell)) and (kitchen.carrying >= 0 or kitchen.can_place(kind))
        var shade := Color(0.55, 0.95, 0.65) if fits else Color(1.0, 0.45, 0.4)
        draw_rect(spot, Color(shade, 0.18))
        draw_rect(spot, Color(shade, 0.8), false, 1.0 / camera.zoom.x)
    elif not _pointer_over_ui() and not kit_mode and not build_items.is_empty() and world.equipment_at(pointer_cell.x, pointer_cell.y) < 0:
        var tile := _tile_at(pointer_cell)
        var item: Dictionary = build_items[build_selected]
        var rect := Rect2(Vector2(tile) * CELL, Vector2(2, 2) * CELL)
        if item.get("cell", false) or (removing and not _fitting_at(pointer_cell).is_empty()):
            rect = Rect2(Vector2(pointer_cell) * CELL, Vector2.ONE * CELL)
        elif int(item.code) == DOOR_CODE and not removing:
            rect = Rect2(Vector2(tile.x, tile.y - 4) * CELL, Vector2(2, 6) * CELL)
        var ok: bool = _in_reach(tile) and (removing or workshop.model.cash + 0.000001 >= float(item.cost))
        var tint := Color(0.55, 0.95, 0.65) if ok else Color(1.0, 0.45, 0.4)
        draw_rect(rect, Color(tint, 0.18))
        draw_rect(rect, Color(tint, 0.8), false, 1.0 / camera.zoom.x)
    if player.get("active", false) and player_texture != null:
        var source := Rect2(_player_frame() * 32, 0, 32, 48)
        var origin := Vector2(player.x - 6, player.y - 6).round()
        if player.facing < 0:
            draw_set_transform(origin + Vector2(32, 0), 0.0, Vector2(-1, 1))
        else:
            draw_set_transform(origin, 0.0, Vector2.ONE)
        draw_texture_rect_region(player_texture, Rect2(0, 0, 32, 48), source, Color(1, 1, 1, 0.85) if player.swimming else Color.WHITE)
        draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
