extends PanelContainer
# The laptop shop (M2): orders from the suppliers, the deliveries on their way and the crates waiting to be placed.
# It owns the LogisticsModel, steps it with the campaign, connects a tanker at the curb to the fill coupling there,
# and draws the trucks on the road. main.gd owns the world and passes itself in.

const Model = preload("res://core/logistics.gd")
const SAVE_PATH := "user://logistics-v1.json"
const VEHICLES := "res://art/vehicles.png"
const CELL := 8.0
const DRIVE_MINUTES := 3.0

var main: Node
var model: LogisticsModel
var data: Dictionary = {}
var save_path := SAVE_PATH
var sheet: Texture2D
var hooked := -1
var clock := 0.0
var supplier_ids: Array[String] = []
var supplier_index := 0
var item_index := 0
var supplier_buttons: Array[Button] = []
var item_buttons: Array[Button] = []
var money := UiStyle.label("", "WebLabel")
var supplier_name := UiStyle.label("", "WebLabel", 26)
var blurb := UiStyle.label("", "WebMuted")
var lead := UiStyle.label("", "WebMuted")
var item_list := VBoxContainer.new()
var count := SpinBox.new()
var total := UiStyle.label("", "WebLabel")
var order_button: Button
var deliveries := UiStyle.label("", "WebLabel")
var crates_text := UiStyle.label("", "WebLabel")
var note := UiStyle.label("", "WebMuted")

func setup(owner: Node) -> void:
    main = owner
    sheet = main._load_texture(VEHICLES)

# The shop is a web page on the laptop's screen: Bulkr, a marketplace for bulk goods, with the suppliers down the
# left, their goods as cards in the middle and your orders on the right.
func _ready() -> void:
    data = JSON.parse_string(FileAccess.get_file_as_string("res://data/shop.json"))
    model = Model.new(data, main.workshop.model, main.kit_items)
    theme_type_variation = "Bezel"
    set_anchors_and_offsets_preset(Control.PRESET_CENTER)
    grow_horizontal = Control.GROW_DIRECTION_BOTH
    grow_vertical = Control.GROW_DIRECTION_BOTH
    custom_minimum_size = Vector2(940, 560)
    mouse_filter = Control.MOUSE_FILTER_STOP
    var page := PanelContainer.new()
    page.theme_type_variation = "WebPanel"
    add_child(page)
    var layout := VBoxContainer.new()
    layout.add_theme_constant_override("separation", 8)
    page.add_child(layout)
    var top := HBoxContainer.new()
    top.add_theme_constant_override("separation", 12)
    layout.add_child(top)
    top.add_child(UiStyle.label("Bulkr", "WebTitle"))
    var tagline := UiStyle.label("bulk goods to your curb · no questions, some answers", "WebMuted")
    tagline.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    tagline.size_flags_vertical = Control.SIZE_SHRINK_END
    top.add_child(tagline)
    money.size_flags_vertical = Control.SIZE_SHRINK_CENTER
    top.add_child(money)
    var close_button := _button("", close)
    close_button.theme_type_variation = "WebButton"
    close_button.icon = UiStyle.icon("close")
    close_button.tooltip_text = "Close · Esc"
    top.add_child(close_button)
    layout.add_child(_rule())
    var body := HBoxContainer.new()
    body.add_theme_constant_override("separation", 14)
    body.size_flags_vertical = Control.SIZE_EXPAND_FILL
    layout.add_child(body)
    var nav := VBoxContainer.new()
    nav.custom_minimum_size.x = 170
    nav.add_theme_constant_override("separation", 4)
    body.add_child(nav)
    nav.add_child(UiStyle.label("SUPPLIERS", "WebMuted"))
    for i in data.suppliers.size():
        var entry: Dictionary = data.suppliers[i]
        supplier_ids.append(entry.id)
        var button := _button(entry.short, select_supplier.bind(i))
        button.theme_type_variation = "WebButton"
        button.toggle_mode = true
        button.alignment = HORIZONTAL_ALIGNMENT_LEFT
        supplier_buttons.append(button)
        nav.add_child(button)
    var center := VBoxContainer.new()
    center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    center.add_theme_constant_override("separation", 6)
    body.add_child(center)
    center.add_child(supplier_name)
    for label in [blurb, deliveries, crates_text, note]:
        label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    center.add_child(blurb)
    center.add_child(lead)
    item_list.add_theme_constant_override("separation", 6)
    center.add_child(item_list)
    var spacer := Control.new()
    spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
    center.add_child(spacer)
    var buy_row := HBoxContainer.new()
    buy_row.add_theme_constant_override("separation", 10)
    buy_row.add_child(UiStyle.label("Quantity", "WebMuted"))
    count.min_value = 1
    count.max_value = 1
    count.value = 1
    count.custom_minimum_size.x = 96
    count.value_changed.connect(func(_value): _fill_offer())
    buy_row.add_child(count)
    total.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    total.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
    buy_row.add_child(total)
    order_button = _button("Order", _order)
    order_button.theme_type_variation = "WebButton"
    buy_row.add_child(order_button)
    center.add_child(buy_row)
    var side := PanelContainer.new()
    side.theme_type_variation = "WebCard"
    side.custom_minimum_size.x = 250
    body.add_child(side)
    var orders := VBoxContainer.new()
    orders.add_theme_constant_override("separation", 4)
    side.add_child(orders)
    orders.add_child(UiStyle.label("ON THE WAY", "WebMuted"))
    orders.add_child(deliveries)
    orders.add_child(_rule())
    orders.add_child(UiStyle.label("IN THE YARD", "WebMuted"))
    orders.add_child(crates_text)
    layout.add_child(_rule())
    layout.add_child(note)
    select_supplier(0)
    hide()

