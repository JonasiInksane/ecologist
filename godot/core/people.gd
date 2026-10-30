class_name PeopleModel
extends RefCounted
## Pure, fixed-step state of the town around the plot (M3): passers-by on the street, the customer at the door,
## promised orders and each customer's reputation. The caller passes the game clock (from LogisticsModel) and the
## real seconds of each step; positions are in cells along the ground row. Selling takes stock from and pays into
## the WorkshopModel.

const GRADES := ["A", "B", "C"]
const REPUTATION := Vector2(-3, 5)

var data: Dictionary
var workshop: WorkshopModel
var rng := RandomNumberGenerator.new()
var walkers: Array = []
var visitor: Dictionary = {}
var queue: Array = []
var orders: Array = []
var reputation: Dictionary = {}
var cooldown: Dictionary = {}
var served: Dictionary = {}
var last_hour := -1
var first_done := false
var minute := 0.0
var next_id := 1
var message := ""
var said := 0

func _init(definitions: Dictionary, model: WorkshopModel, seed := 7) -> void:
    data = definitions
    workshop = model
    rng.seed = seed

func _say(text: String, success := true) -> bool:
    message = text
    said += 1
    return success

func customer(id: String) -> Dictionary:
    for entry in data.customers:
        if entry.id == id:
            return entry
    return {}

func product_name(product: String) -> String:
    return String(data.products[product].name)

static func in_hours(hours: Array, hour: int) -> bool:
    var from := int(hours[0]) % 24
    var to := int(hours[1]) % 24
    if from == to:
        return true
    return hour >= from and hour < to if from < to else hour >= from or hour < to

static func better(grade: String, than: String) -> bool:
    return GRADES.find(grade) < GRADES.find(than)

# Grams in stock of each grade of a product.
func stock_for(product: String) -> Dictionary:
    var result := {}
    var grades: Dictionary = data.products[product].grades
    for grade in GRADES:
        if grades.has(grade):
            result[grade] = workshop.amount(grades[grade])
    return result

func rep(id: String) -> float:
    return float(reputation.get(id, 0.0))

func _change_rep(id: String, by: float) -> void:
    reputation[id] = clampf(rep(id) + by, REPUTATION.x, REPUTATION.y)

# What the visitor pays for their request in a grade: the stock sell price times what they pay, more with
# reputation, and a tip for a better grade than they asked for.
func price(grade: String) -> float:
    var material: String = data.products[visitor.product].grades[grade]
    var each := float(workshop.data.materials[material].sell) * float(visitor.pays) * (1.0 + float(data.reputation_bonus) * maxf(0.0, rep(visitor.customer)))
    var tip := 1.0 + float(data.better_tip) if better(grade, String(visitor.grade)) else 1.0
    return float(visitor.grams) * each * tip

func line(id: String, kind: String) -> String:
    var lines: Array = customer(id).get("lines", {}).get(kind, [])
    return "" if lines.is_empty() else String(lines[rng.randi() % lines.size()])

# One step: the hourly knocks, promised orders coming due, the next visitor, passers-by, and walking.
func step(now: float, seconds: float) -> void:
    var before := minute
    minute = now
    var hour := int(floor(now / 60.0))
    if hour != last_hour:
        if last_hour >= 0:
            _roll_visits(hour % 24)
        last_hour = hour
    var first: Dictionary = data.get("first_visit", {})
    if not first_done and not first.is_empty() and now >= float(first.minute):
        first_done = true
        _enqueue(String(first.customer), false)
    for order in orders:
        if not order.get("called", false) and now >= float(order.due):
            order.called = true
            _enqueue(String(order.customer), true)
    if visitor.is_empty() and not queue.is_empty():
        _arrive(queue.pop_front())
    var rate := float(data.traffic[int(fmod(now / 60.0, 24.0))])
    if before > 0.0 and now > before and rng.randf() < rate * (now - before) / 60.0:
        _spawn_passer(int(fmod(now / 60.0, 24.0)))
    _walk(seconds)

func _enqueue(id: String, order: bool) -> void:
    if (not visitor.is_empty() and visitor.customer == id) or queue.any(func(entry): return entry.customer == id):
        return
    queue.append({"customer": id, "order": order})

