class_name LogisticsModel
extends RefCounted
## The game clock, laptop orders and the trucks at the curb (M2). Pure and fixed-step like WorkshopModel: it pays
## and stocks through the workshop model it is given, and shop_panel.gd connects the tanker to the world.

const EPS := 0.000001
var data: Dictionary
var workshop: WorkshopModel
var kit: Dictionary = {}
var minute := 0.0
var next_id := 1
var orders: Array = []
var truck: Dictionary = {}
var departed: Dictionary = {}
var crates: Dictionary = {}
var message := ""
var said := 0
var history: Array = []

func _init(definitions: Dictionary, model: WorkshopModel, kit_items: Array) -> void:
    data = definitions.duplicate(true)
    workshop = model
    for item in kit_items:
        kit[item.id] = item
    minute = float(data.start_minute)

func _say(text: String, success := true) -> bool:
    message = text
    said += 1
    history.push_front(text)
    if history.size() > 12:
        history.resize(12)
    return success

func _tick_rate() -> float:
    return float(workshop.data.balance.tick_rate)

static func clock_text(at: float) -> String:
    var whole := int(floor(at))
    return "Day %d · %02d:%02d" % [whole / 1440 + 1, whole % 1440 / 60, whole % 60]

static func span_text(minutes: float) -> String:
    var whole := maxi(0, ceili(minutes))
    return "%d:%02d" % [whole / 60, whole % 60]

func supplier(id: String) -> Dictionary:
    for entry in data.suppliers:
        if entry.id == id:
            return entry
    return {}

func offer(supplier_id: String, index: int) -> Dictionary:
    var entry := supplier(supplier_id)
    if entry.is_empty() or index < 0 or index >= entry.items.size():
        return {}
    return entry.items[index]

func item_name(item: Dictionary) -> String:
    if item.kind == "crate":
        return String(kit[item.id].name) if kit.has(item.id) else String(item.id)
    var materials: Dictionary = workshop.data.materials
    return String(materials[item.id].name) if materials.has(item.id) else String(item.id)

# "2 × 25 kg sack sugar beets", or "1 Jacketed kettle · 60 L crate".
func describe(item: Dictionary, count: int) -> String:
    if item.kind == "crate":
        return "%d %s crate%s" % [count, item_name(item), "" if count == 1 else "s"]
    return "%d × %s %s" % [count, item.unit, item_name(item).to_lower()]

func price(item: Dictionary) -> float:
    if item.has("price"):
        return float(item.price)
    if item.kind == "crate":
        return float(kit[item.id].cost) if kit.has(item.id) else INF
    var materials: Dictionary = workshop.data.materials
    return float(item.unit_g) * float(materials[item.id].buy) if materials.has(item.id) else INF

func order(supplier_id: String, index: int, count: int) -> bool:
    var entry := supplier(supplier_id)
    var item := offer(supplier_id, index)
    if item.is_empty():
        return _say("That is not on offer.", false)
    if count < int(item.get("min", 1)) or count > int(item.get("max", 1)):
        return _say("Order between %d and %d." % [int(item.get("min", 1)), int(item.get("max", 1))], false)
    if orders.size() >= int(data.max_orders):
        return _say("Too many deliveries on the way already.", false)
    var cost := price(item) * count
    if not is_finite(cost) or workshop.cash + EPS < cost:
        return _say("Not enough credits for that order (%.2f)." % cost, false)
    workshop.cash = maxf(0.0, workshop.cash - cost)
    workshop.spent += cost
    var due := minute + float(entry.lead_minutes)
    orders.append({"id": next_id, "supplier": supplier_id, "index": index, "item": item.id, "kind": item.kind,
        "vehicle": item.vehicle, "count": count, "grams": float(item.get("unit_g", 0)) * count, "cost": cost, "due": due})
    next_id += 1
    return _say("Ordered %s from %s for %.2f credits. Due %s." % [describe(item, count), entry.name, cost, clock_text(due)])

func step(count := 1) -> void:
    for _i in clampi(count, 0, 36000):
        minute += float(data.minutes_per_second) / _tick_rate()
        if truck.is_empty():
            _arrive()
        elif minute > float(truck.arrived) + float(data.wait_minutes):
            var from: String = supplier(truck.supplier).name
            var refund := _depart()
            _say("%s gave up waiting and left. %s" % [from, refund] if not refund.is_empty() else "%s left." % from)

func _arrive() -> void:
    var next := -1
    for i in orders.size():
        if float(orders[i].due) <= minute and (next < 0 or float(orders[i].due) < float(orders[next].due)):
            next = i
    if next < 0:
        return
    truck = orders[next].duplicate(true)
    orders.remove_at(next)
    truck.arrived = minute
    truck.delivered = 0.0
    truck.blocked = 0
    var from: String = supplier(truck.supplier).name
    if truck.vehicle == "tanker":
        _say("The %s tanker is at the curb. It pumps into a fill coupling by the road." % from)
    else:
        _say("The %s van is at the curb. Walk over and click it to unload." % from)

func value_left() -> float:
    if truck.is_empty():
        return 0.0
    if truck.vehicle == "tanker" and float(truck.grams) > 0:
        return float(truck.cost) * maxf(0.0, 1.0 - float(truck.delivered) / float(truck.grams))
    return float(truck.cost)

# The truck leaves; whatever it still carries goes back for the return fee. Returns what was refunded, as text.
func _depart() -> String:
    var value := value_left()
    departed = {"vehicle": truck.vehicle, "at": minute}
    truck = {}
    if value <= EPS:
        return ""
    var fee := minf(value, maxf(float(data.return_fee.minimum), float(data.return_fee.share) * value))
    workshop.cash += value - fee
    return "It took back %.2f credits of goods: %.2f refunded after a %.2f return fee." % [value, value - fee, fee]

