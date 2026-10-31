extends PanelContainer
# The kitchen panel (M1, M2): one piece of equipment at a time, with its burner knob, readings and actions. main.gd
# owns the world and the player and passes itself in; this panel only calls the world's equipment methods, the
# workshop's stock and cash, and the shop's crates. It also draws the equipment and bills the gas and electricity.

const SPRITES := "res://art/equipment.png"
const CELL := 8.0

var main: Node
var data: Dictionary = {}
var items: Dictionary = {}
var current := -1
var carrying := -1
var billed_joules := 0.0
var billed_power := 0.0
var sheet: Texture2D
var clock := 0.0
var title := UiStyle.label("", "Title")
var picture := UiStyle.icon_rect(null, 40)
var place_text := UiStyle.label("", "Muted")
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
var spin_row := HBoxContainer.new()
var spin_button: Button
var wash_button: Button
var tool_row := HFlowContainer.new()
var note := UiStyle.label("", "Note")

func setup(owner: Node) -> void:
    main = owner
    sheet = main._load_texture(SPRITES)

func _ready() -> void:
    data = JSON.parse_string(FileAccess.get_file_as_string("res://data/equipment.json"))
    for item in data.items:
        items[item.id] = item
    # The look comes from the game theme (UiStyle): a riveted steel window with the piece's picture in the heading.
    custom_minimum_size.x = 420
    mouse_filter = Control.MOUSE_FILTER_STOP
    var layout := VBoxContainer.new()
    layout.add_theme_constant_override("separation", 8)
    add_child(layout)
    var heading := HBoxContainer.new()
    heading.add_theme_constant_override("separation", 10)
    layout.add_child(heading)
    heading.add_child(picture)
    title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    heading.add_child(title)
    var close_button := _button("X", close)
    close_button.tooltip_text = "Close · Esc"
    close_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
    heading.add_child(close_button)
    for label in [place_text, readings, contents_text, note]:
        label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    layout.add_child(place_text)
    layout.add_child(HSeparator.new())
    layout.add_child(readings)
    layout.add_child(contents_text)
    flame_row.add_child(_text("Flame"))
    for level in data.flames.stove.size():
        var button := _button(data.flames.stove[level], _set_flame.bind(level))
        button.toggle_mode = true
        flame_buttons.append(button)
        flame_row.add_child(button)
    layout.add_child(flame_row)
    for entry in data.ingredients:
        ingredient.add_item(entry.name)
    grams.min_value = 10
    grams.max_value = 25000
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
    spin_button = _button("Spin", _spin)
    spin_row.add_child(spin_button)
    wash_button = _button("Wash", _wash)
    spin_row.add_child(wash_button)
    layout.add_child(spin_row)
    var piece_actions := HBoxContainer.new()
    piece_actions.add_child(_button("Move", _move))
    piece_actions.add_child(_button("Pick up", _pick_up))
    layout.add_child(piece_actions)
    layout.add_child(tool_row)
    layout.add_child(note)
    hide()

func _text(value: String) -> Label:
    return UiStyle.label(value, "Muted")

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

func flames(kind: String) -> Array:
    return data.flames.get(kind, data.flames.stove)

func crated(kind: String) -> bool:
    return items.has(kind) and bool(items[kind].get("crate", false))

static func weight(grams: float) -> String:
    return "%d g" % roundi(grams) if grams < 10000.0 else "%.1f kg" % (grams / 1000.0)

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
    if String(world().equipment_info(id).get("kind", "")) == "laptop":
        main.shop.open()
        return
    current = id
    note.text = ""
    show()
    main.workshop.hide()
    main.shop.hide()
    main.people.close()
    refresh()

func close() -> void:
    current = -1
    hide()

func reset() -> void:
    close()
    carrying = -1
    billed_joules = world().budget("stove_joules")
    billed_power = world().budget("power_joules")

# Gas is billed as the stoves and the kettle burn it, electricity as pumps and centrifuges run; once per tick.
func bill() -> void:
    var burned := world().budget("stove_joules")
    if burned > billed_joules:
        model().charge((burned - billed_joules) / 1000.0 * float(data.gas_price_per_kj))
    billed_joules = burned
    var used := world().budget("power_joules")
    if used > billed_power:
        model().charge((used - billed_power) / 1000.0 * float(data.power_price_per_kj))
    billed_power = used

