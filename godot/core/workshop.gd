class_name WorkshopModel
extends RefCounted
## Pure, fixed-step workshop state. The caller owns file I/O and presentation.

const EPS := 0.000001
var data: Dictionary
var stock: Dictionary = {}
var vessel: Dictionary = {}
var stored_mixtures: Array = []
var cash := 0.0
var temperature := 20.0
var energy_kj := 0.0
var equipment: Array = []
var jobs: Dictionary = {}
var ticks := 0
var underground := false
var suspicion := 0.0
var closure := 0
var inspections := 0
var fines := 0.0
var revenue := 0.0
var spent := 0.0
var message := "Buy a filter press, then clarify your starting sugar juice."
var history: Array = []

func _init(definitions: Dictionary) -> void:
    data = definitions.duplicate(true)
    stock = data.initial_stock.duplicate(true)
    cash = float(data.balance.starting_cash)

func _say(text: String, success := true) -> bool:
    message = text
    history.push_front(text)
    if history.size() > 12:
        history.resize(12)
    return success

func amount(id: String) -> float:
    return float(stock.get(id, 0.0))

func total(contents: Dictionary) -> float:
    var result := 0.0
    for value in contents.values():
        result += float(value)
    return result

func _add(contents: Dictionary, id: String, grams: float) -> void:
    contents[id] = float(contents.get(id, 0.0)) + grams
    if absf(float(contents[id])) < EPS:
        contents.erase(id)

func _quantity(grams: float) -> bool:
    return is_finite(grams) and grams > EPS and grams <= 1000000

func _allowed(id: String) -> bool:
    return data.materials.has(id) and (underground or not data.materials[id].get("illegal", false))

func buy(id: String, grams: float) -> bool:
    if not _allowed(id) or not _quantity(grams) or float(data.materials[id].buy) <= 0:
        return _say("That purchase is unavailable.", false)
    var cost := grams * float(data.materials[id].buy)
    if cash + EPS < cost:
        return _say("Not enough cash for that purchase.", false)
    cash = maxf(0, cash - cost)
    spent += cost
    _add(stock, id, grams)
    return _say("Bought %.1f g %s for %.2f credits." % [grams, data.materials[id].name, cost])

func sell(id: String, grams: float) -> bool:
    if not _allowed(id) or not _quantity(grams) or amount(id) + EPS < grams or float(data.materials[id].sell) <= 0:
        return _say("There is not enough saleable stock.", false)
    if data.materials[id].get("illegal", false) and closure > 0:
        return _say("The underground operation is temporarily closed.", false)
    var price := grams * float(data.materials[id].sell)
    _add(stock, id, -grams)
    cash += price
    revenue += price
    if data.materials[id].get("illegal", false):
        suspicion = minf(100, suspicion + float(data.balance.suspicion_per_sale))
    return _say("Sold %.1f g %s for %.2f credits." % [grams, data.materials[id].name, price])

func purchase_equipment(id: String) -> bool:
    if not data.equipment.has(id) or equipment.has(id):
        return _say("That machine is already owned or unavailable.", false)
    var entry: Dictionary = data.equipment[id]
    if entry.get("illegal", false) and not underground:
        return _say("Enable the optional underground scenario first.", false)
    var cost := float(entry.cost)
    if cash + EPS < cost:
        return _say("Not enough cash for that machine.", false)
    cash -= cost
    spent += cost
    equipment.append(id)
    return _say("Installed %s." % entry.name)

func start_job(id: String, repeat := false) -> bool:
    if not data.recipes.has(id):
        return _say("Unknown process.", false)
    var recipe: Dictionary = data.recipes[id]
    var machine: String = recipe.machine
    if not equipment.has(machine) or jobs.has(machine):
        return _say("Install the required machine and wait until it is idle.", false)
    if recipe.get("illegal", false) and (not underground or closure > 0):
        return _say("The underground operation is unavailable.", false)
    if cash + EPS < float(recipe.cost):
        return _say("Not enough cash for the operating cost.", false)
    for material in recipe.inputs:
        if amount(material) + EPS < float(recipe.inputs[material]):
            return _say("Need %.1f g %s." % [recipe.inputs[material], data.materials[material].name], false)
    for material in recipe.inputs:
        _add(stock, material, -float(recipe.inputs[material]))
    cash -= float(recipe.cost)
    spent += float(recipe.cost)
    jobs[machine] = {"recipe":id,"remaining":int(round(float(recipe.seconds)*data.balance.tick_rate)),"repeat":repeat}
    return _say("Started %s." % recipe.name)

