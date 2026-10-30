extends PanelContainer
# The town around the plot (M3): it owns the PeopleModel, steps it on the game clock, draws the passers-by, their
# dogs and the customer at the door, and is the window that opens when you answer the door: sell what they asked
# for from stock, promise it for later, or send them away. main.gd owns the world and passes itself in.

const Model = preload("res://core/people.gd")
const SAVE_PATH := "user://people-v1.json"
const SHEET := "res://art/people.png"
const CELL := 8.0
const DOG_ROW := 768

var main: Node
var model: PeopleModel
var data: Dictionary = {}
var save_path := SAVE_PATH
var sheet: Texture2D
var portrait := TextureRect.new()
var title := UiStyle.label("", "Title")
var hearts := HBoxContainer.new()
var quote := UiStyle.label("")
var request := UiStyle.label("", "Note")
var stock_text := UiStyle.label("", "Muted")
var actions := HFlowContainer.new()

func setup(owner: Node) -> void:
    main = owner
    sheet = main._load_texture(SHEET)

func _ready() -> void:
    data = JSON.parse_string(FileAccess.get_file_as_string("res://data/people.json"))
    model = Model.new(data, main.workshop.model)
    # Near the top, so the door and the person at it stay in view below.
    set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
    grow_horizontal = Control.GROW_DIRECTION_BOTH
    offset_top = 96
    custom_minimum_size.x = 560
    mouse_filter = Control.MOUSE_FILTER_STOP
    var layout := VBoxContainer.new()
    layout.add_theme_constant_override("separation", 8)
    add_child(layout)
    var heading := HBoxContainer.new()
    heading.add_theme_constant_override("separation", 12)
    layout.add_child(heading)
    portrait.custom_minimum_size = Vector2(64, 96)
    portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
    portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
    portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
    heading.add_child(portrait)
    var about := VBoxContainer.new()
    about.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    heading.add_child(about)
    about.add_child(title)
    hearts.add_theme_constant_override("separation", 2)
    about.add_child(hearts)
    quote.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    about.add_child(quote)
    var close_button := Button.new()
    close_button.text = "X"
    close_button.tooltip_text = "Close · Esc"
    close_button.focus_mode = Control.FOCUS_NONE
    close_button.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
    close_button.pressed.connect(close)
    heading.add_child(close_button)
    layout.add_child(HSeparator.new())
    request.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    layout.add_child(request)
    layout.add_child(stock_text)
    actions.add_theme_constant_override("h_separation", 6)
    actions.add_theme_constant_override("v_separation", 6)
    layout.add_child(actions)
    hide()

func close() -> void:
    hide()

# One campaign tick on the shop's clock.
func step() -> void:
    var said := model.said
    model.step(main.shop.model.minute, 1.0 / 60.0)
    if model.said != said:
        main._notice(model.message)
    if visible and not model.knocking():
        hide()

# The person under a point in the world, for the tooltip and clicks: the visitor first, then passers-by.
func at(point: Vector2) -> Dictionary:
    var ground := float(data.street.ground_row) * CELL
    for entry in ([model.visitor] if not model.visitor.is_empty() else []) + model.walkers:
        if Rect2(float(entry.x) * CELL - 8.0, ground - 44.0, 16.0, 44.0).has_point(point):
            return entry
    return {}

func tip(point: Vector2) -> String:
    var entry := at(point)
    if entry.is_empty():
        return ""
    if entry == model.visitor:
        match entry.phase:
            "knock": return "%s · at the door · click to answer" % entry.name
            "arrive": return "%s · coming to your door" % entry.name
            _: return "%s · \"%s\"" % [entry.name, entry.line] if not String(entry.line).is_empty() else String(entry.name)
    return "%s · \"%s\"" % [entry.name, entry.line]

# Answering the door needs the player next to it, like the truck.
func click(point: Vector2) -> bool:
    var entry := at(point)
    if entry.is_empty() or entry != model.visitor or entry.phase != "knock":
        return not entry.is_empty()
    var tile := Vector2i(int(entry.x), int(data.street.ground_row) - 2)
    if not main._in_reach(tile):
        main._notice("Walk over to the door first.")
        return true
    open()
    return true

func open() -> void:
    if not model.knocking():
        return
    main.kitchen.close()
    main.shop.close()
    main.workshop.hide()
    show()
    refresh()