func _rule() -> HSeparator:
    var rule := HSeparator.new()
    var line := StyleBoxLine.new()
    line.color = Color("c4beb0")
    line.thickness = 2
    rule.add_theme_stylebox_override("separator", line)
    return rule

func _button(value: String, action: Callable) -> Button:
    var button := Button.new()
    button.text = value
    button.focus_mode = Control.FOCUS_NONE
    button.pressed.connect(action)
    return button

func world() -> EcologistWorld:
    return main.campaign_world

func supplier_id() -> String:
    return supplier_ids[supplier_index]

# A sack for dry goods, a drop for sea water, and the piece itself for crated equipment.
func _picture(item: Dictionary) -> Texture2D:
    if item.kind == "crate":
        return UiStyle.sprite(main.kitchen.SPRITES, main.kitchen.items[item.id].sprite)
    return UiStyle.icon({"sugar_beet": "beet", "sea_water": "drop"}.get(item.id, "sack"))

func _card(item: Dictionary, index: int) -> Button:
    var card := Button.new()
    card.theme_type_variation = "WebItem"
    card.toggle_mode = true
    card.focus_mode = Control.FOCUS_NONE
    card.custom_minimum_size.y = 52
    card.pressed.connect(select_item.bind(index))
    var row := HBoxContainer.new()
    row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    row.offset_left = 10
    row.offset_right = -12
    row.add_theme_constant_override("separation", 10)
    row.mouse_filter = Control.MOUSE_FILTER_IGNORE
    card.add_child(row)
    row.add_child(UiStyle.icon_rect(_picture(item), 36))
    var title := UiStyle.label("%s · %s" % [model.item_name(item), item.unit], "WebLabel")
    title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
    row.add_child(title)
    var cost := UiStyle.label("%.2f cr" % model.price(item), "WebLabel")
    cost.size_flags_vertical = Control.SIZE_SHRINK_CENTER
    row.add_child(cost)
    return card

func select_supplier(index: int) -> void:
    supplier_index = clampi(index, 0, supplier_ids.size() - 1)
    for i in supplier_buttons.size():
        supplier_buttons[i].set_pressed_no_signal(i == supplier_index)
    var entry := model.supplier(supplier_id())
    supplier_name.text = entry.name
    blurb.text = entry.blurb
    lead.text = "Delivers in %s h" % str(snappedf(float(entry.lead_minutes) / 60.0, 0.1)).trim_suffix(".0")
    for child in item_list.get_children():
        child.queue_free()
    item_buttons.clear()
    for i in entry.items.size():
        var card := _card(entry.items[i], i)
        item_buttons.append(card)
        item_list.add_child(card)
    select_item(0)