func stop_repeat(machine: String) -> void:
    if jobs.has(machine):
        jobs[machine].repeat = false
        _say("The current batch will finish; automatic repetition is off.")

func set_underground(enabled: bool) -> bool:
    if not enabled:
        if closure > 0 or jobs.has("underground") or suspicion > EPS:
            return _say("Resolve the active underground operation before disabling it.", false)
        for id in stock:
            if data.materials[id].get("illegal", false) and amount(id) > EPS:
                return _say("Illegal stock remains in the operation.", false)
    underground = enabled
    return _say("Fictional underground scenario enabled." if enabled else "Legal workshop scenario enabled.")

func step(count := 1) -> void:
    for _i in clampi(count, 0, 36000):
        ticks += 1
        closure = maxi(0, closure - 1)
        var illegal_running := jobs.has("underground")
        for machine in jobs.keys():
            var job: Dictionary = jobs[machine]
            job.remaining = int(job.remaining) - 1
            if int(job.remaining) <= 0:
                var recipe: Dictionary = data.recipes[job.recipe]
                for id in recipe.outputs:
                    _add(stock, id, float(recipe.outputs[id]))
                jobs.erase(machine)
                _say("Finished %s. Products are in stock." % recipe.name)
                if job.repeat:
                    start_job(job.recipe, true)
        if underground:
            var rate: float = data.balance.suspicion_per_second if illegal_running else -data.balance.suspicion_decay_per_second
            suspicion = clampf(suspicion + rate / float(data.balance.tick_rate), 0, 100)
            if ticks % int(data.balance.inspection_seconds * data.balance.tick_rate) == 0:
                inspect_operation()

func inspect_operation() -> void:
    if not underground:
        return
    inspections += 1
    var seized := 0.0
    for id in stock.keys():
        if data.materials[id].get("illegal", false):
            seized += amount(id)
            stock.erase(id)
    if jobs.has("underground"):
        seized += total(data.recipes[jobs.underground.recipe].inputs)
        jobs.erase("underground")
    if seized > EPS or suspicion >= 20:
        var fine := minf(cash, float(data.balance.fine))
        cash -= fine
        fines += fine
        suspicion = maxf(0, suspicion - 25)
        closure = int(data.balance.closure_seconds * data.balance.tick_rate)
        _say("Inspection: %.1f g confiscated, %.2f credits fined. Underground operation closed for %d seconds." % [seized, fine, data.balance.closure_seconds])
    else:
        _say("Inspection complete. No violation found in the fictional scenario.")

func add_to_vessel(id: String, grams: float) -> bool:
    if not _allowed(id) or not _quantity(grams) or amount(id) + EPS < grams:
        return _say("Not enough of that ingredient in stock.", false)
    var entry: Dictionary = data.materials[id]
    if entry.phase in ["packaging", "package", "fictional"]:
        return _say("That item is not a laboratory ingredient.", false)
    var before := total(vessel)
    if before + grams > float(data.balance.vessel_capacity_g) + EPS:
        return _say("The 2 kg vessel is full.", false)
    temperature = (temperature * before + 20.0 * grams) / (before + grams)
    _add(stock, id, -grams)
    for component in entry.components:
        _add(vessel, component, grams * float(entry.components[component]))
    return _say("Added %.1f g %s to the vessel." % [grams, entry.name])

func dissolved(id: String) -> float:
    var water := float(vessel.get("water", 0.0))
    var ratio := 1.8 + 0.01 * temperature + 0.00018 * temperature * temperature if id == "sugar" else 0.35 + 0.0003 * temperature
    return minf(float(vessel.get(id, 0.0)), water * ratio)

func solids(id: String) -> float:
    return maxf(0, float(vessel.get(id, 0.0)) - dissolved(id))

func react() -> bool:
    var reaction: Dictionary = data.reaction
    var extent := INF
    for id in reaction.reactants:
        extent = minf(extent, float(vessel.get(id, 0.0)) / float(reaction.reactants[id]))
    if extent < EPS or float(vessel.get("water", 0.0)) <= EPS:
        return _say("This reaction needs acetic acid, sodium bicarbonate and water in the vessel.", false)
    for id in reaction.reactants:
        _add(vessel, id, -extent * float(reaction.reactants[id]))
    for id in reaction.products:
        # CO₂ is retained in a collection reservoir, not silently destroyed.
        _add(stock if id == "co2" else vessel, id, extent * float(reaction.products[id]))
    return _say("Reaction complete: sodium acetate, water and collected carbon dioxide. Excess ingredients remain.")

