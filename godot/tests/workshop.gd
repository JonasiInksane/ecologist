extends SceneTree
const Model = preload("res://core/workshop.gd")
var data: Dictionary
var checks := 0
var failures := 0

func check(value: bool, description: String) -> void:
    checks += 1
    if not value:
        failures += 1
        push_error(description)

func near(a: float, b: float) -> bool:
    return absf(a - b) < 0.00001

func mass(model: WorkshopModel) -> float:
    var result := model.total(model.stock) + model.total(model.vessel)
    for batch in model.stored_mixtures:
        result += model.total(batch.components)
    for job in model.jobs.values():
        result += model.total(data.recipes[job.recipe].inputs)
    return result

func elements(contents: Dictionary) -> Dictionary:
    var result := {}
    for id in contents:
        for component in data.materials[id].components:
            result[component] = float(result.get(component, 0)) + float(contents[id]) * float(data.materials[id].components[component])
    return result

func _initialize() -> void:
    call_deferred("run")

func run() -> void:
    data = JSON.parse_string(FileAccess.get_file_as_string("res://data/workshop.json"))
    for id in data.materials:
        var sum := 0.0
        for fraction in data.materials[id].components.values():
            sum += float(fraction)
        check(near(sum, 1), "%s composition adds to 100%%" % id)
    for id in data.recipes:
        var recipe: Dictionary = data.recipes[id]
        var model := Model.new(data)
        check(near(model.total(recipe.inputs), model.total(recipe.outputs)), "%s conserves modeled mass" % id)
        if not recipe.get("illegal", false):
            var before := elements(recipe.inputs)
            var after := elements(recipe.outputs)
            var same := true
            for component in before:
                same = same and near(before[component], after.get(component, 0))
            for component in after:
                same = same and near(after[component], before.get(component, 0))
            check(same, "%s preserves each ingredient" % id)
    var model := Model.new(data)
    var cash := model.cash
    check(not model.buy("water", -100) and model.cash == cash, "Negative purchase cannot generate money")
    check(not model.buy("water", NAN) and model.cash == cash, "Non-finite purchase rejected")
    check(not model.sell("water", 999999) and model.cash == cash, "Overselling cannot generate money")
    check(not model.buy("fictional_feedstock", 100), "Illegal material hidden until opt-in")
    check(model.buy("salt", 50) and near(model.amount("salt"), 150), "Purchase debits cash and credits stock")
    check(model.sell("salt", 50) and near(model.amount("salt"), 100) and model.cash < cash, "Buy/sell spread prevents risk-free purchase profit")
    var initial_mass := mass(model)
    check(not model.start_job("filter_juice") and near(mass(model), initial_mass), "Missing machine rejects batch atomically")
    check(model.purchase_equipment("filter"), "Buy filter press")
    check(not model.purchase_equipment("filter"), "Cannot buy duplicate machine")
    check(model.start_job("filter_juice", true), "Start automatic filtering")
    check(near(mass(model), initial_mass), "Reserved job ingredients remain in total mass")
    check(not model.start_job("filter_juice"), "One job per machine")
    model.step(600)
    check(near(model.amount("sugar_solution"), 1960) and near(model.amount("silt"), 40), "Two automated batches produce solution and sediment")
    check(model.jobs.is_empty(), "Automation stops at exhausted stock")
    check(near(mass(model), initial_mass), "Filtering conserves mass including waste")
    model.purchase_equipment("evaporator")
    model.purchase_equipment("crystallizer")
    model.purchase_equipment("packer")
    check(model.start_job("concentrate"), "Start concentration")
    model.step(480)
    check(near(model.amount("syrup"), 400), "Concentration creates standalone syrup")
    check(model.start_job("crystallize"), "Start crystallization")
    model.step(600)
    check(near(model.amount("sugar"), 450), "Crystallization returns dry sugar")
    check(model.start_job("pack_sugar"), "Package with actual paper stock")
    model.step(240)
    check(near(model.amount("packed_sugar"), 205) and near(mass(model), initial_mass), "Packaging preserves sugar and paper mass")
    check(model.sell("packed_sugar", 205) and model.revenue > 0, "Sell completed sugar product")
    model = Model.new(data)
    initial_mass = mass(model)
    model.purchase_equipment("centrifuge")
    model.start_job("separate_blood")
    model.step(480)
    check(near(model.amount("plasma"), 550) and near(model.amount("blood_cells"), 450), "Blood separates into independently usable components")
    check(near(mass(model), initial_mass), "Blood separation preserves declared model mass")
    check(model.sell("plasma", 100), "Plasma is independently tradable")
    model = Model.new(data)
    initial_mass = mass(model)
    check(model.add_to_vessel("vinegar", 100), "Add vinegar to vessel")
    check(near(model.vessel.water, 95) and near(model.vessel.acetic_acid, 5), "Vinegar expands into water and acetic acid")
    model.add_to_vessel("bicarbonate", 20)
    check(model.react(), "Safe acid-base reaction")
    check(not model.vessel.has("acetic_acid") and model.vessel.bicarbonate > 0, "Limiting acid consumed, excess bicarbonate retained")
    check(model.vessel.acetate > 0 and model.amount("co2") > 0 and near(mass(model), initial_mass), "Reaction retains sodium acetate, water and collected CO2; mass closes")
    var after_reaction := mass(model)
    check(not model.react() and near(mass(model), after_reaction), "Cannot repeatedly generate reaction products")
    check(not model.bottle(), "Unmatched mixture cannot be relabeled as pure product")
    check(not model.distill(), "Cold vessel cannot distill for free")
    model = Model.new(data)
    initial_mass = mass(model)
    model.add_to_vessel("water", 100)
    model.add_to_vessel("sugar", 250)
    check(model.solids("sugar") > 0 and model.dissolved("sugar") > 0, "Sugar can be dissolved and undissolved at once")
    var before_dissolved := model.dissolved("sugar")
    model.change_temperature(80)
    check(model.dissolved("sugar") > before_dissolved and model.energy_kj > 0, "Heating changes solubility and costs energy")
    model.change_temperature(-80)
    check(model.filter_solids() and near(mass(model), initial_mass), "Cooling and filtration recover crystals without losing carrier")
    model.change_temperature(80)
    model.distill()
    model.distill()
    model.filter_solids()
    check(model.vessel.is_empty() and near(mass(model), initial_mass), "Drying recovers all sugar and water")
    model = Model.new(data)
    model.stock.ethanol = 10
    model.add_to_vessel("ethanol", 10)
    model.add_to_vessel("water", 100)
    model.change_temperature(80)
    check(not model.distill(), "Mixed volatile solvents cannot be magically purified")
    model = Model.new(data)
    model.add_to_vessel("blood", 100)
    model.add_to_vessel("water", 100)
    initial_mass = mass(model)
    var mixed_contents := model.vessel.duplicate(true)
    check(not model.bottle() and not model.distill(), "Unknown biological dilution is not relabeled or distilled")
    check(model.store_mixture() and model.vessel.is_empty() and near(mass(model), initial_mass), "Ungraded storage frees a blocked vessel without deleting matter")
    var rack_copy := Model.new(data)
    check(rack_copy.restore(model.snapshot()) and rack_copy.load_mixture() and rack_copy.vessel == mixed_contents, "Stored ungraded composition survives save and reload")
    model = Model.new(data)
    model.add_to_vessel("water", 800)
    model.add_to_vessel("sugar", 200)
    check(model.bottle() and near(model.amount("sugar_solution"), 1000), "Known mixture grade can be independently made and stored")
    model.purchase_equipment("evaporator")
    model.start_job("concentrate", true)
    model.step(33)
    var saved := model.snapshot()
    var loaded := Model.new(data)
    check(loaded.restore(JSON.parse_string(JSON.stringify(saved))), "Save round-trip validates and restores jobs")
    loaded.step(447)
    model.step(447)
    check(loaded.stock == model.stock and loaded.jobs == model.jobs and loaded.cash == model.cash, "Restored jobs finish exactly once with the same result")
    var previous_stock := loaded.stock.duplicate(true)
    saved.cash = -1
    check(not loaded.restore(saved) and loaded.stock == previous_stock, "Invalid save is rejected atomically")
    saved = model.snapshot()
    saved.jobs = {"evaporator":{"recipe":"concentrate","remaining":INF,"repeat":false}}
    check(not loaded.restore(saved) and loaded.stock == previous_stock, "Non-finite saved job rejected")
    model = Model.new(data)
    check(model.set_underground(true), "Explicit opt-in enables fictional industry")
    model.purchase_equipment("underground")
    model.buy("fictional_feedstock", 100)
    check(model.start_job("fictional_batch"), "Fictional batch uses only invented feedstock")
    check(not model.set_underground(false), "Cannot disable a running illicit scenario to escape consequences")
    model.step(2700)
    check(near(model.amount("cocaine"), 60) and near(model.amount("fictional_waste"), 40), "Fictional batch yields commodity and tracked waste")
    check(model.sell("cocaine", 20) and model.suspicion > 0, "Fictional sales raise abstract suspicion")
    model.step(8100)
    check(model.inspections == 1 and model.amount("cocaine") == 0 and model.amount("fictional_waste") == 0, "Scheduled inspection confiscates illegal stock")
    check(model.closure > 0 and model.fines > 0, "Inspection fines and temporarily closes operation")
    check(not model.start_job("fictional_batch"), "Closure blocks new illegal production")
    check(model.purchase_equipment("filter") and model.start_job("filter_juice"), "Legal production remains available during underground closure")
    model.step(1800)
    check(model.closure == 0, "Temporary closure expires with simulation time")
    print("Workshop: %d checks, %d failures" % [checks, failures])
    quit(1 if failures else 0)