func select_item(index: int) -> void:
    item_index = clampi(index, 0, item_buttons.size() - 1)
    for i in item_buttons.size():
        item_buttons[i].set_pressed_no_signal(i == item_index)
    var item := model.offer(supplier_id(), item_index)
    count.min_value = int(item.get("min", 1))
    count.max_value = int(item.get("max", 1))
    count.value = clampi(int(count.value), int(count.min_value), int(count.max_value))
    _fill_offer()

func _fill_offer() -> void:
    var item := model.offer(supplier_id(), item_index)
    if item.is_empty():
        return
    total.text = "%s · %.2f cr" % ["by tanker · needs a fill coupling by the road" if item.vehicle == "tanker" else "by van", model.price(item) * int(count.value)]
    order_button.text = "Order"
    order_button.disabled = model.workshop.cash + 0.000001 < model.price(item) * int(count.value)

func _order() -> void:
    model.order(supplier_id(), item_index, int(count.value))
    _say(model.message)
    refresh()

func _say(text: String) -> void:
    note.text = text
    main._notice(text)

func open() -> void:
    note.text = model.message
    show()
    main.workshop.hide()
    main.kitchen.close()
    refresh()

func close() -> void:
    hide()

func _process(delta: float) -> void:
    if not visible:
        return
    clock += delta
    if clock >= 0.25:
        clock = 0.0
        refresh()

func refresh() -> void:
    money.text = "%s   ·   %.2f cr" % [Model.clock_text(model.minute), model.workshop.cash]
    var lines: Array[String] = []
    var status := model.status()
    if not model.truck.is_empty():
        lines.append(status)
    for entry in model.orders:
        var item := model.offer(entry.supplier, int(entry.index))
        var due := Model.clock_text(entry.due)
        if due.get_slice(" · ", 0) == Model.clock_text(model.minute).get_slice(" · ", 0):
            due = due.get_slice(" · ", 1)
        lines.append("%s · %s · due %s" % [model.supplier(entry.supplier).short, model.describe(item, int(entry.count)), due])
    deliveries.text = "\n".join(lines) if not lines.is_empty() else "Nothing on the way."
    var crates: Array[String] = []
    for id in model.crates:
        crates.append("%s × %d" % [main.kitchen.name_of(id), int(model.crates[id])])
    crates_text.text = "\n".join(crates) + "\nPlace them from the kitchen kit (K)." if not crates.is_empty() else "No crates waiting."
    _fill_offer()

# One campaign tick: the clock, arrivals, and a tanker pumping into the coupling nearest the road.
func step() -> void:
    var said := model.said
    model.step(1)
    var pumping := -1
    if model.tanker_here():
        pumping = coupling()
        var added := 0.0
        if pumping >= 0:
            var info: Dictionary = world().equipment_info(pumping)
            var grams := minf(model.tanker_want(), float(info.capacity) - float(info.mass))
            if grams > 1.0 and world().vessel_add(pumping, "sea_water", grams, float(data.tanker_temperature)).is_empty():
                added = grams
        model.tanker_report(pumping >= 0, added)
        if not model.tanker_here():
            pumping = -1
    if model.said != said:
        note.text = model.message
        main._notice(model.message)
    # Only the coupling the tanker is hooked to pushes; every other one is a plain fitting.
    if pumping != hooked or pumping >= 0:
        for info in world().equipment_list():
            if info.kind == "coupling" and int(info.setting) != (1 if int(info.id) == pumping else 0):
                world().equipment_set(int(info.id), 1 if int(info.id) == pumping else 0)
        hooked = pumping

func coupling() -> int:
    var best := -1
    var best_x := -1
    for info in world().equipment_list():
        if info.kind == "coupling" and int(info.x) >= int(data.curb_x) and int(info.x) > best_x:
            best = int(info.id)
            best_x = int(info.x)
    return best

# Unhooks every coupling, for a new or loaded game; the next step hooks the tanker up again if one is waiting.
func release() -> void:
    for info in world().equipment_list():
        if info.kind == "coupling" and int(info.setting) != 0:
            world().equipment_set(int(info.id), 0)
    hooked = -1

