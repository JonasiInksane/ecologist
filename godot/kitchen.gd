extends PanelContainer
# The kitchen panel (M1): one piece of equipment at a time, with its stove knob, readings and actions. main.gd owns
# the world and the player and passes itself in; this panel only calls the world's equipment methods and the
# workshop's stock and cash. It also draws the equipment and bills the gas the stoves burn.

const SPRITES := "res://art/equipment.png"
const CELL := 8.0
# The clear inside of each vessel sprite, where the contents are painted (pixels from the sprite's corner).
const INSIDE := {"saucepan": Rect2(2, 3, 12, 11), "candy_mold": Rect2(1, 1, 14, 5), "salt_pan": Rect2(1, 1, 30, 5)}
const FLAMES := ["Off", "Low", "Medium", "High"]

var main: Node
var data: Dictionary = {}
var items: Dictionary = {}
var current := -1
var carrying := -1
var billed_joules := 0.0
var sheet: Texture2D
var clock := 0.0
var title := Label.new()
var place_text := Label.new()
var readings := Label.new()
var contents_text := Label.new()
var flame_row := HBoxContainer.new()
var flame_buttons: Array[Button] = []
var add_row := HBoxContainer.new()
var ingredient := OptionButton.new()
var grams := SpinBox.new()
var pour_row := HBoxContainer.new()
var pour_target := OptionButton.new()
var pour_ids: Array[int] = []
var vessel_actions := HBoxContainer.new()
var tool_row := HBoxContainer.new()
var note := Label.new()

func setup(owner: Node) -> void:
    main = owner
    sheet = main._load_texture(SPRITES)

func _ready() -> void:
    data = JSON.parse_string(FileAccess.get_file_as_string("res://data/equipment.json"))
    for item in data.items:
        items[item.id] = item
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
    var heading := HBoxContainer.new()
    layout.add_child(heading)
    title.add_theme_font_size_override("font_size", 20)
    title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    heading.add_child(title)
    heading.add_child(_button("Close · Esc", close))
    for label in [place_text, readings, contents_text, note]:
        label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
        label.add_theme_color_override("font_color", Color("cfe3dc"))
    place_text.add_theme_color_override("font_color", Color("8cb8aa"))
    note.add_theme_color_override("font_color", Color("e7c77b"))
    layout.add_child(place_text)
    layout.add_child(readings)
    layout.add_child(contents_text)
    flame_row.add_child(_text("Flame"))
    for level in FLAMES.size():
        var button := _button(FLAMES[level], _set_flame.bind(level))
        flame_buttons.append(button)
        flame_row.add_child(button)
    layout.add_child(flame_row)
    for entry in data.ingredients:
        ingredient.add_item(entry.name)
    grams.min_value = 10
    grams.max_value = 2500
    grams.step = 10
    grams.value = 100
    grams.suffix = "g"
    add_row.add_child(ingredient)
    add_row.add_child(grams)
    add_row.add_child(_button("Add", _add))
    layout.add_child(add_row)
    pour_row.add_child(_text("Pour into"))
    pour_target.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    pour_row.add_child(pour_target)
    pour_row.add_child(_button("Pour", _pour))
    layout.add_child(pour_row)
    vessel_actions.add_child(_button("Collect", _collect))
    vessel_actions.add_child(_button("Drain liquid", _drain))
    vessel_actions.add_child(_button("Tip out", _tip))
    layout.add_child(vessel_actions)
    var piece_actions := HBoxContainer.new()
    piece_actions.add_child(_button("Move", _move))
    piece_actions.add_child(_button("Pick up", _pick_up))
    layout.add_child(piece_actions)
    layout.add_child(tool_row)
    layout.add_child(note)
    hide()

func _text(value: String) -> Label:
    var label := Label.new()
    label.text = value
    label.add_theme_color_override("font_color", Color("afc3c9"))
    return label

func _button(value: String, action: Callable) -> Button:
    var button := Button.new()
    button.text = value
    button.focus_mode = Control.FOCUS_NONE
    button.pressed.connect(action)
    return button

func world() -> EcologistWorld:
    return main.campaign_world

func model() -> WorkshopModel:
    return main.workshop.model

func name_of(kind: String) -> String:
    return items[kind].name if items.has(kind) else kind.capitalize()

func owns(tool: String) -> bool:
    return model().equipment.has(tool)

func _say(text: String) -> void:
    note.text = text
    main._notice(text)

func in_reach(info: Dictionary) -> bool:
    var center := Vector2(info.x + info.width / 2.0, info.y + info.height / 2.0)
    return main._in_reach(Vector2i(int(center.x) & ~1, int(center.y) & ~1))

func nearby(kind: String) -> Array:
    var found := []
    for info in world().equipment_list():
        if (kind.is_empty() or info.kind == kind) and in_reach(info):
            found.append(info)
    return found

