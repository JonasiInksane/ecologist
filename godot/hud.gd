extends Control
# The campaign HUD: credits, hearts and breath top left; the clock and the next delivery top right with the stock
# and menu buttons; the hotbar at the bottom for building and the kitchen kit; toasts above it; a tooltip at the
# pointer; and the pause menu. main.gd owns the game state and passes itself in; this only shows it.

const SLOT := Vector2(56, 56)
const TOAST_SECONDS := 3.0

const HEARTS := 5

var main: Node
var hearts: Array = []
var breath := ProgressBar.new()
var breath_row := HBoxContainer.new()
var cash := UiStyle.label("", "HudLabel")
var clock_icon: TextureRect
var clock := UiStyle.label("", "HudLabel")
var delivery := UiStyle.label("", "HudLabel")
var delivery_row := HBoxContainer.new()
var orders := UiStyle.label("", "HudLabel")
var orders_row := HBoxContainer.new()
var bar := VBoxContainer.new()
var item_label := UiStyle.label("", "HudLabel")
var build_tab: Button
var kit_tab: Button
var slots := {"build": [], "kit": []}
var counts := {"build": [], "kit": []}
var toast_panel := PanelContainer.new()
var toast_label := UiStyle.label("")
var toast_left := 0.0
var tip := PanelContainer.new()
var tip_label := UiStyle.label("")
var paused_label := UiStyle.label("PAUSED", "Title")
var menu := PanelContainer.new()
var shade := ColorRect.new()
var menu_paused := false

func setup(owner: Node) -> void:
    main = owner
    set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    mouse_filter = Control.MOUSE_FILTER_IGNORE
    _build_status()
    _build_clock()
    _build_hotbar()
    _build_toast()
    _build_menu()

func _panel(variation := "Toast") -> PanelContainer:
    var panel := PanelContainer.new()
    panel.theme_type_variation = variation
    return panel

func _bar(progress: ProgressBar, fill: String) -> void:
    progress.custom_minimum_size = Vector2(110, 18)
    progress.max_value = 100
    progress.show_percentage = false
    progress.add_theme_stylebox_override("fill", UiStyle.bar(fill))
    progress.size_flags_vertical = Control.SIZE_SHRINK_CENTER
    progress.mouse_filter = Control.MOUSE_FILTER_IGNORE

# Top left, straight on the picture as in the dusk workshop reference: the coin and credits, then five hearts (and
# the breath bar while under water).
func _build_status() -> void:
    var row := HBoxContainer.new()
    row.position = Vector2(16, 12)
    row.add_theme_constant_override("separation", 6)
    add_child(row)
    row.add_child(UiStyle.icon_rect(UiStyle.icon("coin"), 32))
    cash.custom_minimum_size.x = 104
    row.add_child(cash)
    var heart_row := HBoxContainer.new()
    heart_row.add_theme_constant_override("separation", 2)
    for i in HEARTS:
        var heart := UiStyle.icon_rect(UiStyle.icon("heart"), 32)
        hearts.append(heart)
        heart_row.add_child(heart)
    row.add_child(heart_row)
    breath_row.add_theme_constant_override("separation", 8)
    breath_row.add_child(UiStyle.icon_rect(UiStyle.icon("bubble"), 28))
    _bar(breath, "blue")
    breath_row.add_child(breath)
    row.add_child(breath_row)

func _icon_button(icon: String, tooltip: String, action: Callable) -> Button:
    var button := Button.new()
    button.icon = UiStyle.icon(icon)
    button.expand_icon = true
    button.custom_minimum_size = Vector2(48, 48)
    button.tooltip_text = tooltip
    button.focus_mode = Control.FOCUS_NONE
    button.pressed.connect(action)
    return button

func _build_clock() -> void:
    var corner := HBoxContainer.new()
    corner.add_theme_constant_override("separation", 6)
    corner.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
    corner.grow_horizontal = Control.GROW_DIRECTION_BEGIN
    corner.offset_top = 12
    corner.offset_right = -12
    add_child(corner)
    var column := VBoxContainer.new()
    column.add_theme_constant_override("separation", 0)
    column.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
    corner.add_child(column)
    var row := HBoxContainer.new()
    row.add_theme_constant_override("separation", 8)
    clock_icon = UiStyle.icon_rect(UiStyle.icon("sun"), 28)
    row.add_child(clock_icon)
    row.add_child(clock)
    column.add_child(row)
    delivery_row.add_theme_constant_override("separation", 8)
    delivery_row.add_child(UiStyle.icon_rect(UiStyle.icon("truck"), 28))
    delivery_row.add_child(delivery)
    column.add_child(delivery_row)
    orders_row.add_theme_constant_override("separation", 8)
    orders_row.add_child(UiStyle.icon_rect(UiStyle.icon("person"), 28))
    orders_row.add_child(orders)
    orders_row.tooltip_text = "Customers coming back for what you promised"
    orders_row.hide()
    column.add_child(orders_row)
    var buttons := VBoxContainer.new()
    corner.add_child(buttons)
    buttons.add_child(_icon_button("crate", "Stock and sales", main._toggle_workshop))
    buttons.add_child(_icon_button("gear", "Menu · Esc", toggle_menu))