func _vehicle_rect(vehicle: String, drive: float) -> Rect2:
    var spec: Dictionary = data.vehicles[vehicle]
    var x := float(data.park_x) + drive * drive * (float(main.WIDTH) - float(data.park_x))
    return Rect2(Vector2(x, float(data.road_row) - float(spec.height)) * CELL, Vector2(spec.width, spec.height) * CELL)

func _drive(arrived: float) -> float:
    return clampf((arrived + DRIVE_MINUTES - model.minute) / DRIVE_MINUTES, 0.0, 1.0)

func truck_rect() -> Rect2:
    if model.truck.is_empty() or _drive(float(model.truck.arrived)) > 0.0:
        return Rect2()
    return _vehicle_rect(model.truck.vehicle, 0.0)

func truck_at(cell: Vector2i) -> bool:
    var rect := truck_rect()
    return rect.has_area() and rect.has_point(Vector2(cell) * CELL + Vector2.ONE * CELL / 2)

# Clicking the truck: a van is unloaded when the player stands near it; a tanker reports how it is doing.
func click_truck() -> void:
    var rect := truck_rect()
    var center := Vector2(main.player.x + main.player.width / 2.0, main.player.y + main.player.height / 2.0)
    var nearest := Vector2(clampf(center.x, rect.position.x, rect.end.x), clampf(center.y, rect.position.y, rect.end.y))
    if not main.player.get("active", false) or center.distance_to(nearest) > main.build_reach * 2 * CELL:
        main._notice("Walk over to the truck first.")
    elif model.tanker_here():
        main._notice(model.status() + (" · pumping into the coupling" if hooked >= 0 else " · waiting for a fill coupling by the road"))
    else:
        model.unload()
        main._notice(model.message)
        refresh()

func draw_trucks(canvas: CanvasItem, time: float) -> void:
    if not model.truck.is_empty():
        var drive := _drive(float(model.truck.arrived))
        var rect := _vehicle_rect(model.truck.vehicle, drive)
        _draw_vehicle(canvas, model.truck.vehicle, rect, time, drive > 0.0)
        if hooked >= 0 and drive == 0.0:
            var info: Dictionary = world().equipment_info(hooked)
            if not info.is_empty():
                var from := rect.position + Vector2(34, rect.size.y - 18)
                var to := Vector2(float(info.x) + float(info.width), float(info.y) + 1.0) * CELL
                var sag := Vector2((from.x + to.x) / 2.0, maxf(from.y, to.y) + 10.0)
                var hose := PackedVector2Array()
                for i in 13:
                    var t := float(i) / 12.0
                    hose.append(from.lerp(sag, t).lerp(sag.lerp(to, t), t))
                canvas.draw_polyline(hose, Color("1c1f22"), 3.0)
    if not model.departed.is_empty():
        var leaving := (model.minute - float(model.departed.at)) / DRIVE_MINUTES
        if leaving < 1.0:
            _draw_vehicle(canvas, model.departed.vehicle, _vehicle_rect(model.departed.vehicle, leaving), time, true)

func _draw_vehicle(canvas: CanvasItem, vehicle: String, rect: Rect2, time: float, moving: bool) -> void:
    var spec: Dictionary = data.vehicles[vehicle]
    var bounce := Vector2(0, round(sin(time * 30.0)) * 0.5) if moving else Vector2.ZERO
    if sheet != null:
        var region: Array = spec.sprite
        canvas.draw_texture_rect_region(sheet, Rect2(rect.position + bounce, rect.size), Rect2(region[0], region[1], region[2], region[3]))
    else:
        canvas.draw_rect(Rect2(rect.position + bounce, rect.size), Color("d8dde0"))

func save() -> String:
    var file := FileAccess.open(save_path + ".tmp", FileAccess.WRITE)
    if file == null:
        return "could not write the delivery save"
    file.store_string(JSON.stringify(model.snapshot(), "  ", true, true))
    file.close()
    return "" if DirAccess.rename_absolute(ProjectSettings.globalize_path(save_path + ".tmp"), ProjectSettings.globalize_path(save_path)) == OK else "could not replace the delivery save"

func load_save() -> String:
    release()
    if not FileAccess.file_exists(save_path):
        return "no delivery save"
    var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(save_path))
    if not parsed is Dictionary or not model.restore(parsed):
        return model.message if parsed is Dictionary else "could not read the delivery save"
    refresh()
    return ""