func open(id: int) -> void:
    current = id
    note.text = ""
    show()
    main.workshop.hide()
    refresh()

func close() -> void:
    current = -1
    hide()

func reset() -> void:
    close()
    carrying = -1
    billed_joules = world().budget("stove_joules")

# Gas is billed as the stoves burn it; called once per simulation tick.
func bill() -> void:
    var burned := world().budget("stove_joules")
    if burned > billed_joules:
        model().charge((burned - billed_joules) / 1000.0 * float(model().data.balance.energy_price_per_kj))
    billed_joules = burned

func _process(delta: float) -> void:
    if not visible:
        return
    clock += delta
    if clock >= 0.2:
        clock = 0.0
        refresh()

func stove_for(info: Dictionary) -> int:
    if info.kind == "stove":
        return info.id
    var under: Dictionary = world().equipment_info(int(info.resting_on))
    return int(under.id) if not under.is_empty() and under.kind == "stove" else -1

# What a cook can tell without instruments, and what the thermometer and refractometer add.
func describe(info: Dictionary) -> String:
    var lines: Array[String] = []
    var t: float = info.temperature
    var boiling: bool = float(info.water) > 0.01 and t >= float(info.boiling_point) - 0.3 and float(info.vapour) > 0.3
    if owns("thermometer"):
        var line := "%.1f °C" % t
        if boiling:
            line += " · boiling"
        if not String(info.stage).is_empty():
            line += " · " + String(info.stage)
        lines.append(line)
    else:
        lines.append(("Boiling" if boiling else "Steaming" if float(info.vapour) > 0.3 else "Hot" if t > 60 else "Warm" if t > 32 else "Cool") + " · a thermometer would say more")
    if float(info.mass) > 0.5:
        if owns("refractometer"):
            if float(info.sugar_dissolved) > float(info.salt_dissolved):
                lines.append("Brix %.1f %%" % (float(info.brix) * 100))
            elif float(info.water) > 0.01:
                lines.append("Salinity %.1f %%" % (float(info.salinity) * 100))
        else:
            lines.append("A refractometer would read the sugar or salt")
    return "\n".join(lines)

func contents(info: Dictionary) -> String:
    var mass: float = info.mass
    if mass < 0.5:
        return "Empty · holds %d g" % int(info.capacity)
    var lines: Array[String] = ["%d g of %d g" % [roundi(mass), int(info.capacity)]]
    if info.set:
        lines.append("Set hard. Collect it.")
    if float(info.sugar_crystals) > 0.5:
        lines.append("Undissolved sugar at the bottom (about %d g)" % roundi(info.sugar_crystals))
    if float(info.salt_crystals) > 0.5:
        lines.append("Salt crystals (about %d g)" % roundi(info.salt_crystals))
    if float(info.bittern_crystals) > 0.5:
        lines.append("A bitter crust is forming")
    if float(info.burnt) > 0.01:
        lines.append("It smells burnt")
    return "\n".join(lines)

func refresh() -> void:
    if current < 0:
        return
    var info: Dictionary = world().equipment_info(current)
    if info.is_empty():
        close()
        return
    title.text = name_of(info.kind)
    var under: Dictionary = world().equipment_info(int(info.resting_on))
    place_text.text = ("On the " + name_of(under.kind).to_lower()) if not under.is_empty() else "On the floor"
    if not in_reach(info):
        place_text.text += " · out of reach"
    var stove := stove_for(info)
    flame_row.visible = stove >= 0
    if stove >= 0:
        var setting: int = world().equipment_info(stove).setting
        for level in flame_buttons.size():
            flame_buttons[level].modulate = Color("9fe6b0") if level == setting else Color.WHITE
    var vessel: bool = info.vessel
    for row in [add_row, pour_row, vessel_actions, contents_text]:
        row.visible = vessel
    readings.visible = vessel
    if not vessel:
        readings.text = ""
        tool_row.visible = false
        return
    readings.text = describe(info)
    contents_text.text = contents(info)
    var choices := nearby("")
    var selected_id := pour_ids[pour_target.selected] if pour_target.selected >= 0 and pour_target.selected < pour_ids.size() else -1
    pour_ids.clear()
    pour_target.clear()
    for other in choices:
        if other.vessel and int(other.id) != current:
            pour_ids.append(int(other.id))
            pour_target.add_item("%s · %d g" % [name_of(other.kind), roundi(other.mass)])
    if pour_ids.has(selected_id):
        pour_target.select(pour_ids.find(selected_id))
    for child in tool_row.get_children():
        child.queue_free()
    tool_row.visible = false
    for tool in data.tools:
        if not owns(tool):
            var entry: Dictionary = model().data.equipment[tool]
            tool_row.add_child(_button("Buy %s · %d" % [entry.name.to_lower(), int(entry.cost)], _buy_tool.bind(tool)))
            tool_row.visible = true