func change_temperature(delta: float) -> bool:
    if not is_finite(delta) or total(vessel) < EPS:
        return _say("Add ingredients to the vessel first.", false)
    var target := clampf(temperature + delta, 0, 100)
    # Explicit uniform heat-capacity approximation, including paid active cooling.
    var energy := absf(target - temperature) * total(vessel) * 4.18 / 1000.0
    var cost := energy * float(data.balance.energy_price_per_kj)
    if cash + EPS < cost:
        return _say("Not enough cash for heating or cooling.", false)
    cash -= cost
    spent += cost
    energy_kj += energy
    temperature = target
    return _say("Vessel is now %.1f °C. Solubility estimates updated." % temperature)

func distill() -> bool:
    if temperature < 100 or float(vessel.get("water", 0.0)) < EPS:
        return _say("Heat a water-containing vessel to 100 °C first (simplified model).", false)
    # Volatile co-solvents need a different separation model; never purify them magically.
    for id in vessel:
        if id not in ["water", "sugar", "salt", "sand", "silt", "acetate", "bicarbonate"]:
            return _say("This simple water-recovery process does not support that mixture.", false)
    var grams := minf(float(vessel.water), float(data.balance.distill_parcel_g))
    var energy := grams * 2.257
    var cost := energy * float(data.balance.energy_price_per_kj)
    if cash + EPS < cost:
        return _say("Not enough cash for evaporation.", false)
    cash -= cost
    spent += cost
    energy_kj += energy
    _add(vessel, "water", -grams)
    _add(stock, "water", grams)
    return _say("Recovered %.1f g condensed water. Dissolved ingredients stay in the vessel." % grams)

func filter_solids() -> bool:
    var recovered := 0.0
    for id in ["sugar", "salt", "sand", "silt"]:
        var grams := solids(id) if id in ["sugar", "salt"] else float(vessel.get(id, 0.0))
        if grams > EPS:
            _add(vessel, id, -grams)
            _add(stock, id, grams)
            recovered += grams
    return _say("Filtered %.2f g solids into stock. Dissolved ingredients remain." % recovered, recovered > EPS)

func bottle() -> bool:
    var mass := total(vessel)
    if mass < EPS:
        return _say("The vessel is empty.", false)
    # Only known compositions can receive a catalog label. No arbitrary purity upgrade.
    for id in data.materials:
        var entry: Dictionary = data.materials[id]
        if entry.phase in ["packaging", "package", "fictional"]:
            continue
        var components: Dictionary = entry.components
        var matches := true
        for component in vessel:
            if absf(float(vessel[component]) / mass - float(components.get(component, 0))) > EPS:
                matches = false
        for component in components:
            if absf(float(vessel.get(component, 0)) / mass - float(components[component])) > EPS:
                matches = false
        if matches:
            _add(stock, id, mass)
            vessel.clear()
            temperature = 20
            return _say("Stored %.1f g %s. Composition is unchanged." % [mass, entry.name])
    return _say("This mixture has no catalog grade yet. Separate it or adjust its composition before storing.", false)

func store_mixture() -> bool:
    if total(vessel) < EPS or stored_mixtures.size() >= 100:
        return _say("The vessel is empty or the 100-batch mixture rack is full.", false)
    stored_mixtures.append({"components":vessel.duplicate(true), "temperature":temperature})
    vessel.clear()
    temperature = 20
    return _say("Stored an ungraded batch with all its ingredients. The vessel is ready to use again.")

func load_mixture() -> bool:
    if not vessel.is_empty() or stored_mixtures.is_empty():
        return _say("Empty the vessel first and keep at least one stored mixture.", false)
    var batch: Dictionary = stored_mixtures.pop_back()
    vessel = batch.components.duplicate(true)
    temperature = float(batch.temperature)
    return _say("Returned the latest stored mixture to the vessel, with its composition intact.")

