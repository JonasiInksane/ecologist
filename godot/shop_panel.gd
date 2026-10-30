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
var heading := Label.new()
var money := Label.new()
var supplier_pick := OptionButton.new()
var blurb := Label.new()
var item_pick := OptionButton.new()
var offer_text := Label.new()
var count := SpinBox.new()
var order_button: Button
var deliveries := Label.new()
var crates_text := Label.new()
var note := Label.new()

func setup(owner: Node) -> void:
    main = owner
    sheet = main._load_texture(VEHICLES)

func _ready() -> void:
    data = JSON.parse_string(FileAccess.get_file_as_string("res://data/shop.json"))
    model = Model.new(data, main.workshop.model, main.kit_items)
    custom_minimum_size.x = 420
    var style := StyleBoxFlat.new()
    style.bg_color = Color("13272d")
    style.set_content_margin_all(14)
    style.border_color = Color("365359")
    style.border_width_left = 1
    add_theme_stylebox_override("panel", style)
    var layout := VBoxContainer.new()
    layout.add_theme_constant_override("separation", 10)
    add_child(layout)
    var top := HBoxContainer.new()
    layout.add_child(top)
    heading.text = "Laptop · shop"
    heading.add_theme_font_size_override("font_size", 20)
    heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    top.add_child(heading)
    top.add_child(_button("Close · Esc", close))
    for label in [money, blurb, offer_text, deliveries, crates_text, note]:
        label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
        label.add_theme_color_override("font_color", Color("cfe3dc"))
    money.add_theme_color_override("font_color", Color("8cb8aa"))
    blurb.add_theme_color_override("font_color", Color("afc3c9"))
    note.add_theme_color_override("font_color", Color("e7c77b"))
    layout.add_child(money)
    for entry in data.suppliers:
        supplier_ids.append(entry.id)
        supplier_pick.add_item(entry.name)
    supplier_pick.item_selected.connect(func(_index): _fill_items())
    layout.add_child(supplier_pick)
    layout.add_child(blurb)
    item_pick.item_selected.connect(func(_index): _fill_offer())
    layout.add_child(item_pick)
    layout.add_child(offer_text)
    var buy_row := HBoxContainer.new()
    count.min_value = 1
    count.max_value = 1
    count.value = 1
    count.value_changed.connect(func(_value): _fill_offer())
    buy_row.add_child(count)
    order_button = _button("Order", _order)
    buy_row.add_child(order_button)
    layout.add_child(buy_row)
    layout.add_child(_text("DELIVERIES"))
    layout.add_child(deliveries)
    layout.add_child(_text("CRATES"))
    layout.add_child(crates_text)
    layout.add_child(note)
    _fill_items()
    hide()

func _text(value: String) -> Label:
    var label := Label.new()
    label.text = value
    label.add_theme_color_override("font_color", Color("afc3c9"))
    label.add_theme_font_size_override("font_size", 13)
    return label

func _button(value: String, action: Callable) -> Button:
    var button := Button.new()
    button.text = value
    button.focus_mode = Control.FOCUS_NONE
    button.pressed.connect(action)
    return button

func world() -> EcologistWorld:
    return main.campaign_world

func supplier_id() -> String:
    return supplier_ids[maxi(0, supplier_pick.selected)]

func _fill_items() -> void:
    var entry := model.supplier(supplier_id())
    blurb.text = entry.blurb
    item_pick.clear()
    for item in entry.items:
        item_pick.add_item("%s · %s · %.2f" % [model.item_name(item), item.unit, model.price(item)])
    item_pick.select(0)
    _fill_offer()

func _fill_offer() -> void:
    var entry := model.supplier(supplier_id())
    var item := model.offer(supplier_id(), maxi(0, item_pick.selected))
    if item.is_empty():
        return
    count.min_value = int(item.get("min", 1))
    count.max_value = int(item.get("max", 1))
    var hours := float(entry.lead_minutes) / 60.0
    offer_text.text = "%s · %.2f credits each · arrives in %s h by %s%s" % [item.unit, model.price(item),
        str(snappedf(hours, 0.1)).trim_suffix(".0"), item.vehicle,
        " · needs a fill coupling by the road" if item.vehicle == "tanker" else ""]
    order_button.text = "Order · %.2f" % (model.price(item) * int(count.value))

func _order() -> void:
    model.order(supplier_id(), maxi(0, item_pick.selected), int(count.value))
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
    money.text = "%s   ·   %.2f credits" % [Model.clock_text(model.minute), model.workshop.cash]
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
    crates_text.text = ", ".join(crates) + ". Place them from the kitchen kit (K)." if not crates.is_empty() else "None waiting."
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