func _roll_visits(hour: int) -> void:
    for entry in data.customers:
        var id: String = entry.id
        if not in_hours(entry.hours, hour) or minute < float(cooldown.get(id, -1.0)):
            continue
        if orders.any(func(order): return order.customer == id):
            continue
        var chance := float(data.visit_chance) * (1.0 + float(data.reputation_visits) * rep(id))
        var stock := stock_for(entry.wants.product)
        for grade in stock:
            if not better(entry.wants.grade, grade) and stock[grade] >= float(entry.wants.grams[0]):
                chance *= float(data.stock_visits)
                break
        if rng.randf() < chance:
            cooldown[id] = minute + float(data.cooldown_minutes)
            _enqueue(id, false)

func _arrive(entry: Dictionary) -> void:
    var id: String = entry.customer
    var who := customer(id)
    if who.is_empty():
        return
    var request := {}
    if entry.order:
        for order in orders:
            if order.customer == id:
                request = order
                break
        if request.is_empty():
            return
    else:
        var grams := float(rng.randi_range(int(who.wants.grams[0]) / 50, int(who.wants.grams[1]) / 50) * 50)
        request = {"product": who.wants.product, "grams": grams, "grade": who.wants.grade, "pays": float(who.pays)}
    visitor = {"customer": id, "name": who.name, "look": int(who.look), "x": float(data.street.east_x), "dir": -1,
        "phase": "arrive", "order": entry.order, "product": request.product, "grams": float(request.grams),
        "grade": request.grade, "pays": float(request.pays), "since": minute, "line": line(id, "hello")}

func _spawn_passer(hour: int) -> void:
    var choices: Array = data.passers.filter(func(entry): return in_hours(entry.hours, hour))
    if choices.is_empty():
        return
    var who: Dictionary = choices[rng.randi() % choices.size()]
    if walkers.any(func(walker): return walker.name == who.name):
        return
    var turn: Array = data.street.turn_x
    walkers.append({"id": next_id, "name": who.name, "look": int(who.look), "kind": who.kind,
        "dog": int(who.get("dog", -1)), "x": float(data.street.east_x), "dir": -1,
        "turn": rng.randf_range(float(turn[0]), float(turn[1])), "pause": 0.0,
        "line": String(who.lines[rng.randi() % who.lines.size()])})
    next_id += 1

func _speed(kind: String) -> float:
    return float(data.street.jog_speed) if kind == "jog" else float(data.street.walk_speed)

func _walk(seconds: float) -> void:
    var east := float(data.street.east_x)
    for walker in walkers:
        if walker.pause > 0.0:
            walker.pause -= seconds
            continue
        walker.x += walker.dir * _speed(walker.kind) * seconds
        if walker.dir < 0 and walker.x <= walker.turn:
            walker.x = walker.turn
            walker.dir = 1
            walker.pause = 0.6 if walker.kind == "jog" else rng.randf_range(1.0, 3.0)
    walkers = walkers.filter(func(walker): return walker.dir < 0 or walker.x < east + 1.0)
    if visitor.is_empty():
        return
    var door := float(data.street.door_x)
    match visitor.phase:
        "arrive":
            visitor.x = maxf(door, visitor.x - _speed("walk") * seconds)
            if visitor.x <= door:
                visitor.phase = "knock"
                visitor.since = minute
                _say("Knock knock. %s is at the door." % visitor.name)
        "knock":
            if minute - float(visitor.since) > float(customer(visitor.customer).patience):
                _leave("late" if visitor.order else "waited", -2.0 if visitor.order else -0.25)
        "leave":
            visitor.x += _speed("walk") * seconds
            if visitor.x >= east + 1.0:
                visitor = {}

func knocking() -> bool:
    return not visitor.is_empty() and visitor.phase == "knock"

func _leave(kind: String, by: float) -> void:
    var id: String = visitor.customer
    _change_rep(id, by)
    if visitor.order:
        orders = orders.filter(func(order): return order.customer != id)
    visitor.phase = "leave"
    visitor.dir = 1
    visitor.line = line(id, kind)
    cooldown[id] = maxf(float(cooldown.get(id, -1.0)), minute + float(data.cooldown_minutes))
    var said_line: String = visitor.line
    _say("%s: \"%s\"" % [visitor.name, said_line] if not said_line.is_empty() else "%s leaves." % visitor.name)