func snapshot() -> Dictionary:
    return {"version":1,"stock":stock.duplicate(true),"vessel":vessel.duplicate(true),"stored_mixtures":stored_mixtures.duplicate(true),"cash":cash,
        "temperature":temperature,"energy_kj":energy_kj,"equipment":equipment.duplicate(),"jobs":jobs.duplicate(true),
        "ticks":ticks,"underground":underground,"suspicion":suspicion,"closure":closure,"inspections":inspections,
        "fines":fines,"revenue":revenue,"spent":spent,"history":history.duplicate()}

func _valid_amounts(value: Variant) -> bool:
    if not value is Dictionary:
        return false
    for id in value:
        if not data.materials.has(id) or not (value[id] is float or value[id] is int):
            return false
        if not is_finite(float(value[id])) or float(value[id]) < 0 or float(value[id]) > 1000000000:
            return false
    return true

func restore(state: Dictionary) -> bool:
    # Validate everything before replacing any live state.
    if state.get("version") != 1 or not _valid_amounts(state.get("stock")) or not _valid_amounts(state.get("vessel")):
        return _say("The workshop save is invalid or from another version.", false)
    for key in ["cash", "temperature", "energy_kj", "ticks", "suspicion", "closure", "inspections", "fines", "revenue", "spent"]:
        if not state.has(key) or not (state[key] is int or state[key] is float) or not is_finite(float(state[key])) or float(state[key]) < 0 or float(state[key]) > 1000000000:
            return _say("The workshop save has invalid numbers.", false)
    if state.temperature > 100 or state.suspicion > 100 or total(state.vessel) > data.balance.vessel_capacity_g or not state.get("underground") is bool:
        return _say("The workshop save is outside the model limits.", false)
    if not state.get("equipment") is Array or not state.get("jobs") is Dictionary or not state.get("history") is Array:
        return _say("The workshop save is incomplete.", false)
    if not state.get("stored_mixtures") is Array or state.stored_mixtures.size() > 100:
        return _say("The saved mixture rack is invalid.", false)
    for batch in state.stored_mixtures:
        if not batch is Dictionary or not _valid_amounts(batch.get("components")) or total(batch.components) > data.balance.vessel_capacity_g:
            return _say("A stored mixture is invalid.", false)
        if not (batch.get("temperature") is int or batch.get("temperature") is float) or not is_finite(float(batch.temperature)) or batch.temperature < 0 or batch.temperature > 100:
            return _say("A stored mixture has an invalid temperature.", false)
        for id in batch.components:
            if data.materials[id].phase in ["package", "packaging", "fictional"]:
                return _say("A stored mixture contains unsupported items.", false)
    for id in state.equipment:
        if not data.equipment.has(id):
            return _say("The save contains unknown equipment.", false)
    for machine in state.jobs:
        var job: Variant = state.jobs[machine]
        if not job is Dictionary or not state.equipment.has(machine) or not data.recipes.has(job.get("recipe")) or not job.get("repeat") is bool:
            return _say("The save contains an invalid job.", false)
        var recipe: Dictionary = data.recipes[job.recipe]
        if recipe.machine != machine or not (job.get("remaining") is float or job.get("remaining") is int):
            return _say("The saved machine assignment is invalid.", false)
        if not is_finite(float(job.remaining)) or job.remaining <= 0 or job.remaining > recipe.seconds * data.balance.tick_rate:
            return _say("The saved job duration is invalid.", false)
        if recipe.get("illegal", false) and not state.underground:
            return _say("The saved scenario does not allow that job.", false)
    for id in state.vessel:
        if data.materials[id].phase in ["package", "packaging", "fictional"]:
            return _say("The saved vessel contains unsupported items.", false)
    stock = state.stock.duplicate(true)
    vessel = state.vessel.duplicate(true)
    stored_mixtures = state.stored_mixtures.duplicate(true)
    cash = float(state.cash)
    temperature = float(state.temperature)
    energy_kj = float(state.energy_kj)
    equipment = state.equipment.duplicate()
    jobs = state.jobs.duplicate(true)
    ticks = int(state.ticks)
    underground = state.underground
    suspicion = float(state.suspicion)
    closure = int(state.closure)
    inspections = int(state.inspections)
    fines = float(state.fines)
    revenue = float(state.revenue)
    spent = float(state.spent)
    history = []
    for entry in state.history.slice(0, 12):
        if entry is String:
            history.append(entry.left(300))
    return _say("Workshop loaded. Queued batches resume from their saved progress.")