func unload() -> bool:
    if truck.is_empty() or truck.vehicle != "van":
        return _say("There is no van to unload.", false)
    var item := offer(truck.supplier, int(truck.index))
    if truck.kind == "crate":
        crates[truck.item] = int(crates.get(truck.item, 0)) + int(truck.count)
        _say("Unloaded %d %s crate%s. Place %s from the kitchen kit (K)." % [int(truck.count), item_name(item).to_lower(),
            "" if int(truck.count) == 1 else "s", "it" if int(truck.count) == 1 else "them"])
    else:
        workshop.store(truck.item, float(truck.grams))
        _say("Unloaded %s into stock." % describe(item, int(truck.count)))
    truck.cost = 0.0
    _depart()
    return true

func tanker_here() -> bool:
    return not truck.is_empty() and truck.vehicle == "tanker"

func tanker_want() -> float:
    return clampf(float(truck.grams) - float(truck.delivered), 0.0, float(data.tanker_rate_g)) if tanker_here() else 0.0

# Called every tick while a tanker waits: coupled says whether a fill coupling stands at the curb, added how many
# grams went into it. A coupling that takes nothing for tanker_blocked_seconds ends the delivery.
func tanker_report(coupled: bool, added: float) -> void:
    if not tanker_here() or not coupled:
        return
    if added > EPS:
        truck.delivered = float(truck.delivered) + added
        truck.blocked = 0
    else:
        truck.blocked = int(truck.blocked) + 1
    var from: String = supplier(truck.supplier).name
    if float(truck.delivered) >= float(truck.grams) - 1.0:
        var litres := float(truck.delivered) / 1000.0
        truck.cost = 0.0
        _depart()
        _say("%s pumped %.0f L of sea water into your coupling and left." % [from, litres])
    elif int(truck.blocked) >= int(float(data.tanker_blocked_seconds) * _tick_rate()):
        var litres := float(truck.delivered) / 1000.0
        _say("Your coupling stopped taking water after %.0f L, so %s left. %s" % [litres, from, _depart()])

func status() -> String:
    if tanker_here():
        return "Tanker at the curb · %.0f of %.0f L" % [float(truck.delivered) / 1000.0, float(truck.grams) / 1000.0]
    if not truck.is_empty():
        return "Van at the curb · leaves in %s" % span_text(float(truck.arrived) + float(data.wait_minutes) - minute)
    var next := -1
    for i in orders.size():
        if next < 0 or float(orders[i].due) < float(orders[next].due):
            next = i
    if next < 0:
        return ""
    var due := clock_text(orders[next].due)
    return "%s %s due %s" % [supplier(orders[next].supplier).short, orders[next].vehicle, due.substr(due.find("·") + 2)]

func take_crate(id: String) -> bool:
    if int(crates.get(id, 0)) <= 0:
        return false
    crates[id] = int(crates[id]) - 1
    if int(crates[id]) == 0:
        crates.erase(id)
    return true

func return_crate(id: String) -> void:
    crates[id] = int(crates.get(id, 0)) + 1

func snapshot() -> Dictionary:
    return {"version": 1, "minute": minute, "next_id": next_id, "orders": orders.duplicate(true), "truck": truck.duplicate(true),
        "crates": crates.duplicate(true), "history": history.duplicate()}

func _number(value: Variant, low: float, high: float) -> bool:
    return (value is int or value is float) and is_finite(float(value)) and float(value) >= low and float(value) <= high

func _valid_order(entry: Variant, at_curb: bool) -> bool:
    if not entry is Dictionary:
        return false
    var item := offer(String(entry.get("supplier", "")), int(entry.get("index", -1))) if _number(entry.get("index"), 0, 99) else {}
    if item.is_empty() or entry.get("item") != item.id or entry.get("kind") != item.kind or entry.get("vehicle") != item.vehicle:
        return false
    if not _number(entry.get("id"), 1, 1e9) or not _number(entry.get("count"), 1, 1000) or not _number(entry.get("grams"), 0, 1e8):
        return false
    if not _number(entry.get("cost"), 0, 1e9) or not _number(entry.get("due"), 0, 1e9):
        return false
    return not at_curb or (_number(entry.get("arrived"), 0, 1e9) and _number(entry.get("delivered"), 0, 1e8) and _number(entry.get("blocked"), 0, 1e6))

func restore(state: Dictionary) -> bool:
    # Validate everything before replacing any live state.
    if state.get("version") != 1 or not _number(state.get("minute"), 0, 1e9) or not _number(state.get("next_id"), 1, 1e9):
        return _say("The delivery save is invalid or from another version.", false)
    if not state.get("orders") is Array or state.orders.size() > int(data.max_orders) or not state.get("truck") is Dictionary:
        return _say("The delivery save is incomplete.", false)
    for entry in state.orders:
        if not _valid_order(entry, false):
            return _say("The delivery save has an invalid order.", false)
    if not state.truck.is_empty() and not _valid_order(state.truck, true):
        return _say("The delivery save has an invalid truck.", false)
    if not state.get("crates") is Dictionary or not state.get("history") is Array:
        return _say("The delivery save is incomplete.", false)
    for id in state.crates:
        if not kit.has(id) or not kit[id].get("crate", false) or not _number(state.crates[id], 1, 1000):
            return _say("The delivery save has unknown crates.", false)
    minute = float(state.minute)
    next_id = int(state.next_id)
    orders = state.orders.duplicate(true)
    truck = state.truck.duplicate(true)
    departed = {}
    crates = {}
    for id in state.crates:
        crates[id] = int(state.crates[id])
    history = []
    for entry in state.history.slice(0, 12):
        if entry is String:
            history.append(entry.left(300))
    return _say("Deliveries loaded.")