func _slot(texture: Texture2D, key: String, mode: String, index: int) -> Button:
    var button := Button.new()
    button.theme_type_variation = "Slot"
    button.custom_minimum_size = SLOT
    button.focus_mode = Control.FOCUS_NONE
    var picture := UiStyle.icon_rect(texture, 36)
    picture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    for side in [SIDE_LEFT, SIDE_TOP]:
        picture.set_offset(side, 10)
    for side in [SIDE_RIGHT, SIDE_BOTTOM]:
        picture.set_offset(side, -10)
    button.add_child(picture)
    # the key under the slot, as on the reference's hotbar
    var number := UiStyle.label(key, "HudLabel")
    number.position = Vector2(SLOT.x / 2.0 - 5.0, SLOT.y - 2.0)
    button.add_child(number)
    var count := UiStyle.label("", "HudLabel")
    count.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
    count.grow_horizontal = Control.GROW_DIRECTION_BEGIN
    count.grow_vertical = Control.GROW_DIRECTION_BEGIN
    count.offset_right = -5
    count.offset_bottom = 2
    count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
    button.add_child(count)
    button.pressed.connect(main._select_build.bind(index) if mode == "build" else main._select_kit.bind(index))
    slots[mode].append(button)
    counts[mode].append(count)
    return button

func _build_hotbar() -> void:
    bar.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
    bar.grow_horizontal = Control.GROW_DIRECTION_BOTH
    bar.grow_vertical = Control.GROW_DIRECTION_BEGIN
    bar.offset_bottom = -30
    bar.alignment = BoxContainer.ALIGNMENT_END
    add_child(bar)
    item_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    bar.add_child(item_label)
    var row := HBoxContainer.new()
    row.add_theme_constant_override("separation", 6)
    bar.add_child(row)
    var tabs := VBoxContainer.new()
    tabs.add_theme_constant_override("separation", 2)
    build_tab = _icon_button("hammer", "Building · K", main._set_kit_mode.bind(false))
    kit_tab = _icon_button("pot", "Kitchen kit · K", main._set_kit_mode.bind(true))
    for tab in [build_tab, kit_tab]:
        tab.theme_type_variation = "Slot"
        tab.custom_minimum_size = Vector2(34, 27)
        tab.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
        tabs.add_child(tab)
    row.add_child(tabs)
    for i in main.build_items.size():
        var item: Dictionary = main.build_items[i]
        row.add_child(_slot(UiStyle.icon(String(item.get("icon", item.id))), str((i + 1) % 10) if i < 10 else "", "build", i))
        counts.build[i].text = str(int(item.cost))
    for i in main.kit_items.size():
        var item: Dictionary = main.kit_items[i]
        row.add_child(_slot(UiStyle.sprite(main.kitchen.SPRITES, item.sprite), str((i + 1) % 10) if i < 10 else "", "kit", i))
        counts.kit[i].text = str(int(item.cost))

func _build_toast() -> void:
    toast_panel.theme_type_variation = "Toast"
    toast_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
    toast_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
    toast_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
    toast_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
    toast_panel.offset_bottom = -124
    # The toast and the tooltip draw over the windows; the HUD itself sits behind them.
    toast_panel.z_index = 5
    tip.z_index = 10
    toast_label.autowrap_mode = TextServer.AUTOWRAP_OFF
    toast_panel.add_child(toast_label)
    toast_panel.hide()
    add_child(toast_panel)
    tip.theme_type_variation = "Toast"
    tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
    tip.add_child(tip_label)
    tip.hide()
    add_child(tip)
    paused_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
    paused_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
    paused_label.offset_top = 16
    paused_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.75))
    paused_label.add_theme_constant_override("shadow_offset_x", 2)
    paused_label.add_theme_constant_override("shadow_offset_y", 2)
    paused_label.hide()
    add_child(paused_label)

func _menu_button(text: String, action: Callable) -> Button:
    var button := Button.new()
    button.text = text
    button.focus_mode = Control.FOCUS_NONE
    button.pressed.connect(action)
    return button