func _set_flame(level: int) -> void:
    var stove := stove_for(world().equipment_info(current))
    if stove >= 0 and world().equipment_set(stove, level):
        _say("Flame " + FLAMES[level].to_lower() + ".")
    refresh()

func _add() -> void:
    var entry: Dictionary = data.ingredients[maxi(0, ingredient.selected)]
    var amount := float(grams.value)
    var info: Dictionary = world().equipment_info(current)
    if info.is_empty() or not in_reach(info):
        _say("Get closer first.")
        return
    var error := ""
    if entry.source == "tap":
        if nearby("sink").is_empty():
            _say("There is no sink within reach.")
            return
        error = world().vessel_add(current, "water", amount, float(data.tap_temperature))
        if error.is_empty():
            model().charge(amount * float(data.tap_price_per_g))
    else:
        if not model().take(entry.id, amount):
            _say(model().message)
            return
        error = world().vessel_add(current, entry.id, amount, float(data.room_temperature))
        if not error.is_empty():
            model().store(entry.id, amount)
    _say("Added %d g %s." % [roundi(amount), entry.name.to_lower()] if error.is_empty() else "Cannot add that: " + error + ".")
    refresh()

func _pour() -> void:
    if pour_target.selected < 0 or pour_target.selected >= pour_ids.size():
        _say("Stand within reach of another vessel to pour into it.")
        return
    var result: Dictionary = world().vessel_pour(current, pour_ids[pour_target.selected])
    _say("Poured %d g." % roundi(result.grams) if float(result.grams) > 0 else "Cannot pour: " + String(result.error) + ".")
    refresh()

func _drain() -> void:
    if nearby("sink").is_empty():
        _say("Drain it at a sink.")
        return
    var drained: float = world().vessel_drain(current, true)
    _say("Poured %d g down the sink, keeping the crystals." % roundi(drained) if drained > 0 else "Nothing to drain.")
    refresh()

func _tip() -> void:
    var units: int = world().vessel_spill(current)
    main.dirty = true
    _say("Tipped it out on the floor." if units > 0 else "Nothing pours out.")
    refresh()

func _collect() -> void:
    var product: Dictionary = world().vessel_collect(current)
    var error := String(product.error)
    if not error.is_empty():
        _say(error.substr(0, 1).to_upper() + error.substr(1) + ".")
        return
    model().store(product.id, product.grams)
    var named: String = model().data.materials[product.id].name if model().data.materials.has(product.id) else product.id
    _say("%d g %s. %s Sell it in the workshop." % [roundi(product.grams), named, product.note])
    refresh()

func _move() -> void:
    carrying = current
    close()
    main._notice("Click where it should go. Right click puts it back down.")

func _pick_up() -> void:
    pick_up(current)

func pick_up(id: int) -> void:
    var info: Dictionary = world().equipment_info(id)
    if info.is_empty():
        return
    var error: String = world().equipment_remove(id)
    if not error.is_empty():
        main._notice("Cannot pick it up: " + error + ".")
        return
    var item: Dictionary = items.get(info.kind, {})
    var refund := float(item.get("cost", 0)) * float(item.get("salvage", 0))
    model().cash += refund
    if id == current:
        close()
    main.dirty = true
    main._notice("Picked up the %s · %.2f credits back." % [name_of(info.kind).to_lower(), refund])

func _buy_tool(tool: String) -> void:
    model().purchase_equipment(tool)
    _say(model().message)
    refresh()

# Places a new piece from the kit bar, or puts down the one being carried.
func place(kind: String, cell: Vector2i) -> void:
    var item: Dictionary = items[kind]
    if model().cash + 0.000001 < float(item.cost):
        main._notice("Not enough credits for the %s (%d)." % [item.name.to_lower(), int(item.cost)])
        return
    var result: Dictionary = world().equipment_place(kind, cell.x, cell.y)
    if int(result.id) < 0:
        main._notice("Cannot put it there: " + String(result.error) + ".")
        return
    model().cash = maxf(0.0, model().cash - float(item.cost))
    main.dirty = true
    main._notice("Placed the %s · %d credits." % [item.name.to_lower(), int(item.cost)])

func put_down(cell: Vector2i) -> void:
    var result: Dictionary = world().equipment_move(carrying, cell.x, cell.y)
    if int(result.id) < 0:
        main._notice("Cannot put it there: " + String(result.error) + ".")
        return
    carrying = -1
    main.dirty = true
    main._notice("Put down.")

