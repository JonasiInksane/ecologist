#include "ecologist_world.hpp"
#include "../render/cells.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/godot.hpp>
namespace godot {
void EcologistWorld::_bind_methods() {
    ClassDB::bind_method(D_METHOD("setup", "width", "height", "seed"), &EcologistWorld::setup);
    ClassDB::bind_method(D_METHOD("reset_demo", "seed"), &EcologistWorld::reset_demo);
    ClassDB::bind_method(D_METHOD("setup_plot", "seed"), &EcologistWorld::setup_plot);
    ClassDB::bind_method(D_METHOD("advance", "ticks"), &EcologistWorld::advance);
    ClassDB::bind_method(D_METHOD("player_input", "left", "right", "jump", "up", "down"), &EcologistWorld::player_input);
    ClassDB::bind_method(D_METHOD("player_state"), &EcologistWorld::player_state);
    ClassDB::bind_method(D_METHOD("build", "x", "y", "code"), &EcologistWorld::build);
    ClassDB::bind_method(D_METHOD("toggle_door", "x", "y"), &EcologistWorld::toggle_door);
    ClassDB::bind_method(D_METHOD("use_door_near_player"), &EcologistWorld::use_door_near_player);
    ClassDB::bind_method(D_METHOD("save_world", "path"), &EcologistWorld::save_world);
    ClassDB::bind_method(D_METHOD("load_world", "path"), &EcologistWorld::load_world);
    ClassDB::bind_method(D_METHOD("back_data"), &EcologistWorld::back_data);
    ClassDB::bind_method(D_METHOD("equipment_kinds"), &EcologistWorld::equipment_kinds);
    ClassDB::bind_method(D_METHOD("equipment_place", "kind", "x", "y"), &EcologistWorld::equipment_place);
    ClassDB::bind_method(D_METHOD("equipment_remove", "id"), &EcologistWorld::equipment_remove);
    ClassDB::bind_method(D_METHOD("equipment_move", "id", "x", "y"), &EcologistWorld::equipment_move);
    ClassDB::bind_method(D_METHOD("equipment_at", "x", "y"), &EcologistWorld::equipment_at);
    ClassDB::bind_method(D_METHOD("equipment_list"), &EcologistWorld::equipment_list);
    ClassDB::bind_method(D_METHOD("equipment_info", "id"), &EcologistWorld::equipment_info);
    ClassDB::bind_method(D_METHOD("equipment_set", "id", "setting"), &EcologistWorld::equipment_set);
    ClassDB::bind_method(D_METHOD("vessel_add", "id", "ingredient", "grams", "temperature"), &EcologistWorld::vessel_add);
    ClassDB::bind_method(D_METHOD("vessel_pour", "from", "to"), &EcologistWorld::vessel_pour);
    ClassDB::bind_method(D_METHOD("vessel_spill", "id"), &EcologistWorld::vessel_spill);
    ClassDB::bind_method(D_METHOD("vessel_drain", "id", "keep_crystals"), &EcologistWorld::vessel_drain);
    ClassDB::bind_method(D_METHOD("vessel_collect", "id"), &EcologistWorld::vessel_collect);
    ClassDB::bind_method(D_METHOD("budget", "key"), &EcologistWorld::budget);
    ClassDB::bind_method(D_METHOD("paint", "x", "y", "radius", "material"), &EcologistWorld::paint);
    ClassDB::bind_method(D_METHOD("paint_grains", "x", "y", "radius", "kind"), &EcologistWorld::paint_grains);
    ClassDB::bind_method(D_METHOD("heat", "x", "y", "radius", "delta"), &EcologistWorld::heat);
    ClassDB::bind_method(D_METHOD("device_action", "x", "y", "tool", "liquid"),
                         &EcologistWorld::device_action);
    ClassDB::bind_method(D_METHOD("wire_action", "x", "y"), &EcologistWorld::wire_action);
    ClassDB::bind_method(D_METHOD("dye", "x", "y", "radius", "channel"), &EcologistWorld::dye);
    ClassDB::bind_method(D_METHOD("ignite", "x", "y", "radius"), &EcologistWorld::ignite);
    ClassDB::bind_method(D_METHOD("flow", "pressure", "momentum"), &EcologistWorld::flow);
    ClassDB::bind_method(D_METHOD("fire_data"), &EcologistWorld::fire_data);
    ClassDB::bind_method(D_METHOD("environment", "sunlight", "wind"), &EcologistWorld::environment);
    ClassDB::bind_method(D_METHOD("device_data"), &EcologistWorld::device_data);
    ClassDB::bind_method(D_METHOD("grain_pixels"), &EcologistWorld::grain_pixels);
    ClassDB::bind_method(D_METHOD("pixels"), &EcologistWorld::pixels);
    ClassDB::bind_method(D_METHOD("render_data"), &EcologistWorld::render_data);
    ClassDB::bind_method(D_METHOD("solution_data"), &EcologistWorld::solution_data);
    ClassDB::bind_method(D_METHOD("stats"), &EcologistWorld::stats);
    ClassDB::bind_method(D_METHOD("inspect", "x", "y"), &EcologistWorld::inspect);
}
bool EcologistWorld::setup(int w, int h, int seed) {
    if (!simulation.reset(w, h, seed))
        return false;
    grains.reset(simulation);
    sandbox.reset(simulation);
    player = {};
    return true;
}
void EcologistWorld::reset_demo(int seed) {
    simulation.demo(seed);
    grains.reset(simulation);
    sandbox.reset(simulation);
    player = {};
}
void EcologistWorld::setup_plot(int seed) { ecologist::start_plot(simulation, grains, sandbox, player, seed); }
void EcologistWorld::advance(int ticks) {
    if (simulation.width)
        for (int i = 0; i < std::clamp(ticks, 0, 600); i++)
            ecologist::step_game(simulation, grains, sandbox, &player);
}
void EcologistWorld::player_input(bool left, bool right, bool jump, bool up, bool down) {
    player.input = {left, right, jump, up, down};
}
Dictionary EcologistWorld::player_state() const {
    Dictionary d;
    d["active"] = player.active;
    if (!player.active)
        return d;
    d["x"] = player.x;
    d["y"] = player.y;
    d["vx"] = player.vx;
    d["vy"] = player.vy;
    d["width"] = ecologist::Player::WIDTH;
    d["height"] = ecologist::Player::HEIGHT;
    d["health"] = player.health;
    d["breath"] = player.breath;
    d["facing"] = player.facing;
    d["on_ground"] = player.on_ground;
    d["climbing"] = player.climbing;
    d["swimming"] = player.swimming;
    d["deaths"] = player.deaths;
    d["event"] = String(player.event.c_str());
    return d;
}
// Builds or removes one tile. Solid tiles are refused where they would trap the player.
int EcologistWorld::build(int x, int y, int code) {
    const bool solid = code < 0 || code == ecologist::BUILD_DOOR;
    if (solid && player.active) {
        const int tx = x & ~1, ty = y & ~1;
        if (code == ecologist::BUILD_DOOR ? player.overlaps(tx, ty - 4, 2, 6) : player.overlaps(tx, ty, 2, 2))
            return 0;
    }
    return sandbox.build(simulation, grains, x, y, code);
}
bool EcologistWorld::toggle_door(int x, int y) {
    if (x < 0 || y < 0 || x >= simulation.width || y >= simulation.height)
        return false;
    const int k = y * simulation.width + x;
    bool blocked = false; // a door does not close on the player standing in it
    if (player.active && (sandbox.back[k] & ecologist::BACK_DOOR_OPEN))
        for (int cy = y - 6; cy <= y + 6 && !blocked; cy++)
            for (int cx = x - 1; cx <= x + 1; cx++)
                if (cx >= 0 && cy >= 0 && cx < simulation.width && cy < simulation.height &&
                    (sandbox.back[cy * simulation.width + cx] & ecologist::BACK_DOOR_OPEN) && player.overlaps(cx, cy))
                    blocked = true;
    return sandbox.toggle_door(simulation, x, y, !blocked);
}
// The interact key: the nearest door within two tiles of the player's middle opens or closes.
bool EcologistWorld::use_door_near_player() {
    if (!player.active)
        return false;
    const int px = int((player.x + ecologist::Player::WIDTH / 2) / 8), py = int((player.y + ecologist::Player::HEIGHT / 2) / 8);
    int best = -1, best_d = 1 << 30;
    for (int cy = py - 5; cy <= py + 5; cy++)
        for (int cx = px - 5; cx <= px + 5; cx++) {
            if (cx < 0 || cy < 0 || cx >= simulation.width || cy >= simulation.height)
                continue;
            const int k = cy * simulation.width + cx, d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
            if ((simulation.solid[k] == ecologist::B_DOOR || (sandbox.back[k] & ecologist::BACK_DOOR_OPEN)) && d < best_d) {
                best = k;
                best_d = d;
            }
        }
    return best >= 0 && toggle_door(best % simulation.width, best / simulation.width);
}
// Both return an empty string on success, otherwise the reason it failed.
String EcologistWorld::save_world(const String &path) const {
    std::string error;
    return ecologist::save_world(path.utf8().get_data(), simulation, grains, sandbox, player, &error) ? String()
                                                                                                    : String(error.c_str());
}
String EcologistWorld::load_world(const String &path) {
    std::string error;
    return ecologist::load_world(path.utf8().get_data(), simulation, grains, sandbox, player, &error) ? String()
                                                                                                    : String(error.c_str());
}
// Kitchen and lab equipment (M1): see native/core/equipment.hpp. Ids are anchor cells (top-left), which change
// when a piece is carried elsewhere.
namespace {
int kind_named(const String &name) {
    for (int k = 1; k < ecologist::EQ_KINDS; k++)
        if (name == ecologist::equipment_spec(k).id)
            return k;
    return 0;
}
Dictionary summary(const ecologist::World &w, const ecologist::Sandbox &s, int id, const ecologist::Equipment &e) {
    const auto &spec = ecologist::equipment_spec(e.kind);
    const auto &v = e.vessel;
    Dictionary d;
    d["id"] = id;
    d["kind"] = String(spec.id);
    d["x"] = e.x;
    d["y"] = e.y;
    d["width"] = spec.width;
    d["height"] = spec.height;
    d["setting"] = e.setting;
    d["vessel"] = spec.capacity > 0;
    d["closed"] = spec.closed;
    d["resting_on"] = ecologist::resting_on(w, s, id);
    // Ports (M2): where each fitting is, which way it faces, and whether a pipe or pump is coupled to it.
    Array ports;
    const auto &fittings = ecologist::equipment_ports(e.kind);
    for (std::size_t i = 0; i < fittings.size(); i++) {
        const auto &p = fittings[i];
        const int cell = (e.y + p.dy) * w.width + e.x + p.dx, outside = s.neighbor(w, cell, p.dir);
        const int b = outside >= 0 ? w.solid[outside] : 0;
        Dictionary port;
        port["x"] = e.x + p.dx;
        port["y"] = e.y + p.dy;
        port["dir"] = p.dir;
        port["aux"] = p.aux;
        port["connected"] = b == ecologist::B_PIPE || b == ecologist::B_VALVE || b == ecologist::B_FILTER ||
                            b == ecologist::B_PUMP_IN || b == ecologist::B_PUMP_OUT;
        ports.push_back(port);
    }
    d["ports"] = ports;
    if (spec.capacity <= 0)
        return d;
    const double mass = ecologist::vessel_mass(v);
    d["mass"] = mass;
    d["capacity"] = spec.capacity;
    d["fill"] = mass / spec.capacity;
    d["temperature"] = v.temperature;
    d["vapour"] = v.vapour;
    d["set"] = v.set;
    d["crystals"] = mass > 0 ? (v.sugar_crystal + v.salt_crystal + v.bittern_crystal) / mass : 0.0;
    d["burnt"] = mass > 0 ? v.burnt / mass : 0.0;
    d["sugar"] = mass > 0 ? v.dissolved[ecologist::SOL_SUGAR] / mass : 0.0;
    const double tissue = v.beet + v.beet_water + v.beet_sugar + v.beet_colloid + v.beet_ash;
    d["beets"] = mass > 0 ? tissue / mass : 0.0;
    d["mud"] = mass > 0 ? v.mud / mass : 0.0;
    d["cloudy"] = v.water > 0 ? v.dissolved[ecologist::SOL_SILT] / v.water : 0.0;
    if (spec.aux > 0) {
        d["casing_mass"] = ecologist::vessel_mass(e.aux);
        d["casing_capacity"] = spec.aux;
    }
    return d;
}
} // namespace
Array EcologistWorld::equipment_kinds() const {
    Array result;
    for (int k = 1; k < ecologist::EQ_KINDS; k++) {
        const auto &spec = ecologist::equipment_spec(k);
        Dictionary d;
        d["id"] = String(spec.id);
        d["width"] = spec.width;
        d["height"] = spec.height;
        d["capacity"] = spec.capacity;
        d["support"] = spec.support;
        d["closed"] = spec.closed;
        d["aux"] = spec.aux;
        d["ports"] = static_cast<int>(ecologist::equipment_ports(k).size());
        result.push_back(d);
    }
    return result;
}
Dictionary EcologistWorld::equipment_place(const String &kind, int x, int y) {
    Dictionary d;
    std::string why;
    const int k = kind_named(kind);
    const auto &spec = ecologist::equipment_spec(k);
    const int x0 = x & ~1, y0 = (y | 1) - spec.height + 1;
    int id = -1;
    if (!k)
        why = "unknown equipment";
    else if (player.active && player.overlaps(x0, y0, spec.width, spec.height))
        why = "you are standing there";
    else
        id = ecologist::place_equipment(simulation, grains, sandbox, k, x, y, &why);
    d["id"] = id;
    d["error"] = String(why.c_str());
    return d;
}
String EcologistWorld::equipment_remove(int id) {
    std::string why;
    return ecologist::remove_equipment(simulation, sandbox, id, &why) ? String() : String(why.empty() ? "nothing to remove" : why.c_str());
}
Dictionary EcologistWorld::equipment_move(int id, int x, int y) {
    Dictionary d;
    std::string why;
    d["id"] = ecologist::move_equipment(simulation, grains, sandbox, id, x, y, &why);
    d["error"] = String(why.c_str());
    return d;
}
int EcologistWorld::equipment_at(int x, int y) const { return ecologist::equipment_at(simulation, sandbox, x, y); }
Array EcologistWorld::equipment_list() const {
    Array result;
    for (const auto &[id, e] : sandbox.equipment)
        result.push_back(summary(simulation, sandbox, id, e));
    return result;
}
// Everything there is to know about one piece; the game decides which readings the player's tools reveal.
Dictionary EcologistWorld::equipment_info(int id) const {
    auto it = sandbox.equipment.find(id);
    if (it == sandbox.equipment.end())
        return {};
    Dictionary d = summary(simulation, sandbox, id, it->second);
    if (!bool(d["vessel"]))
        return d;
    const auto &v = it->second.vessel;
    const double sugar = v.dissolved[ecologist::SOL_SUGAR], salts = v.dissolved[ecologist::SOL_SALT] + v.dissolved[ecologist::SOL_METAL];
    d["water"] = v.water;
    d["sugar_dissolved"] = sugar;
    d["sugar_crystals"] = v.sugar_crystal;
    d["salt_dissolved"] = v.dissolved[ecologist::SOL_SALT];
    d["salt_crystals"] = v.salt_crystal;
    d["bittern_dissolved"] = v.dissolved[ecologist::SOL_METAL];
    d["bittern_crystals"] = v.bittern_crystal;
    d["burnt_g"] = v.burnt;
    d["peak"] = v.peak;
    d["boiling_point"] = v.water > 1e-6 ? ecologist::boiling_point(v) : 0.0;
    d["stage"] = String(ecologist::candy_stage(v).c_str());
    d["brix"] = v.water + sugar > 1e-9 ? sugar / (v.water + sugar) : 0.0;
    d["salinity"] = v.water + salts > 1e-9 ? salts / (v.water + salts) : 0.0;
    // Beet sugar (M2): the cossettes, the juice's colloids, ash and lime, and the centrifuge's casing.
    d["beet_g"] = v.beet + v.beet_water + v.beet_sugar + v.beet_colloid + v.beet_ash;
    d["beet_sugar_g"] = v.beet_sugar;
    d["shredded"] = v.beet_cut;
    d["colloid_g"] = v.dissolved[ecologist::SOL_SILT];
    d["ash_g"] = v.dissolved[ecologist::SOL_METAL];
    d["lime_g"] = v.dissolved[8];
    d["mud_g"] = v.mud;
    d["crystal_dirt_g"] = v.crystal_dirt;
    d["ph"] = ecologist::vessel_ph(v);
    // Sugar's saturation at this temperature, as a Brix: above it, seed crystals grow.
    const double t = v.temperature, ratio = 1.8 + 0.01 * t + 0.00018 * t * t;
    d["saturation_brix"] = ratio / (1 + ratio);
    if (ecologist::equipment_spec(it->second.kind).aux > 0) {
        const auto &c = it->second.aux;
        d["casing_water"] = c.water;
        d["casing_sugar"] = c.dissolved[ecologist::SOL_SUGAR];
        d["casing_temperature"] = c.temperature;
    }
    return d;
}
// Stoves and the kettle take a flame of 0 to 3; the coupling (the tanker pumping) and the centrifuge are off or on.
bool EcologistWorld::equipment_set(int id, int setting) {
    auto it = sandbox.equipment.find(id);
    if (it == sandbox.equipment.end())
        return false;
    const int kind = it->second.kind;
    if (kind == ecologist::EQ_STOVE || kind == ecologist::EQ_KETTLE)
        it->second.setting = std::clamp(setting, 0, 3);
    else if (kind == ecologist::EQ_COUPLING || kind == ecologist::EQ_CENTRIFUGE)
        it->second.setting = std::clamp(setting, 0, 1);
    else
        return false;
    return true;
}
String EcologistWorld::vessel_add(int id, const String &ingredient, double grams, double temperature) {
    std::string why;
    return ecologist::vessel_add(sandbox, id, ingredient.utf8().get_data(), grams, temperature, &why) ? String() : String(why.c_str());
}
Dictionary EcologistWorld::vessel_pour(int from, int to) {
    Dictionary d;
    std::string why;
    d["grams"] = ecologist::vessel_transfer(sandbox, from, to, &why);
    d["error"] = String(why.c_str());
    return d;
}
int EcologistWorld::vessel_spill(int id) { return ecologist::vessel_spill(simulation, sandbox, id); }
double EcologistWorld::vessel_drain(int id, bool keep_crystals) { return ecologist::vessel_discard(sandbox, id, keep_crystals); }
Dictionary EcologistWorld::vessel_collect(int id) {
    std::string why;
    const ecologist::Product p = ecologist::vessel_collect(sandbox, id, &why);
    Dictionary d;
    d["id"] = String(p.id.c_str());
    d["grade"] = String(p.grade.c_str());
    d["note"] = String(p.note.c_str());
    d["grams"] = p.grams;
    d["error"] = String(why.c_str());
    return d;
}
double EcologistWorld::budget(const String &key) const {
    auto it = sandbox.budget.find(key.utf8().get_data());
    return it == sandbox.budget.end() ? 0.0 : it->second;
}
// One byte per cell: background wall (bits 0-3: 1 wood, 2 brick), open door (0x20) and ladder (0x40).
PackedByteArray EcologistWorld::back_data() const {
    PackedByteArray result;
    result.resize(sandbox.back.size());
    if (!sandbox.back.empty())
        std::memcpy(result.ptrw(), sandbox.back.data(), sandbox.back.size());
    return result;
}
bool EcologistWorld::paint(int x, int y, int radius, int material) {
    radius = std::clamp(radius, 1, 16);
    if (!sandbox.paint(simulation, grains, x, y, radius, material))
        return false;
    // Brine is water carrying salt, so grains, evaporation and concentration use
    // the same composition channel as brine made by dissolving salt manually.
    if (material == 39)
        for (int dy = -radius; dy <= radius; dy++)
            for (int dx = -radius; dx <= radius; dx++) {
                const int xx = x + dx, yy = y + dy;
                if (dx * dx + dy * dy >= radius * radius || xx < 0 || yy < 0 || xx >= simulation.width ||
                    yy >= simulation.height)
                    continue;
                const int k = yy * simulation.width + xx;
                if (simulation.typ[k] == 39 && simulation.liq[k]) {
                    simulation.typ[k] = ecologist::WATER;
                    simulation.sol[k * ecologist::NSOL + ecologist::SOL_SALT] = 255.0 * 0.035 / 0.965;
                }
            }
    if (material <= 0)
        for (int dy = -radius; dy <= radius; dy++)
            for (int dx = -radius; dx <= radius; dx++)
                if (dx * dx + dy * dy < radius * radius)
                    grains.erase_cell(x + dx, y + dy);
    return true;
}
int EcologistWorld::paint_grains(int x, int y, int radius, int kind) {
    return grains.paint(simulation, x, y, radius, kind);
}
bool EcologistWorld::heat(int x, int y, int radius, double delta) {
    return ecologist::heat_brush(simulation, x, y, radius, delta);
}
bool EcologistWorld::device_action(int x, int y, int tool, int liquid) {
    return sandbox.use(simulation, x, y, tool, liquid, &grains);
}
bool EcologistWorld::ignite(int x, int y, int radius) { return sandbox.ignite(simulation, x, y, radius); }
void EcologistWorld::flow(bool pressure, bool momentum) {
    sandbox.pressure_on = pressure;
    sandbox.momentum_on = momentum;
}
// One byte per cell: 201-255 is a flame (its flicker phase), 1-200 the glow of a hot solid.
PackedByteArray EcologistWorld::fire_data() const {
    PackedByteArray result;
    const int n = simulation.width * simulation.height;
    result.resize(n);
    auto *out = result.ptrw();
    for (int k = 0; k < n; k++) {
        if (!sandbox.fire.empty() && sandbox.fire[k])
            out[k] = 201 + (k * 37 + sandbox.fire[k]) % 55;
        else if (simulation.solid[k] && simulation.temp[k] > 450)
            out[k] = std::clamp(int((simulation.temp[k] - 450) / 1000 * 200), 1, 200);
        else
            out[k] = 0;
    }
    return result;
}
bool EcologistWorld::wire_action(int x, int y) { return sandbox.wire(simulation, x, y); }
void EcologistWorld::environment(double sun, double wind) {
    if (std::isfinite(sun) && std::isfinite(wind)) {
        sandbox.sunlight = std::clamp(sun, 0.0, 1.0);
        sandbox.wind = std::clamp(wind, -2.0, 2.0);
    }
}
bool EcologistWorld::dye(int x, int y, int radius, int channel) {
    if (channel < 0 || channel >= ecologist::NSOL || x < 0 || y < 0 || x >= simulation.width ||
        y >= simulation.height)
        return false;
    bool changed = false;
    radius = std::clamp(radius, 1, 16);
    for (int dy = -radius; dy <= radius; dy++)
        for (int dx = -radius; dx <= radius; dx++) {
            const int xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= simulation.width || yy >= simulation.height ||
                dx * dx + dy * dy >= radius * radius)
                continue;
            int k = yy * simulation.width + xx;
            if (simulation.typ[k] == ecologist::WATER && simulation.liq[k]) {
                simulation.sol[k * ecologist::NSOL + channel] =
                    std::min(255.0, simulation.sol[k * ecologist::NSOL + channel] + 32);
                simulation.wake(k);
                changed = true;
            }
        }
    return changed;
}
Array EcologistWorld::device_data() const {
    Array result;
    for (const auto &[k, m] : sandbox.machines) {
        Dictionary d;
        d["cell"] = k;
        d["kind"] = m.kind;
        d["on"] = m.on;
        d["active"] = m.active;
        d["open"] = m.open;
        d["charge"] = m.charge;
        d["liquid"] = m.liquid;
        d["level"] = m.level;
        d["period"] = m.period;
        d["salt"] = m.salt;
        d["colour"] = m.colour;
        d["count"] = m.count;
        d["limit"] = m.limit;
        Array links;
        for (int t : m.targets)
            links.append(t);
        d["targets"] = links;
        result.append(d);
    }
    for (const auto &p : sandbox.pumps)
        for (int k : {p.inlet, p.outlet}) {
            Dictionary d;
            d["cell"] = k;
            d["kind"] = k == p.inlet ? 8 : 9;
            d["on"] = p.on;
            d["active"] = p.on;
            d["open"] = false;
            d["charge"] = p.buffer.amount;
            d["liquid"] = p.buffer.type;
            Array targets;
            targets.append(k == p.inlet ? p.outlet : p.inlet);
            d["targets"] = targets;
            result.append(d);
        }
    if (sandbox.pending_inlet >= 0) {
        Dictionary d;
        d["cell"] = sandbox.pending_inlet;
        d["kind"] = 8;
        d["on"] = false;
        d["active"] = false;
        d["open"] = false;
        d["targets"] = Array();
        result.append(d);
    }
    for (int k = 0; k < simulation.width * simulation.height; k++)
        if (simulation.solid[k] == ecologist::B_PIPE) {
            Dictionary d;
            d["cell"] = k;
            d["kind"] = 25;
            d["on"] = false;
            d["active"] =
                sandbox.pipe_time[k] > 0 && simulation.tick - static_cast<unsigned>(sandbox.pipe_time[k]) < 8;
            d["open"] = false;
            d["targets"] = Array();
            d["liquid"] = sandbox.pipe_show[k];
            result.append(d);
        }
    return result;
}
PackedByteArray EcologistWorld::grain_pixels() const {
    PackedByteArray result;
    result.resize(grains.image.size());
    if (!grains.image.empty())
        std::memcpy(result.ptrw(), grains.image.data(), grains.image.size());
    return result;
}
PackedByteArray EcologistWorld::pixels() const {
    const auto rgba = simulation.rgba();
    PackedByteArray result;
    result.resize(rgba.size());
    if (!rgba.empty())
        std::memcpy(result.ptrw(), rgba.data(), rgba.size());
    return result;
}
PackedByteArray EcologistWorld::render_data() const {
    const auto bytes = ecologist::render_cells(simulation);
    PackedByteArray result;
    result.resize(bytes.size());
    if (!bytes.empty())
        std::memcpy(result.ptrw(), bytes.data(), bytes.size());
    return result;
}
PackedByteArray EcologistWorld::solution_data() const {
    PackedByteArray result;
    result.resize(simulation.liq.size() * 4);
    auto *out = result.ptrw();
    for (int k = 0; k < simulation.width * simulation.height; k++) {
        double color[3] = {}, sum = 0;
        const double *sol = &simulation.sol[k * ecologist::NSOL];
        const double ink = std::max({sol[3], sol[4], sol[5]});
        if (ink > 4) {
            for (int c = 0; c < 8; c++) {
                double w = ink / 255;
                for (int j = 0; j < 3; j++)
                    w *= c & (1 << j) ? sol[3 + j] / ink : 1 - sol[3 + j] / ink;
                for (int j = 0; j < 3; j++)
                    color[j] += ecologist::INK_COLORS[c][j] * w;
            }
            sum += ink / 255;
        }
        for (const auto &tint : ecologist::SOLUTE_TINTS) {
            const double w = sol[int(tint[0])] / 255 * tint[4];
            if (w > .02) {
                sum += w;
                for (int j = 0; j < 3; j++)
                    color[j] += tint[1 + j] * w;
            }
        }
        for (int j = 0; j < 3; j++)
            out[k * 4 + j] = sum > 0 ? std::clamp(int(color[j] / sum) / 16 * 16 + 8, 0, 255) : 0;
        out[k * 4 + 3] = sum > 0 ? int(std::round(std::min(.85, sum) * 15)) * 17 : 0;
    }
    return result;
}
Dictionary EcologistWorld::stats() const {
    Dictionary d;
    d["width"] = simulation.width;
    d["height"] = simulation.height;
    d["tick"] = simulation.tick;
    d["liquid_units"] = simulation.volume();
    d["seed_state"] = simulation.rng;
    int active = 0;
    for (auto a : simulation.awake)
        if (a)
            active++;
    d["active_chunks"] = active;
    d["grains"] = static_cast<int>(grains.particles.size());
    d["sand_units"] = grains.mass(1);
    d["sugar_grain_units"] = grains.mass(2);
    d["salt_grain_units"] = grains.mass(3);
    d["buffered_units"] = sandbox.buffered_volume();
    d["source_units"] = sandbox.source_units;
    d["drain_units"] = sandbox.drain_units;
    d["machines"] = static_cast<int>(sandbox.machines.size());
    d["pumps"] = static_cast<int>(sandbox.pumps.size());
    d["message"] = String(sandbox.message.c_str());
    d["pending_wire"] = sandbox.pending_wire;
    d["pending_inlet"] = sandbox.pending_inlet;
    d["shake"] = sandbox.shake;
    d["explosions"] = sandbox.explosions;
    int burning = 0;
    for (auto f : sandbox.fire)
        burning += f > 0;
    d["burning"] = burning;
    d["pressure"] = sandbox.pressure_on;
    d["momentum"] = sandbox.momentum_on;
    d["oxygen_burned"] = sandbox.budget.count("combustion_oxygen") ? sandbox.budget.at("combustion_oxygen") : 0.0;
    return d;
}
Dictionary EcologistWorld::inspect(int x, int y) const {
    Dictionary d;
    if (x < 0 || y < 0 || x >= simulation.width || y >= simulation.height)
        return d;
    const int k = y * simulation.width + x;
    d["solid"] = simulation.solid[k];
    d["type"] = simulation.typ[k];
    d["amount"] = simulation.liq[k];
    d["temperature"] = simulation.temp[k];
    d["sugar"] = simulation.sol[k * ecologist::NSOL + ecologist::SOL_SUGAR] * simulation.liq[k] / 255.0;
    d["salt"] = simulation.sol[k * ecologist::NSOL + ecologist::SOL_SALT] * simulation.liq[k] / 255.0;
    d["burning"] = !sandbox.fire.empty() && sandbox.fire[k] > 0;
    d["air"] = sandbox.air(simulation, k);
    d["back"] = sandbox.back.empty() ? 0 : sandbox.back[k];
    if (!sandbox.air_ox.empty()) {
        d["oxygen"] = sandbox.air_ox[k] / 10;   // percent
        d["co2"] = sandbox.air_carb[k] / 100;   // percent
    }
    auto m = sandbox.machines.find(k);
    if (m != sandbox.machines.end()) {
        d["machine"] = m->second.kind;
        d["on"] = m->second.on;
        d["active"] = m->second.active;
        d["open"] = m->second.open;
        d["level"] = m->second.level;
        d["period"] = m->second.period;
        d["liquid"] = m->second.liquid;
        d["salt_buffer"] = m->second.salt;
        d["charge"] = m->second.charge;
    }
    auto p = sandbox.pores.find(k);
    d["stored_water"] = p == sandbox.pores.end() ? 0 : p->second.amount;
    return d;
}
void initialize_ecologist(ModuleInitializationLevel level) {
    if (level == MODULE_INITIALIZATION_LEVEL_SCENE)
        GDREGISTER_CLASS(EcologistWorld);
}
void uninitialize_ecologist(ModuleInitializationLevel) {}
} // namespace godot
extern "C" GDExtensionBool GDE_EXPORT ecologist_library_init(GDExtensionInterfaceGetProcAddress address,
                                                             GDExtensionClassLibraryPtr library,
                                                             GDExtensionInitialization *initialization) {
    godot::GDExtensionBinding::InitObject init(address, library, initialization);
    init.register_initializer(godot::initialize_ecologist);
    init.register_terminator(godot::uninitialize_ecologist);
    init.set_minimum_library_initialization_level(godot::MODULE_INITIALIZATION_LEVEL_SCENE);
    return init.init();
}