func _build_menu() -> void:
    shade.color = Color(0.03, 0.05, 0.07, 0.55)
    shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    shade.mouse_filter = Control.MOUSE_FILTER_STOP
    shade.hide()
    add_child(shade)
    menu.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
    menu.grow_horizontal = Control.GROW_DIRECTION_BOTH
    menu.grow_vertical = Control.GROW_DIRECTION_BOTH
    menu.custom_minimum_size.x = 380
    add_child(menu)
    var column := VBoxContainer.new()
    column.add_theme_constant_override("separation", 8)
    menu.add_child(column)
    var title := UiStyle.label("Paused", "Title")
    title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    column.add_child(title)
    column.add_child(_menu_button("Back to work · Esc", toggle_menu))
    column.add_child(_menu_button("Save · F5", func(): main._save_world()))
    column.add_child(_menu_button("Load · F9", func(): main._load_world(); close_menu()))
    column.add_child(_menu_button("Stock and sales", func(): close_menu(); main._toggle_workshop()))
    column.add_child(_menu_button("Sandbox · Tab", func(): close_menu(); main._set_mode(false)))
    var help := UiStyle.label("Walk A D · jump Space · climb W S\nUse E or click · build left click\nRemove right click · kit K · pause P", "Muted")
    help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    column.add_child(help)
    menu.hide()

func toggle_menu() -> void:
    if menu.visible:
        close_menu()
    else:
        menu_paused = not main.paused
        if menu_paused:
            main._toggle_pause()
        main.kitchen.close()
        main.shop.close()
        main.people.close()
        main.workshop.hide()
        shade.show()
        menu.show()

func close_menu() -> void:
    if not menu.visible:
        return
    menu.hide()
    shade.hide()
    if menu_paused and main.paused:
        main._toggle_pause()
    menu_paused = false

func toast(text: String) -> void:
    toast_label.text = text
    toast_left = TOAST_SECONDS
    toast_panel.modulate.a = 1.0
    toast_panel.show()
    toast_panel.reset_size()

func set_tip(text: String) -> void:
    tip_label.text = text
    tip.visible = not text.is_empty()
    if tip.visible:
        tip.reset_size()

# The selected slot is framed in amber; the tab shows which bar is up.
func highlight(kit: bool, build_selected: int, kit_selected: int) -> void:
    for i in slots.build.size():
        slots.build[i].theme_type_variation = "SlotSelected" if i == build_selected else "Slot"
        slots.build[i].visible = not kit
    for i in slots.kit.size():
        slots.kit[i].theme_type_variation = "SlotSelected" if i == kit_selected else "Slot"
        slots.kit[i].visible = kit
    build_tab.theme_type_variation = "Slot" if kit else "SlotSelected"
    kit_tab.theme_type_variation = "SlotSelected" if kit else "Slot"

# A crated piece with no crate in the yard is greyed out on the hotbar.
func set_count(index: int, crates: int) -> void:
    counts.kit[index].text = "×%d" % crates
    slots.kit[index].modulate = Color.WHITE if crates > 0 else Color(1, 1, 1, 0.5)

func refresh(player: Dictionary, credits: float, minute: float, status: String, item: String, paused: bool) -> void:
    var health := float(player.get("health", 100.0))
    var per := 100.0 / HEARTS
    for i in HEARTS:
        var left := health - i * per
        hearts[i].texture = UiStyle.icon("heart" if left >= per * 0.75 else "heart_half" if left >= per * 0.25 else "heart_empty")
    breath.value = float(player.get("breath", 100.0))
    breath_row.visible = breath.value < 99.5
    cash.text = "%.2f" % credits
    clock.text = LogisticsModel.clock_text(minute)
    var hour := fmod(minute, 1440.0) / 60.0
    clock_icon.texture = UiStyle.icon("sun" if hour >= 6.0 and hour < 20.0 else "moon")
    delivery.text = status
    delivery_row.visible = not status.is_empty()
    item_label.text = item
    paused_label.visible = paused and not menu.visible

# Promised orders, under the next delivery.
func set_orders(text: String) -> void:
    orders.text = text
    orders_row.visible = not text.is_empty()

func _process(delta: float) -> void:
    if toast_left > 0.0:
        toast_left -= delta
        toast_panel.modulate.a = clampf(toast_left / 0.5, 0.0, 1.0)
        if toast_left <= 0.0:
            toast_panel.hide()
    if tip.visible:
        var at := get_viewport().get_mouse_position() + Vector2(18, 18)
        var room := get_viewport_rect().size - tip.size - Vector2(4, 4)
        tip.position = Vector2(minf(at.x, room.x), minf(at.y, room.y))
