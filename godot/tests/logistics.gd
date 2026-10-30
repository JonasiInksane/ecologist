extends SceneTree
# The laptop shop's model (M2): the clock, orders, vans, tankers, return fees, crates and saves.

var failures := 0
var checks := 0

func check(condition: bool, description: String) -> void:
    checks += 1
    if not condition:
        failures += 1
        push_error(description)

func _initialize() -> void:
    var workshop := WorkshopModel.new(JSON.parse_string(FileAccess.get_file_as_string("res://data/workshop.json")))
    var shop: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/shop.json"))
    var kit: Array = JSON.parse_string(FileAccess.get_file_as_string("res://data/equipment.json")).items
    var model := LogisticsModel.new(shop, workshop, kit)
    var minute := 60.0  # ticks per game minute at one game minute per real second
    check(LogisticsModel.clock_text(model.minute) == "Day 1 · 08:00" and LogisticsModel.clock_text(1440 + 75) == "Day 2 · 01:15", "The clock starts on Day 1 at 08:00")
    check(model.price(model.offer("hollis", 0)) == 20.0 and model.price(model.offer("pipedreams", 3)) == 150.0 and model.price(model.offer("sweetco", 1)) == 560.0, "Prices come from stock prices, kit costs or the offer")
    workshop.cash = 1000.0
    check(model.order("hollis", 0, 2) and is_equal_approx(workshop.cash, 960.0) and model.orders.size() == 1, "Ordering beets pays for them up front")
    check(not model.order("hollis", 0, 9) and not model.order("brackwater", 1, 1) and not model.order("nobody", 0, 1), "Orders outside the offer's limits are refused")
    var cash := workshop.cash
    workshop.cash = 100.0
    check(not model.order("pipedreams", 4, 1) and workshop.cash == 100.0 and model.orders.size() == 1, "An order the cash cannot cover is refused")
    workshop.cash = cash
    model.step(int(179 * minute))
    check(model.truck.is_empty() and model.status() == "Hollis van due 11:00", "Nothing arrives before the lead time")
    model.step(int(minute) + 1)
    check(model.truck.get("vehicle") == "van" and model.status().begins_with("Van at the curb"), "The van arrives after three hours")
    var beets := workshop.amount("sugar_beet")
    check(model.unload() and workshop.amount("sugar_beet") == beets + 50000.0 and model.truck.is_empty() and model.departed.vehicle == "van", "Unloading puts 50 kg of beets in stock and the van leaves")
    check(not model.unload(), "There is nothing left to unload")
    # Crates, and one truck at the curb at a time.
    check(model.order("pipedreams", 0, 1) and model.order("pipedreams", 3, 1), "Two crates ordered")
    model.step(int(241 * minute))
    check(model.truck.item == "drum" and model.orders.size() == 1, "The second van waits while the first is at the curb")
    model.unload()
    model.step(1)
    check(model.truck.item == "kettle", "The next van pulls up once the curb is free")
    model.unload()
    check(model.crates == {"drum": 1, "kettle": 1}, "Crates wait in the yard to be placed")
    check(model.take_crate("kettle") and not model.take_crate("kettle") and not model.crates.has("kettle"), "Placing a piece takes its crate")
    model.return_crate("kettle")
    check(model.crates.kettle == 1, "Picking a crated piece up packs it back")
    # A van nobody unloads takes the goods back for the return fee.
    cash = workshop.cash
    model.order("calcium", 0, 1)
    model.step(int(121 * minute))
    check(not model.truck.is_empty(), "The lime van is at the curb")
    model.step(int(121 * minute))
    check(model.truck.is_empty() and is_equal_approx(workshop.cash, cash - 20.0 + 15.0) and model.message.contains("return fee"), "An unattended van leaves and refunds the order less a 5 credit fee")
    # The tanker waits for a coupling, pumps into it, and leaves when it is done.
    cash = workshop.cash
    check(model.order("brackwater", 1, 2) and is_equal_approx(workshop.cash, cash - 60.0), "Two hundred litres of sea water by tanker")
    model.step(int(241 * minute))
    check(model.tanker_here() and model.tanker_want() == 300.0, "The tanker pulls up and wants to pump 300 g a tick")
    for i in 600:
        model.tanker_report(false, 0.0)
    check(model.tanker_here() and int(model.truck.blocked) == 0, "Without a coupling at the curb it waits")
    for i in 666:
        model.tanker_report(true, 300.0)
    check(model.tanker_here() and is_equal_approx(model.tanker_want(), 200.0), "It stops at what was ordered")
    model.tanker_report(true, 200.0)
    check(not model.tanker_here() and is_equal_approx(workshop.cash, cash - 60.0) and model.message.contains("200 L"), "A full delivery leaves without a refund")
    # A coupling that stops taking water ends the delivery early, with the rest refunded less the fee.
    cash = workshop.cash
    model.order("brackwater", 1, 2)
    model.step(int(241 * minute))
    for i in 100:
        model.tanker_report(true, 300.0)
    for i in 179:
        model.tanker_report(true, 0.0)
    check(model.tanker_here(), "A short stall is waited out")
    model.tanker_report(true, 0.0)
    check(not model.tanker_here() and is_equal_approx(workshop.cash, cash - 60.0 + 51.0 - 7.65), "Blocked for three seconds, it leaves and refunds 85 % of what it took back")
    # Saves.
    check(model.order("hollis", 0, 1) and model.order("brackwater", 1, 3), "Orders on the way when saving")
    model.step(int(181 * minute))
    var saved := model.snapshot()
    var copy := LogisticsModel.new(shop, WorkshopModel.new(workshop.data), kit)
    check(copy.restore(JSON.parse_string(JSON.stringify(saved, "", true, true))) and copy.minute == model.minute and copy.orders.size() == 1 and copy.truck.item == "sugar_beet" and copy.crates == model.crates, "Deliveries survive a save and load")
    var broken: Dictionary = JSON.parse_string(JSON.stringify(saved, "", true, true))
    broken.crates = {"spaceship": 1}
    check(not copy.restore(broken) and copy.truck.item == "sugar_beet", "Unknown crates are refused and the live state kept")
    broken = JSON.parse_string(JSON.stringify(saved, "", true, true))
    broken.orders[0].index = 7
    check(not copy.restore(broken), "An order for an offer that does not exist is refused")
    broken = JSON.parse_string(JSON.stringify(saved, "", true, true))
    broken.version = 2
    check(not copy.restore(broken), "Saves from another version are refused")
    for i in 6:
        model.order("calcium", 0, 1)
    check(model.orders.size() == int(shop.max_orders) and model.message == "Too many deliveries on the way already.", "Only so many deliveries at once")
    print("Ecologist logistics: %d checks, %d failures" % [checks, failures])
    quit(1 if failures else 0)
