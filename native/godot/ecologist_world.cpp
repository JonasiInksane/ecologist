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
    ClassDB::bind_method(D_METHOD("advance", "ticks"), &EcologistWorld::advance);
    ClassDB::bind_method(D_METHOD("paint", "x", "y", "radius", "material"), &EcologistWorld::paint);
    ClassDB::bind_method(D_METHOD("paint_grains", "x", "y", "radius", "kind"), &EcologistWorld::paint_grains);
    ClassDB::bind_method(D_METHOD("heat", "x", "y", "radius", "delta"), &EcologistWorld::heat);
    ClassDB::bind_method(D_METHOD("device_action", "x", "y", "tool", "liquid"),
                         &EcologistWorld::device_action);
    ClassDB::bind_method(D_METHOD("wire_action", "x", "y"), &EcologistWorld::wire_action);
    ClassDB::bind_method(D_METHOD("dye", "x", "y", "radius", "channel"), &EcologistWorld::dye);
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
    return true;
}
void EcologistWorld::reset_demo(int seed) {
    simulation.demo(seed);
    grains.reset(simulation);
    sandbox.reset(simulation);
}
void EcologistWorld::advance(int ticks) {
    if (simulation.width)
        for (int i = 0; i < std::clamp(ticks, 0, 600); i++) {
            simulation.step();
            sandbox.step(simulation, grains);
            grains.step(simulation);
            ecologist::chemistry_step(simulation, grains);
        }
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
