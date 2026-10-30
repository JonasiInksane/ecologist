extends SceneTree
# The town's model (M3): customers who knock, selling and promising, patience, reputation, passers-by and saves.

var failures := 0
var checks := 0
var model: PeopleModel
var minute := 480.0

func check(condition: bool, description: String) -> void:
    checks += 1
    if not condition:
        failures += 1
        push_error(description)

# Runs the town for real seconds at one game minute per real second, sixty steps a second.
func run(seconds: float) -> void:
    for i in int(seconds * 60.0):
        minute += 1.0 / 60.0
        model.step(minute, 1.0 / 60.0)

func run_until(condition: Callable, limit: float) -> bool:
    var waited := 0.0
    while not condition.call() and waited < limit:
        run(0.5)
        waited += 0.5
    return condition.call()

func _initialize() -> void:
    var workshop := WorkshopModel.new(JSON.parse_string(FileAccess.get_file_as_string("res://data/workshop.json")))
    var town: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/people.json"))
    model = PeopleModel.new(town, workshop)
    # No random knocks until the day test; the scripted visits come one at a time.
    var chance := float(town.visit_chance)
    town.visit_chance = 0.0
    check(PeopleModel.in_hours([21, 3], 22) and PeopleModel.in_hours([21, 3], 2) and not PeopleModel.in_hours([21, 3], 3) and not PeopleModel.in_hours([21, 3], 20), "Night hours wrap past midnight")
    check(PeopleModel.in_hours([6, 10], 6) and not PeopleModel.in_hours([6, 10], 10) and PeopleModel.in_hours([12, 24], 23) and not PeopleModel.in_hours([12, 24], 11), "Day hours")
    check(PeopleModel.better("A", "C") and not PeopleModel.better("C", "B") and not PeopleModel.better("B", "B"), "Grades rank A over B over C")
    for entry in town.customers:
        check(town.products.has(entry.wants.product) and entry.look < 16 and entry.lines.hello.size() > 0, "%s wants a known product and has a look and lines" % entry.name)
    # The first visitor: Theo the barista knocks on Day 1 at about 08:20 and wants simple syrup.
    run(19.0)
    check(model.visitor.is_empty(), "Nobody comes before 08:20")
    run(2.0)
    check(model.visitor.get("customer") == "theo" and model.visitor.phase == "arrive" and model.visitor.product == "simple_syrup", "Theo walks up from the street")
    check(run_until(model.knocking, 60.0) and model.message.begins_with("Knock knock. Theo"), "Theo reaches the door and knocks")
    var grams := float(model.visitor.grams)
    check(grams >= 400.0 and grams <= 600.0 and int(grams) % 50 == 0, "He asks for 400 to 600 g, in 50 g steps")
    check(not model.sell("C") and model.message.begins_with("Not enough grade C"), "Nothing to sell yet")
    workshop.store("syrup_simple_b", 1000.0)
    check(not model.sell("A") and model.knocking(), "No grade A in stock")
    var cash := workshop.cash
    var expected := grams * float(workshop.data.materials.syrup_simple_b.sell) * 1.5 * (1.0 + float(town.better_tip))
    check(is_equal_approx(model.price("B"), expected), "Grade B pays 1.5 times its stock price plus the tip for beating grade C")
    check(model.sell("B") and is_equal_approx(workshop.cash, cash + expected) and is_equal_approx(workshop.amount("syrup_simple_b"), 1000.0 - grams), "Selling takes the syrup from stock and pays")
    check(model.rep("theo") == 1.5 and int(model.served.theo) == 1 and model.visitor.phase == "leave", "A better grade earns more reputation, and Theo leaves")
    check(run_until(func(): return model.visitor.is_empty(), 60.0), "He walks off down the street")
    # A promise: Dale wants hard candy; he comes back two to four hours later.
    model._enqueue("dale", false)
    check(run_until(model.knocking, 60.0) and model.visitor.customer == "dale", "Dale knocks")
    var promised_at := minute
    check(model.promise() and model.orders.size() == 1 and model.orders[0].due >= promised_at + 120.0 and model.orders[0].due <= promised_at + 240.0, "A promise books his return in two to four game hours")
    check(not model.knocking() and model.message.contains("will come back at"), "He leaves until then")
    check(run_until(func(): return model.knocking() and model.visitor.order, 300.0), "Dale comes back for the order")
    check(model.visitor.grams == model.orders[0].grams and minute >= model.orders[0].due, "Back for the promised amount, on time")
    var before := model.rep("dale")
    check(model.refuse() and model.orders.is_empty() and model.rep("dale") == before - 2.0, "Breaking a promise costs two points of reputation")
    run_until(func(): return model.visitor.is_empty(), 60.0)
    # Patience: Gus does not wait long.
    model._enqueue("gus", false)
    check(run_until(model.knocking, 60.0), "Gus knocks")
    run(float(model.customer("gus").patience) + 2.0)
    check(model.visitor.get("phase") == "leave" and model.rep("gus") == -0.25, "Unanswered, he leaves and thinks a little less of you")
    run_until(func(): return model.visitor.is_empty(), 60.0)
    # Grades: Chef Ramona only takes grade A sea salt.
    model._enqueue("ramona", false)
    run_until(model.knocking, 60.0)
    workshop.store("sea_salt", 1000.0)
    check(not model.sell("B") and model.message.contains("grade A or better"), "Grade B is not good enough for the chef")
    model.refuse()
    run_until(func(): return model.visitor.is_empty(), 60.0)
    # Passers-by walk to the end of the street and back.
    var seen := {}
    var turned := false
    for i in 600:
        run(1.0)
        for walker in model.walkers:
            seen[walker.name] = true
            turned = turned or walker.dir > 0
    check(seen.size() >= 3 and turned, "Passers-by come and go (%d seen)" % seen.size())
    var street: Dictionary = town.street
    check(model.walkers.all(func(walker): return walker.x >= float(street.turn_x[0]) - 0.01 and walker.x <= float(street.east_x) + 1.0), "They stay on the street")
    # Knocks over a day: customers come in their hours, more often with stock on hand, and cool down after a visit.
    town.visit_chance = chance
    var visits := {}
    for i in 24 * 60:
        run(1.0)
        if model.knocking():
            visits[model.visitor.customer] = int(visits.get(model.visitor.customer, 0)) + 1
            model.refuse()
    check(visits.size() >= 3, "Several customers knocked in a day (%s)" % str(visits.keys()))
    for id in visits:
        check(visits[id] <= 3, "%s did not pester (%d visits)" % [id, visits[id]])
    # Saves: a round trip, and a bad save leaves the town as it was.
    run_until(func(): return model.visitor.is_empty(), 60.0)
    model._enqueue("agatha", false)
    run_until(model.knocking, 60.0)
    model.promise()
    var saved := model.snapshot()
    var copy := PeopleModel.new(town, workshop)
    check(copy.restore(JSON.parse_string(JSON.stringify(saved, "", true, true))).is_empty(), "A town save restores")
    check(copy.reputation == model.reputation and copy.orders.size() == 1 and copy.orders[0].customer == "agatha" and copy.rng.state == model.rng.state, "Reputation, orders and the dice come back")
    var broken := saved.duplicate(true)
    broken.orders[0].customer = "nobody"
    check(not copy.restore(broken).is_empty() and copy.orders[0].customer == "agatha", "A save with an unknown customer is refused whole")
    check(not copy.restore({"version": 2}).is_empty(), "An unknown version is refused")
    print("Ecologist people: %d checks, %d failures" % [checks, failures])
    quit(1 if failures else 0)