func refresh() -> void:
    if not model.knocking():
        return
    var visitor: Dictionary = model.visitor
    var atlas := AtlasTexture.new()
    atlas.atlas = sheet
    atlas.region = Rect2(0, int(visitor.look) * 48, 32, 48)
    portrait.texture = atlas
    title.text = visitor.name
    for child in hearts.get_children():
        child.queue_free()
    var rep := model.rep(visitor.customer)
    if int(model.served.get(visitor.customer, 0)) == 0 and rep == 0.0:
        hearts.add_child(UiStyle.label("New customer", "Muted"))
    else:
        for i in 5:
            var heart := UiStyle.icon_rect(UiStyle.icon("heart"), 22)
            heart.modulate = Color.WHITE if i < int(round(maxf(rep, 0.0))) else Color(0.2, 0.2, 0.25, 0.8)
            hearts.add_child(heart)
    quote.text = "\"%s\"" % visitor.line
    var product: String = visitor.product
    request.text = "%s %.0f g of %s, grade %s or better." % ["Back for the promised" if visitor.order else "Wants", visitor.grams, model.product_name(product), visitor.grade]
    var stock := model.stock_for(product)
    var parts: Array[String] = []
    for grade in stock:
        parts.append("%s %.0f g" % [grade, stock[grade]])
    stock_text.text = "In stock: " + " · ".join(parts)
    for child in actions.get_children():
        child.queue_free()
    for grade in stock:
        if Model.better(String(visitor.grade), grade):
            continue
        var button := _button("Sell grade %s · %.2f cr" % [grade, model.price(grade)], _sell.bind(grade))
        button.disabled = stock[grade] + 0.000001 < float(visitor.grams)
        if button.disabled:
            button.tooltip_text = "Only %.0f g of grade %s in stock." % [stock[grade], grade]
        actions.add_child(button)
    if not visitor.order:
        actions.add_child(_button("Promise for later", _promise))
    actions.add_child(_button("Sorry, not ready" if visitor.order else "Not today", _refuse))

func _button(text: String, action: Callable) -> Button:
    var button := Button.new()
    button.text = text
    button.focus_mode = Control.FOCUS_NONE
    button.pressed.connect(action)
    return button

func _sell(grade: String) -> void:
    if model.sell(grade):
        hide()
    main._notice(model.message)

func _promise() -> void:
    model.promise()
    main._notice(model.message)
    hide()

func _refuse() -> void:
    model.refuse()
    main._notice(model.message)
    hide()

# The promised orders, soonest first, for the HUD.
func orders_text() -> String:
    var sorted := model.orders.duplicate()
    sorted.sort_custom(func(a, b): return float(a.due) < float(b.due))
    var parts: Array[String] = []
    for order in sorted.slice(0, 2):
        parts.append("%s %s" % [String(order.name).get_slice(" ", 0), LogisticsModel.clock_text(order.due).get_slice(" · ", 1)])
    if sorted.size() > 2:
        parts.append("+%d" % (sorted.size() - 2))
    return " · ".join(parts)

func _frame(entry: Dictionary, time: float, moving: bool) -> int:
    if not moving:
        return 0
    return 1 + int(time * (12.0 if entry.get("kind", "walk") == "jog" else 8.0)) % 4

func _person(canvas: CanvasItem, entry: Dictionary, frame: int, left: bool) -> void:
    var origin := Vector2(float(entry.x) * CELL - 16.0, float(data.street.ground_row) * CELL - 48.0).round()
    if left:
        canvas.draw_set_transform(origin + Vector2(32, 0), 0.0, Vector2(-1, 1))
    else:
        canvas.draw_set_transform(origin, 0.0, Vector2.ONE)
    canvas.draw_texture_rect_region(sheet, Rect2(0, 0, 32, 48), Rect2(frame * 32, int(entry.look) * 48, 32, 48))
    canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _dog(canvas: CanvasItem, entry: Dictionary, time: float, moving: bool) -> void:
    var left: bool = entry.dir < 0
    var x := float(entry.x) * CELL + (14.0 if not left else -14.0)
    var origin := Vector2(x - 12.0, float(data.street.ground_row) * CELL - 16.0).round()
    var frame := int(entry.dog) * 3 + (1 + int(time * 8.0) % 2 if moving else 0)
    if left:
        canvas.draw_set_transform(origin + Vector2(24, 0), 0.0, Vector2(-1, 1))
    else:
        canvas.draw_set_transform(origin, 0.0, Vector2.ONE)
    canvas.draw_texture_rect_region(sheet, Rect2(0, 0, 24, 16), Rect2(frame * 24, DOG_ROW, 24, 16))
    canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

# Passers-by and their dogs, then the visitor: walking, or knocking at the door in bursts.
func draw_people(canvas: CanvasItem, time: float) -> void:
    if sheet == null:
        return
    for walker in model.walkers:
        var moving: bool = walker.pause <= 0.0
        _person(canvas, walker, _frame(walker, time, moving), walker.dir < 0)
        if int(walker.dog) >= 0:
            _dog(canvas, walker, time, moving)
    var visitor: Dictionary = model.visitor
    if visitor.is_empty():
        return
    if visitor.phase == "knock":
        var beat := fmod(time, 3.0)
        var frame := (5 + int(beat * 6.0) % 2) if beat < 0.9 and not visible else 0
        _person(canvas, visitor, frame, true)
    else:
        _person(canvas, visitor, _frame(visitor, time, true), visitor.phase == "arrive")

func save() -> String:
    var file := FileAccess.open(save_path + ".tmp", FileAccess.WRITE)
    if file == null:
        return "could not write the town"
    file.store_string(JSON.stringify(model.snapshot(), "  ", true, true))
    file.close()
    return "" if DirAccess.rename_absolute(ProjectSettings.globalize_path(save_path + ".tmp"), ProjectSettings.globalize_path(save_path)) == OK else "could not replace the town save"

# Returns an empty string, or why the saved town was not loaded (the game keeps going with the current one).
func load_save() -> String:
    if not FileAccess.file_exists(save_path):
        return ""
    var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(save_path))
    if not saved is Dictionary:
        return "the town save is not readable"
    hide()
    return model.restore(saved)