# Sells the visitor what they asked for, in a grade at least as good, from stock.
func sell(grade: String) -> bool:
    if not knocking():
        return _say("Nobody is waiting at the door.", false)
    var product: String = visitor.product
    var grades: Dictionary = data.products[product].grades
    if not grades.has(grade) or better(String(visitor.grade), grade):
        return _say("%s wants grade %s or better." % [visitor.name, visitor.grade], false)
    var grams := float(visitor.grams)
    if workshop.amount(grades[grade]) + 0.000001 < grams:
        return _say("Not enough grade %s %s in stock (%.0f g of %.0f g)." % [grade, product_name(product), workshop.amount(grades[grade]), grams], false)
    var pay := price(grade)
    workshop.take(grades[grade], grams)
    workshop.cash += pay
    workshop.revenue += pay
    var id: String = visitor.customer
    served[id] = int(served.get(id, 0)) + 1
    var tipped := better(grade, String(visitor.grade))
    _change_rep(id, 1.5 if tipped else 1.0)
    if visitor.order:
        orders = orders.filter(func(order): return order.customer != id)
    visitor.phase = "leave"
    visitor.dir = 1
    visitor.line = line(id, "better" if tipped else "served")
    cooldown[id] = maxf(float(cooldown.get(id, -1.0)), minute + float(data.cooldown_minutes))
    return _say("Sold %.0f g of grade %s %s to %s for %.2f credits." % [grams, grade, product_name(product), visitor.name, pay])

# Promises a new request for later: the customer comes back in two to four game hours.
func promise() -> bool:
    if not knocking() or visitor.order:
        return _say("There is nothing to promise.", false)
    var span: Array = data.order_minutes
    var due := minute + float(rng.randi_range(int(span[0]), int(span[1])))
    orders.append({"customer": visitor.customer, "name": visitor.name, "product": visitor.product,
        "grams": visitor.grams, "grade": visitor.grade, "pays": visitor.pays, "due": due, "called": false})
    var id: String = visitor.customer
    visitor.phase = "leave"
    visitor.dir = 1
    visitor.line = line(id, "order")
    return _say("%s will come back at %s for %.0f g of %s." % [visitor.name, LogisticsModel.clock_text(due).get_slice(" · ", 1), visitor.grams, product_name(visitor.product)])

# Turns the visitor away; breaking a promise costs more reputation than a polite no.
func refuse() -> bool:
    if not knocking():
        return _say("Nobody is waiting at the door.", false)
    _leave("late" if visitor.order else "refused", -2.0 if visitor.order else -0.25)
    return true

func snapshot() -> Dictionary:
    return {"version": 1, "reputation": reputation.duplicate(), "cooldown": cooldown.duplicate(),
        "served": served.duplicate(), "orders": orders.duplicate(true), "queue": queue.duplicate(true),
        "visitor": visitor.duplicate(true) if knocking() or (not visitor.is_empty() and visitor.phase == "arrive") else {},
        "last_hour": last_hour, "first_done": first_done, "minute": minute, "seed": str(rng.seed), "state": str(rng.state)}

# Replaces the state only if the whole snapshot is valid; returns an empty string or why it was refused.
func restore(saved: Dictionary) -> String:
    if int(saved.get("version", 0)) != 1:
        return "unknown people save version"
    for key in ["reputation", "cooldown", "served"]:
        if not saved.get(key) is Dictionary:
            return "bad " + key
    for key in ["orders", "queue"]:
        if not saved.get(key) is Array:
            return "bad " + key
    for order in saved.orders:
        if not order is Dictionary or customer(String(order.get("customer", ""))).is_empty() or not data.products.has(String(order.get("product", ""))):
            return "bad order"
    for entry in saved.queue:
        if not entry is Dictionary or customer(String(entry.get("customer", ""))).is_empty():
            return "bad queue"
    var waiting: Variant = saved.get("visitor", {})
    if not waiting is Dictionary or (not waiting.is_empty() and customer(String(waiting.get("customer", ""))).is_empty()):
        return "bad visitor"
    reputation = saved.reputation.duplicate()
    cooldown = saved.cooldown.duplicate()
    served = saved.served.duplicate()
    orders = saved.orders.duplicate(true)
    queue = saved.queue.duplicate(true)
    visitor = waiting.duplicate(true)
    for key in ["x", "grams", "pays", "since", "dir"]:
        if visitor.has(key):
            visitor[key] = float(visitor[key])
    if visitor.has("look"):
        visitor.look = int(visitor.look)
    walkers.clear()
    last_hour = int(saved.get("last_hour", -1))
    first_done = bool(saved.get("first_done", true))
    minute = float(saved.get("minute", 0.0))
    rng.seed = String(saved.get("seed", str(rng.seed))).to_int()
    rng.state = String(saved.get("state", str(rng.state))).to_int()
    return ""