func _process(delta: float) -> void:
    if not visible:
        return
    clock += delta
    if clock >= 0.2:
        clock = 0.0
        refresh()

func stove_for(info: Dictionary) -> int:
    if info.kind == "stove" or info.kind == "kettle":
        return info.id
    var under: Dictionary = world().equipment_info(int(info.resting_on))
    return int(under.id) if not under.is_empty() and under.kind == "stove" else -1

# What a cook can tell without instruments, and what the thermometer, refractometer and pH meter add.
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
                lines.append("Brix %.1f %% · saturated at %.1f %%" % [float(info.brix) * 100, float(info.saturation_brix) * 100])
            elif float(info.water) > 0.01:
                lines.append("Salinity %.1f %%" % (float(info.salinity) * 100))
        else:
            lines.append("A refractometer would read the sugar or salt")
        var juice := float(info.beet_g) + float(info.colloid_g) + float(info.lime_g) > 0.5
        if owns("ph_meter") and float(info.water) > 1.0:
            lines.append("pH %.1f" % float(info.ph))
        elif juice:
            lines.append("A pH meter would show how much lime it needs")
    return "\n".join(lines)

func contents(info: Dictionary) -> String:
    var mass: float = info.mass
    var lines: Array[String] = ["Empty · holds %s" % weight(info.capacity) if mass < 0.5 else "%s of %s" % [weight(mass), weight(info.capacity)]]
    if info.kind == "centrifuge":
        lines.append("Casing: %s of %s" % [weight(info.casing_mass), weight(info.casing_capacity)] if float(info.casing_mass) > 0.5 else "Casing: empty")
    if mass < 0.5:
        return "\n".join(lines)
    if info.set:
        lines.append("Set hard. Collect it.")
    if float(info.beet_g) > 0.5:
        lines.append("%s · about %s" % ["Shredded beets (cossettes)" if float(info.shredded) > 0.5 else "Whole beets", weight(info.beet_g)])
    if float(info.mud_g) > 0.5:
        lines.append("Lime mud has settled at the bottom (about %s)" % weight(info.mud_g))
    if float(info.cloudy) > 0.002:
        lines.append("The juice is cloudy")
    if float(info.sugar_crystals) > 0.5:
        lines.append("Sugar crystals (about %s)" % weight(info.sugar_crystals))
    if float(info.salt_crystals) > 0.5:
        lines.append("Salt crystals (about %d g)" % roundi(info.salt_crystals))
    if float(info.bittern_crystals) > 0.5:
        lines.append("A bitter crust is forming")
    if float(info.burnt) > 0.01:
        lines.append("It smells burnt")
    return "\n".join(lines)

func ports_text(info: Dictionary) -> String:
    var ports: Array = info.get("ports", [])
    if ports.is_empty():
        return ""
    var piped := 0
    for port in ports:
        piped += 1 if port.connected else 0
    var where := "casing outlets" if info.kind == "centrifuge" else "ports"
    return "%d %s · %d piped" % [ports.size(), where, piped]

