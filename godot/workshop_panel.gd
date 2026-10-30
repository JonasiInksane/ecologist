extends PanelContainer

const Model = preload("res://core/workshop.gd")
const SAVE_PATH := "user://workshop-v1.json"
var save_path := SAVE_PATH
var model: WorkshopModel
var definitions: Dictionary
var materials := OptionButton.new()
var recipes := OptionButton.new()
var grams := SpinBox.new()
var money := Label.new()
var stock_text: Label
var material_text: Label
var vessel_text: Label
var process_text: Label
var machines_text: Label
var enforcement_text: Label
var notice: Label
var illegal_toggle := CheckButton.new()
var suspicion_bar := ProgressBar.new()
var purchase_button: Button
var run_button: Button
var recipe_ids: Array[String] = []
var material_ids: Array[String] = []
var clock := 0.0

func _ready() -> void:
    definitions = JSON.parse_string(FileAccess.get_file_as_string("res://data/workshop.json"))
    model = Model.new(definitions)
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
    var title := _text("WORKSHOP", 20)
    layout.add_child(title)
    layout.add_child(_text("Finite stock · real names · prototype economics", 12))
    layout.add_child(money)
    var saves := HBoxContainer.new()
    layout.add_child(saves)
    saves.add_child(_button("Save workshop", _save))
    saves.add_child(_button("Load workshop", _load_save))
    var tabs := TabContainer.new()
    tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
    layout.add_child(tabs)
    var stock := _tab(tabs, "Stock")
    stock.add_child(_text("Select a material. Every intermediate can be traded.", 13))
    stock.add_child(materials)
    materials.item_selected.connect(func(_index): refresh())
    material_text = _text("")
    stock.add_child(material_text)
    grams.min_value = 1
    grams.max_value = 2000
    grams.step = 1
    grams.value = 100
    grams.suffix = "g"
    stock.add_child(grams)
    var trades := HBoxContainer.new()
    stock.add_child(trades)
    trades.add_child(_button("Buy", func(): model.buy(_material(), grams.value); refresh()))
    trades.add_child(_button("Sell", func(): model.sell(_material(), grams.value); refresh()))
    trades.add_child(_button("Sell all", func(): model.sell(_material(), model.amount(_material())); refresh()))
    stock.add_child(_button("Add to laboratory vessel", func(): model.add_to_vessel(_material(), grams.value); refresh()))
    stock.add_child(_text("IN STOCK", 13))
    stock_text = _text("")
    stock.add_child(stock_text)
    var lab := _tab(tabs, "Vessel")
    lab.add_child(_text("2 kg laboratory vessel", 18))
    lab.add_child(_text("Add ingredients from Stock. Mix vinegar and sodium bicarbonate, or explore sugar, salt and water.", 13))
    vessel_text = _text("")
    lab.add_child(vessel_text)
    var thermal := HBoxContainer.new()
    lab.add_child(thermal)
    thermal.add_child(_button("Cool −20 °C", func(): model.change_temperature(-20); refresh()))
    thermal.add_child(_button("Heat +20 °C", func(): model.change_temperature(20); refresh()))
    lab.add_child(_button("React · collect the gas", func(): model.react(); refresh()))
    lab.add_child(_button("Evaporate / recover 50 g water", func(): model.distill(); refresh()))
    lab.add_child(_button("Filter undissolved solids", func(): model.filter_solids(); refresh()))
    lab.add_child(_button("Store matching catalog grade", func(): model.bottle(); refresh()))
    lab.add_child(_button("Store ungraded mixture", func(): model.store_mixture(); refresh()))
    lab.add_child(_button("Load latest ungraded mixture", func(): model.load_mixture(); refresh()))
    lab.add_child(_text("Mass is tracked by component. Solubility and heat are simplified; this is not a complete chemistry model. Ungraded batches keep every ingredient and can be loaded again.", 12))
    var machines := _tab(tabs, "Machines")
    machines.add_child(_text("Sugar route", 18))
    machines.add_child(_text("Juice → clarified solution → syrup → sugar crystals → packaged sugar. Recovered water and sediment stay in stock.", 13))
    machines.add_child(recipes)
    recipes.item_selected.connect(func(_index): refresh())
    process_text = _text("")
    purchase_button = _button("Buy required machine", func(): model.purchase_equipment(definitions.recipes[_recipe()].machine); refresh())
    machines.add_child(purchase_button)
    var batch := HBoxContainer.new()
    machines.add_child(batch)
    run_button = _button("Run batch", func(): model.start_job(_recipe()); refresh())
    batch.add_child(run_button)
    batch.add_child(_button("Auto-repeat", func(): model.start_job(_recipe(), true); refresh()))
    machines.add_child(_button("Stop repeating this machine", func(): model.stop_repeat(definitions.recipes[_recipe()].machine); refresh()))
    machines_text = _text("")
    machines.add_child(machines_text)
    machines.add_child(process_text)
    machines.add_child(_text("Inputs are reserved at the start. Machines run together. Repeating stops if stock or operating funds run out. Timings and prices are game defaults.", 12))
    var underground_tab := _tab(tabs, "Underground")
    underground_tab.add_child(_text("OPTIONAL SCENARIO", 17))
    underground_tab.add_child(_text("An abstract underground business with illegal commodities and scheduled police inspections. Production uses invented feedstock and an invented conversion; it contains no real drug-making process.", 13))
    illegal_toggle.text = "Enable fictional underground operation"
    illegal_toggle.toggled.connect(func(enabled): model.set_underground(enabled); _populate(); refresh())
    underground_tab.add_child(illegal_toggle)
    underground_tab.add_child(suspicion_bar)
    enforcement_text = _text("")
    underground_tab.add_child(enforcement_text)
    underground_tab.add_child(_text("After enabling: the fictional feedstock appears in Stock and the fictional batch appears in Machines. Inspections can confiscate stock, fine the business and close the operation temporarily.", 13))
    underground_tab.add_child(_text("The first version represents the underground site through this panel. Excavation, placed equipment and character gameplay remain future work.", 12))
    layout.add_child(HSeparator.new())
    notice = _text("", 13)
    notice.custom_minimum_size.y = 62
    layout.add_child(notice)
    _populate()
    refresh()