func hover_text(id: int) -> String:
    var info: Dictionary = world().equipment_info(id)
    if info.is_empty():
        return ""
    if not info.vessel:
        return "%s%s · click to use" % [name_of(info.kind), " · flame " + FLAMES[int(info.setting)].to_lower() if info.kind == "stove" else ""]
    return "%s · %s · %s · click to use" % [name_of(info.kind), contents(info).split("\n")[0], describe(info).split("\n")[0]]

func footprint(kind: String, cell: Vector2i) -> Rect2:
    for spec in world().equipment_kinds():
        if spec.id == kind:
            var bottom := cell.y | 1
            return Rect2(Vector2(cell.x & ~1, bottom - int(spec.height) + 1) * CELL, Vector2(spec.width, spec.height) * CELL)
    return Rect2()

func _liquid_color(info: Dictionary) -> Color:
    var color := Color("5daee7")
    color = color.lerp(Color("e8b04a"), clampf(float(info.sugar) * 1.4, 0.0, 1.0))
    color = color.lerp(Color("4a2a12"), clampf(float(info.burnt) * 6.0, 0.0, 1.0))
    color.a = 0.95 if info.set else 0.85
    return color

# Equipment is drawn on the world: sprites, then each vessel's back wall, contents, bubbles and steam.
func draw_equipment(canvas: CanvasItem, view: Array, time: float) -> void:
    for info in view:
        var pos := Vector2(info.x, info.y) * CELL
        var size := Vector2(info.width, info.height) * CELL
        var item: Dictionary = items.get(info.kind, {})
        var inside: Rect2 = INSIDE.get(info.kind, Rect2())
        if info.vessel:
            var back := Rect2(pos + inside.position, inside.size)
            canvas.draw_rect(back, Color("2c3438"))
            var fill := clampf(float(info.fill), 0.0, 1.0)
            if float(info.mass) > 0.5:
                var height := maxf(1.0, round(inside.size.y * fill))
                var liquid := Rect2(back.position + Vector2(0, back.size.y - height), Vector2(back.size.x, height))
                canvas.draw_rect(liquid, _liquid_color(info))
                var crystals := clampf(float(info.crystals) * 3.0, 0.0, 1.0)
                for i in int(crystals * back.size.x):
                    var x := fmod(float(i) * 7.3, back.size.x)
                    canvas.draw_rect(Rect2(back.position + Vector2(x, back.size.y - 1 - fmod(float(i) * 3.1, minf(height, 3.0))), Vector2.ONE), Color("f4f6f2"))
                if float(info.vapour) > 1.0 and float(info.temperature) >= 99.0:
                    for i in 4:
                        var phase := fmod(time * 3.0 + float(i) * 0.37, 1.0)
                        var bubble := liquid.position + Vector2(fmod(float(i) * 4.7 + time * 1.3, liquid.size.x), liquid.size.y * (1.0 - phase))
                        canvas.draw_circle(bubble, 0.8, Color(1, 1, 1, 0.55))
        if sheet != null and item.has("sprite"):
            var region: Array = item.sprite
            canvas.draw_texture_rect_region(sheet, Rect2(pos, size), Rect2(region[0], region[1], region[2], region[3]))
        else:
            canvas.draw_rect(Rect2(pos, size), Color("6d7a80"), false, 1.0)
        if info.kind == "stove" and int(info.setting) > 0:
            var flicker := 0.85 + 0.15 * sin(time * 23.0 + float(info.x))
            canvas.draw_rect(Rect2(pos + Vector2(3, -1), Vector2(size.x - 6, 1)), Color(0.35, 0.55, 1.0, 0.35 * int(info.setting) * flicker))
            canvas.draw_rect(Rect2(pos + Vector2(4 + 7 * int(info.setting), 6), Vector2(1, 1)), Color("ff9a3c"))
        if info.kind == "sink":
            canvas.draw_line(pos + Vector2(24, 0), pos + Vector2(24, -9), Color("a8b2b8"), 2.0)
            canvas.draw_line(pos + Vector2(24, -9), pos + Vector2(18, -9), Color("a8b2b8"), 2.0)
            canvas.draw_line(pos + Vector2(18, -9), pos + Vector2(18, -6), Color("a8b2b8"), 2.0)
        if info.vessel and float(info.vapour) > 0.2:
            var strength := clampf(float(info.vapour) / 8.0, 0.1, 0.6)
            for i in 3:
                var t := fmod(time * 0.6 + float(i) / 3.0, 1.0)
                var puff := pos + Vector2(size.x / 2.0 + sin(time * 1.7 + i * 2.1) * 3.0, -t * 22.0)
                canvas.draw_circle(puff, 2.0 + t * 4.0, Color(0.92, 0.95, 0.97, strength * (1.0 - t)))
        if int(info.id) == current or int(info.id) == carrying:
            canvas.draw_rect(Rect2(pos - Vector2.ONE, size + Vector2(2, 2)), Color("f2c94c"), false, 1.0)