func refresh() -> void:
    if current < 0:
        return
    var info: Dictionary = world().equipment_info(current)
    if info.is_empty():
        close()
        return
    title.text = name_of(info.kind)
    picture.texture = UiStyle.sprite(SPRITES, items[info.kind].sprite) if items.has(info.kind) and items[info.kind].has("sprite") else null
    picture.visible = picture.texture != null
    var under: Dictionary = world().equipment_info(int(info.resting_on))
    var places: Array[String] = [("On the " + name_of(under.kind).to_lower()) if not under.is_empty() else "On the floor"]
    if not in_reach(info):
        places.append("out of reach")
    if info.kind == "coupling":
        places.append("the tanker is pumping through it" if main.shop.hooked == current else "by the road, where tankers hook up" if int(info.x) >= int(main.shop.data.curb_x) else "too far from the road for a tanker")
    if not ports_text(info).is_empty():
        places.append(ports_text(info))
    place_text.text = " · ".join(places)
    var stove := stove_for(info)
    flame_row.visible = stove >= 0
    if stove >= 0:
        var burner: Dictionary = world().equipment_info(stove)
        var labels := flames(burner.kind)
        for level in flame_buttons.size():
            flame_buttons[level].text = labels[level]
            flame_buttons[level].set_pressed_no_signal(level == int(burner.setting))
    var vessel: bool = info.vessel
    for row in [pour_row, vessel_actions, contents_text]:
        row.visible = vessel
    add_row.visible = vessel and not info.closed
    spin_row.visible = info.kind == "centrifuge"
    readings.visible = vessel
    if not vessel:
        readings.text = ""
        tool_row.visible = false
        return
    if info.kind == "centrifuge":
        spin_button.text = "Stop" if int(info.setting) > 0 else "Spin"
        wash_button.text = "Wash · %s" % weight(_wash_grams(info))
    readings.text = describe(info)
    contents_text.text = contents(info) + ("\nClosed: fill it through its ports." if info.closed and float(info.mass) < 0.5 else "")
    var choices := nearby("")
    var selected_id := pour_ids[pour_target.selected] if pour_target.selected >= 0 and pour_target.selected < pour_ids.size() else -1
    pour_ids.clear()
    pour_target.clear()
    for other in choices:
        if other.vessel and not other.closed and int(other.id) != current:
            pour_ids.append(int(other.id))
            pour_target.add_item("%s · %s" % [items[other.kind].short if items.has(other.kind) else name_of(other.kind), weight(other.mass)])
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
        _say("Flame " + String(flames(world().equipment_info(stove).kind)[level]).to_lower() + ".")
    refresh()

func _wash_grams(info: Dictionary) -> float:
    return maxf(10.0, round(float(info.get("sugar_crystals", 0.0)) * 0.03))

func _spin() -> void:
    var info: Dictionary = world().equipment_info(current)
    var on := int(info.setting) == 0
    if world().equipment_set(current, 1 if on else 0):
        _say("Spinning: the syrup runs off into the casing." if on else "Stopped.")
    refresh()

# A splash of mains water through the spray bar washes the syrup film off the crystals.
func _wash() -> void:
    var grams := _wash_grams(world().equipment_info(current))
    var error: String = world().vessel_add(current, "water", grams, float(data.tap_temperature))
    if error.is_empty():
        model().charge(grams * float(data.tap_price_per_g))
    _say("Washed with %s of water. Spin it off." % weight(grams) if error.is_empty() else "Cannot wash: " + error + ".")
    refresh()

func _add() -> void:
    var entry: Dictionary = data.ingredients[maxi(0, ingredient.selected)]
    var amount := float(grams.value)
    var info: Dictionary = world().equipment_info(current)
    if info.is_empty() or not in_reach(info):
        _say("Get closer first.")
        return
    if info.closed:
        _say("It has a lid. Pipe it in through a port.")
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
        var form: String = entry.get("shredded", entry.id) if owns("shredder") else entry.id
        error = world().vessel_add(current, form, amount, float(data.room_temperature))
        if not error.is_empty():
            model().store(entry.id, amount)
        elif form != entry.id:
            _say("Shredded %s %s into cossettes and added them." % [weight(amount), entry.name.to_lower()])
            refresh()
            return
    _say("Added %s %s." % [weight(amount), entry.name.to_lower()] if error.is_empty() else "Cannot add that: " + error + ".")
    refresh()

func _pour() -> void:
    if pour_target.selected < 0 or pour_target.selected >= pour_ids.size():
        _say("Stand within reach of another open vessel to pour into it.")
        return
    var result: Dictionary = world().vessel_pour(current, pour_ids[pour_target.selected])
    _say("Poured %s." % weight(result.grams) if float(result.grams) > 0 else "Cannot pour: " + String(result.error) + ".")
    refresh()

func _drain() -> void:
    if nearby("sink").is_empty():
        _say("Drain it at a sink.")
        return
    var drained: float = world().vessel_drain(current, true)
    _say("Poured %s down the sink, keeping the solids." % weight(drained) if drained > 0 else "Nothing to drain.")
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
    _say("%s %s. %s Sell it in the workshop." % [weight(product.grams), named, product.note])
    refresh()