func _text(value: String, size := 14) -> Label:
    var label := Label.new()
    label.text = value
    label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    label.add_theme_font_size_override("font_size", size)
    label.add_theme_color_override("font_color", Color("c6d9d8"))
    return label

func _button(value: String, action: Callable) -> Button:
    var button := Button.new()
    button.text = value
    button.focus_mode = Control.FOCUS_NONE
    button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    button.pressed.connect(action)
    return button

func _tab(tabs: TabContainer, title: String) -> VBoxContainer:
    var scroll := ScrollContainer.new()
    scroll.name = title
    scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
    tabs.add_child(scroll)
    var column := VBoxContainer.new()
    column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    column.add_theme_constant_override("separation", 12)
    scroll.add_child(column)
    return column

func _material() -> String:
    return material_ids[maxi(0, materials.selected)]

func _recipe() -> String:
    return recipe_ids[maxi(0, recipes.selected)]

func _populate() -> void:
    var prior_material := _material() if not material_ids.is_empty() else "sugar_juice"
    var prior_recipe := _recipe() if not recipe_ids.is_empty() else "filter_juice"
    materials.clear()
    recipes.clear()
    material_ids.clear()
    recipe_ids.clear()
    for id in definitions.materials:
        if definitions.materials[id].get("illegal", false) and not model.underground:
            continue
        material_ids.append(id)
        materials.add_item(definitions.materials[id].name)
    for id in definitions.recipes:
        if definitions.recipes[id].get("illegal", false) and not model.underground:
            continue
        recipe_ids.append(id)
        recipes.add_item(definitions.recipes[id].name)
    materials.select(maxi(0, material_ids.find(prior_material)))
    recipes.select(maxi(0, recipe_ids.find(prior_recipe)))