func _move() -> void:
    var info: Dictionary = world().equipment_info(current)
    if float(info.get("mass", 0.0)) + float(info.get("casing_mass", 0.0)) > float(data.carry_limit_g):
        _say("Too heavy to carry with %s in it. Empty it first." % weight(float(info.mass) + float(info.get("casing_mass", 0.0))))
        return
    carrying = current
    close()
    main._notice("Click where it should go. Right click puts it back down.")

func _pick_up() -> void:
    pick_up(current)

# Kitchen pieces are sold back for salvage; a crated piece goes back into its crate for placing again.
func pick_up(id: int) -> void:
    var info: Dictionary = world().equipment_info(id)
    if info.is_empty():
        return
    var error: String = world().equipment_remove(id)
    if not error.is_empty():
        main._notice("Cannot pick it up: " + error + ".")
        return
    if id == current:
        close()
    main.dirty = true
    if crated(info.kind):
        main.shop.model.return_crate(info.kind)
        main._notice("Packed the %s back into its crate." % name_of(info.kind).to_lower())
        return
    var item: Dictionary = items.get(info.kind, {})
    var refund := float(item.get("cost", 0)) * float(item.get("salvage", 0))
    model().cash += refund
    main._notice("Picked up the %s · %.2f credits back." % [name_of(info.kind).to_lower(), refund])

func _buy_tool(tool: String) -> void:
    model().purchase_equipment(tool)
    _say(model().message)
    refresh()

func can_place(kind: String) -> bool:
    if crated(kind):
        return int(main.shop.model.crates.get(kind, 0)) > 0
    return model().cash + 0.000001 >= float(items[kind].cost)

# Places a new piece from the kit bar (bought on the spot, or unpacked from a delivered crate), or puts down the one
# being carried.
func place(kind: String, cell: Vector2i) -> void:
    var item: Dictionary = items[kind]
    if not can_place(kind):
        if crated(kind):
            main._notice("No %s crate. Order one on the laptop." % String(item.short).to_lower())
        else:
            main._notice("Not enough credits for the %s (%d)." % [item.name.to_lower(), int(item.cost)])
        return
    var result: Dictionary = world().equipment_place(kind, cell.x, cell.y)
    if int(result.id) < 0:
        main._notice("Cannot put it there: " + String(result.error) + ".")
        return
    main.dirty = true
    if crated(kind):
        main.shop.model.take_crate(kind)
        main._notice("Unpacked the %s." % item.name.to_lower())
        return
    model().cash = maxf(0.0, model().cash - float(item.cost))
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
    if info.kind == "laptop":
        return "Laptop · click to order supplies"
    var burner := " · flame " + String(flames(info.kind)[int(info.setting)]).to_lower() if info.kind == "stove" or info.kind == "kettle" else ""
    if not info.vessel:
        return "%s%s · click to use" % [name_of(info.kind), burner]
    var spinning := " · spinning" if info.kind == "centrifuge" and int(info.setting) > 0 else ""
    return "%s%s%s · %s · %s · click to use" % [name_of(info.kind), burner, spinning, contents(info).split("\n")[0], describe(info).split("\n")[0]]

func footprint(kind: String, cell: Vector2i) -> Rect2:
    for spec in world().equipment_kinds():
        if spec.id == kind:
            var bottom := cell.y | 1
            return Rect2(Vector2(cell.x & ~1, bottom - int(spec.height) + 1) * CELL, Vector2(spec.width, spec.height) * CELL)
    return Rect2()

func _liquid_color(info: Dictionary) -> Color:
    var color := Color("5daee7")
    color = color.lerp(Color("e8b04a"), clampf(float(info.sugar) * 1.4, 0.0, 1.0))
    color = color.lerp(Color("9a8466"), clampf(float(info.cloudy) * 60.0, 0.0, 0.8))
    color = color.lerp(Color("4a2a12"), clampf(float(info.burnt) * 6.0, 0.0, 1.0))
    color.a = 0.95 if info.set else 0.85
    return color

# Equipment is drawn on the world: sprites, then each vessel's back wall, contents, bubbles and steam.
func draw_equipment(canvas: CanvasItem, view: Array, time: float) -> void:
    for info in view:
        var pos := Vector2(info.x, info.y) * CELL
        var size := Vector2(info.width, info.height) * CELL
        var item: Dictionary = items.get(info.kind, {})
        var region: Array = item.get("inside", [0, 0, 0, 0])
        var inside := Rect2(region[0], region[1], region[2], region[3])
        if info.vessel:
            var back := Rect2(pos + inside.position, inside.size)
            canvas.draw_rect(back, Color(String(item.get("back", "2c3438"))))
            var fill := clampf(float(info.fill), 0.0, 1.0)
            if float(info.mass) > 0.5:
                var height := maxf(1.0, round(inside.size.y * fill))
                var liquid := Rect2(back.position + Vector2(0, back.size.y - height), Vector2(back.size.x, height))
                canvas.draw_rect(liquid, _liquid_color(info))
                var mud := minf(height, round(inside.size.y * clampf(float(info.mud) * fill * 2.0, 0.0, 1.0)))
                if mud > 0.0:
                    canvas.draw_rect(Rect2(back.position + Vector2(0, back.size.y - mud), Vector2(back.size.x, mud)), Color("b7b2a4"))
                var chunks := int(clampf(float(info.beets) * fill, 0.0, 1.0) * back.size.x * height / 6.0)
                for i in chunks:
                    var spot := Vector2(fmod(float(i) * 5.3, back.size.x - 2.0), back.size.y - 2.0 - fmod(float(i) * 2.7, maxf(1.0, height - 2.0)))
                    canvas.draw_rect(Rect2(back.position + spot, Vector2(2, 2)), Color("e9e0c8"))
                var crystals := clampf(float(info.crystals) * 3.0, 0.0, 1.0)
                for i in int(crystals * back.size.x):
                    var x := fmod(float(i) * 7.3, back.size.x)
                    canvas.draw_rect(Rect2(back.position + Vector2(x, back.size.y - 1 - fmod(float(i) * 3.1, minf(height, 3.0))), Vector2.ONE), Color("f4f6f2"))
                if float(info.vapour) > 1.0 and float(info.temperature) >= 99.0:
                    for i in 4:
                        var phase := fmod(time * 3.0 + float(i) * 0.37, 1.0)
                        var bubble := liquid.position + Vector2(fmod(float(i) * 4.7 + time * 1.3, liquid.size.x), liquid.size.y * (1.0 - phase))
                        canvas.draw_circle(bubble, 0.8, Color(1, 1, 1, 0.55))
            if info.kind == "centrifuge" and int(info.setting) > 0:
                var hub := back.get_center()
                for i in 3:
                    var angle := time * 25.0 + float(i) * TAU / 3.0
                    canvas.draw_line(hub, hub + Vector2(cos(angle) * back.size.x / 2.0, sin(angle) * back.size.y / 4.0), Color(0.9, 0.95, 1.0, 0.5), 1.0)
        if sheet != null and item.has("sprite"):
            var sprite: Array = item.sprite
            canvas.draw_texture_rect_region(sheet, Rect2(pos, size), Rect2(sprite[0], sprite[1], sprite[2], sprite[3]))
        else:
            canvas.draw_rect(Rect2(pos, size), Color("6d7a80"), false, 1.0)
        if info.kind == "stove" and int(info.setting) > 0:
            var flicker := 0.85 + 0.15 * sin(time * 23.0 + float(info.x))
            canvas.draw_rect(Rect2(pos + Vector2(3, -1), Vector2(size.x - 6, 1)), Color(0.35, 0.55, 1.0, 0.35 * int(info.setting) * flicker))
            canvas.draw_rect(Rect2(pos + Vector2(4 + 7 * int(info.setting), 6), Vector2(1, 1)), Color("ff9a3c"))
        if info.kind == "kettle" and int(info.setting) > 0:
            for i in 2 + 3 * int(info.setting):
                var x := 8.0 + fmod(float(i) * 6.7, size.x - 16.0)
                var tall := 1.0 + int(info.setting) * (0.8 + 0.4 * sin(time * 19.0 + float(i) * 1.7))
                canvas.draw_rect(Rect2(pos + Vector2(x, 25.0 - tall), Vector2(2, tall)), Color(0.35, 0.55, 1.0, 0.8))
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