func _contents(contents: Dictionary) -> String:
    var rows: Array[String] = []
    for id in contents:
        rows.append("%.2f g  %s" % [contents[id], definitions.materials[id].name])
    return "\n".join(rows) if rows.size() else "Empty"

func refresh() -> void:
    if model == null or material_ids.is_empty():
        return
    money.text = "%.2f credits   ·   Sales %.2f   ·   Energy %.1f kJ" % [model.cash, model.revenue, model.energy_kj]
    var material: Dictionary = definitions.materials[_material()]
    material_text.text = "%s  ·  %s\nStock %.2f g\nBuy %.2f / 100 g  ·  Sell %.2f / 100 g" % [material.get("formula", "Mixture / product"), material.phase, model.amount(_material()), material.buy * 100, material.sell * 100]
    stock_text.text = _contents(model.stock) + "\n\nUngraded mixtures in storage: %d" % model.stored_mixtures.size()
    var mass := model.total(model.vessel)
    vessel_text.text = "%.2f / 2000 g  ·  %.1f °C\n\n%s\n\nDissolved sugar %.2f g · crystals %.2f g\nDissolved salt %.2f g · crystals %.2f g" % [mass, model.temperature, _contents(model.vessel), model.dissolved("sugar"), model.solids("sugar"), model.dissolved("salt"), model.solids("salt")]
    var recipe: Dictionary = definitions.recipes[_recipe()]
    var machine: Dictionary = definitions.equipment[recipe.machine]
    purchase_button.disabled = model.equipment.has(recipe.machine)
    purchase_button.text = "Machine installed" if purchase_button.disabled else "Buy machine · %.2f credits" % machine.cost
    run_button.text = "Run batch · %.2f" % recipe.cost
    process_text.text = "%s · %s\n%.0f seconds · %.2f credits per batch\n\nINPUT\n%s\n\nOUTPUT\n%s" % [machine.name, "owned" if model.equipment.has(recipe.machine) else "%.2f credits to install" % machine.cost, recipe.seconds, recipe.cost, _contents(recipe.inputs), _contents(recipe.outputs)]
    var machines: Array[String] = []
    for id in model.equipment:
        var state := "idle"
        if model.jobs.has(id):
            var job: Dictionary = model.jobs[id]
            state = "%.1f s left%s" % [float(job.remaining) / definitions.balance.tick_rate, " · auto" if job.repeat else ""]
        machines.append("%s: %s" % [definitions.equipment[id].name, state])
    machines_text.text = "\n".join(machines)
    illegal_toggle.set_pressed_no_signal(model.underground)
    suspicion_bar.value = model.suspicion
    var interval := int(definitions.balance.inspection_seconds * definitions.balance.tick_rate)
    enforcement_text.text = "Suspicion %.1f / 100\nNext inspection in %.0f s\nInspections %d · Fines %.2f credits\n%s" % [model.suspicion, float(interval - model.ticks % interval) / definitions.balance.tick_rate, model.inspections, model.fines, "Closed: %.0f s remaining" % (float(model.closure) / definitions.balance.tick_rate) if model.closure else "Operation available" if model.underground else "Scenario disabled"]
    notice.text = model.message

func _process(delta: float) -> void:
    clock += delta
    if clock >= 0.25:
        clock = 0
        refresh()

func _save() -> void:
    var encoded := JSON.stringify(model.snapshot(), "  ")
    var file := FileAccess.open(save_path + ".tmp", FileAccess.WRITE)
    if file == null:
        model._say("Could not write the workshop save.", false)
    else:
        file.store_string(encoded)
        file.close()
        var error := DirAccess.rename_absolute(save_path + ".tmp", save_path)
        model._say("Workshop saved. The sandbox world is separate." if error == OK else "Could not replace the workshop save.", error == OK)
    refresh()

func _load_save() -> void:
    if not FileAccess.file_exists(save_path):
        model._say("No workshop save yet.", false)
    else:
        var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(save_path))
        if parsed is Dictionary:
            model.restore(parsed)
        else:
            model._say("Could not read this workshop save.", false)
    _populate()
    refresh()
