// Kitchen and lab equipment (M1): see docs/design/m1-shack-slice.md. Vessel contents are tracked in grams and
// joules. Liquid crossing the open top goes through the same FluidBuffer take/put the pumps use, so mass, solutes
// and heat are conserved across it exactly as across a pump; vapour vents outside, and every joule in or out is
// booked in the sandbox budget.
#include "equipment.hpp"
#include <algorithm>
#include <cmath>
#include <iterator>
#include <vector>

namespace ecologist {
namespace {
constexpr EquipmentSpec SPECS[EQ_KINDS] = {
    {},
    {"stove", 4, 4, 0, 0, 0, 0, true},
    {"sink", 4, 4, 0, 0, 0, 0, true},
    {"table", 6, 4, 0, 0, 0, 0, true},
    {"saucepan", 2, 2, 2500, 450, 4.0, 0.5, false},
    {"candy_mold", 2, 1, 800, 150, 6.0, 2, false},
    {"salt_pan", 4, 1, 2000, 500, 4.0, 4, false},
};
constexpr int OXYGEN_DEFICIT = 12, SOL_BITTERN = SOL_METAL;
constexpr double SET_BELOW = 45, MELT_ABOVE = 90, MAX_TEMPERATURE = 400;
constexpr double SIMMER = 0.016; // g per tick per unit of surface at the boiling point, before EQUIPMENT_TIME
constexpr double SMOKE_PER_UNIT = 10, FOG_LATENT = 0.5; // world energy per unit

double buf_cap(const FluidBuffer &b, double amount) {
    return (FLUIDS[b.type].capacity + (SALT_CAP * b.sol[SOL_SALT] + SUGAR_CAP * b.sol[SOL_SUGAR]) / 255.0) * amount / 255.0;
}
double sugar_ratio(double t) { return 1.8 + 0.01 * t + 0.00018 * t * t; } // g sugar per g water, as grains.cpp
double salt_ratio(double t) { return 0.35 + 0.0003 * std::clamp(t, 0.0, 100.0); }
constexpr double BITTERN_RATIO = 1.0; // magnesium and calcium salts stay dissolved until the pan is nearly dry

bool vessel_kind(int kind) { return kind > 0 && kind < EQ_KINDS && SPECS[kind].capacity > 0; }
double liquid_capacity(const Vessel &v) { // J/K of the water and what is dissolved in it (as the world counts it)
    return FLUIDS[WATER].capacity * v.water + SUGAR_CAP * v.dissolved[SOL_SUGAR] + SALT_CAP * v.dissolved[SOL_SALT];
}
void settle(Vessel &v, double body) {
    v.temperature = v.energy / vessel_capacity(v, body);
}
// Every joule that enters or leaves a vessel is booked under a "*_J" budget, so tests can balance the books.
void book(Sandbox &s, const char *key, double joules) { s.budget[key] += joules; }
void clear_contents(Sandbox &s, Vessel &v, double body, const char *key) {
    const double t = v.temperature, before = v.energy;
    v = Vessel{};
    v.temperature = v.peak = t;
    v.energy = body * t;
    book(s, key, before - v.energy);
}
std::vector<int> mouth(const World &w, const Equipment &e) {
    std::vector<int> cells;
    const auto &spec = SPECS[e.kind];
    if (e.y > 0)
        for (int x = e.x; x < e.x + spec.width; x++)
            cells.push_back((e.y - 1) * w.width + x);
    return cells;
}
// Puts a buffer into the first open cell above the vessel (and its neighbours), returning units placed.
int release(World &w, Sandbox &s, const Equipment &e, FluidBuffer &b) {
    int placed = 0;
    for (int k : mouth(w, e)) {
        if (b.amount < 1)
            break;
        if (w.solid[k] || (w.liq[k] && w.typ[k] != b.type))
            continue;
        placed += s.put(w, b, k, int(b.amount));
    }
    return placed;
}
void dissolve_and_crystallize(Vessel &v) {
    const double t = v.temperature;
    double &sugar = v.dissolved[SOL_SUGAR], &salt = v.dissolved[SOL_SALT], &bittern = v.dissolved[SOL_BITTERN];
    const double sugar_sat = v.water * sugar_ratio(t);
    if (v.sugar_crystal > 0 && sugar < sugar_sat) {
        const double d = std::min({v.sugar_crystal, sugar_sat - sugar, v.sugar_crystal * 0.0006 * (1 + t / 20) + 0.02});
        v.sugar_crystal -= d;
        sugar += d;
    } else if (sugar > sugar_sat) {
        // Below about 10 % water a sugar melt sets as glass instead of crystallizing; that is hard candy.
        const bool glass = v.water < 0.1 * (v.water + sugar);
        const double rate = glass ? 0 : v.sugar_crystal > 0.5 ? 0.002 + 0.01 * std::min(1.0, v.sugar_crystal / sugar) : t < 60 ? 0.0002 : 0;
        const double c = (sugar - sugar_sat) * rate;
        sugar -= c;
        v.sugar_crystal += c;
    }
    const double salt_sat = v.water * salt_ratio(t);
    if (salt > salt_sat) {
        const double c = (salt - salt_sat) * 0.2;
        salt -= c;
        v.salt_crystal += c;
        v.salt_heat += c * t;
        v.salt_formed += c;
    } else if (v.salt_crystal > 0 && salt < salt_sat) {
        const double d = std::min({v.salt_crystal, salt_sat - salt, v.salt_crystal * 0.002 * (1 + t / 50) + 0.01});
        const double keep = 1 - d / v.salt_crystal;
        v.salt_heat *= keep;
        v.salt_formed *= keep;
        v.salt_crystal -= d;
        salt += d;
    }
    const double bittern_sat = v.water * BITTERN_RATIO;
    if (bittern > bittern_sat) {
        const double c = (bittern - bittern_sat) * 0.2;
        bittern -= c;
        v.bittern_crystal += c;
    } else if (v.bittern_crystal > 0 && bittern < bittern_sat) {
        const double d = std::min({v.bittern_crystal, bittern_sat - bittern, v.bittern_crystal * 0.01 + 0.01});
        v.bittern_crystal -= d;
        bittern += d;
    }
}
// Evaporating m grams at temperature t takes the water's share of capacity and the vapour's full energy out.
// An open vessel vents its vapour to the outside air: the world has no humidity to hold it, and steam let into the
// cells above condenses within a tick and drips straight back in. Closed vessels with vapour ports come in M2.
void evaporate(Sandbox &s, Vessel &v, double m, double t) {
    const double energy = m * (2.0 * t + STEAM_HIDDEN);
    v.water -= m;
    v.energy -= energy;
    v.vapour += m;
    s.budget["vented_vapour_g"] += m;
    book(s, "vented_J", energy);
}
// Vapour pressure relative to the boiling point (Clausius-Clapeyron for water), for evaporation below the boil.
double vapour_ratio(double t, double tb) { return std::exp(4895.0 * (1 / (tb + 273.15) - 1 / (t + 273.15))); }
void take_in(World &w, Sandbox &s, Equipment &e) {
    const auto &spec = SPECS[e.kind];
    Vessel &v = e.vessel;
    for (int k : mouth(w, e)) {
        // Steam that condensed in the air still carries its heat of condensation; that is fog, not a pour.
        if (w.solid[k] || !w.liq[k] || w.typ[k] != WATER || e.vessel.set || w.latent[k] > FOG_LATENT * w.liq[k])
            continue;
        const int room = int((spec.capacity - vessel_mass(v)) / GRAMS_PER_UNIT);
        if (room < 1)
            return;
        FluidBuffer b;
        const int units = s.take(w, k, b, room);
        if (units < 1)
            continue;
        const double grams = units * GRAMS_PER_UNIT;
        v.water += grams;
        for (int c = 0; c < NSOL; c++)
            if (c != OXYGEN_DEFICIT)
                v.dissolved[c] += b.sol[c] / 255.0 * grams;
        const double joules = (buf_cap(b, units) * b.temperature + b.latent) * JOULES_PER_ENERGY;
        v.energy += joules;
        s.budget["vessel_intake_units"] += units;
        book(s, "intake_J", joules);
    }
}
void lose_heat(World &w, Sandbox &s, Equipment &e, double cap) {
    Vessel &v = e.vessel;
    for (int k : mouth(w, e)) {
        if (w.solid[k])
            continue;
        const double world_cap = s.capacity(w, k), cell_cap = world_cap * JOULES_PER_ENERGY;
        const double delta = v.temperature - w.temp[k];
        double q = SPECS[e.kind].loss * EQUIPMENT_TIME / 60.0 * delta;
        const double most = std::abs(delta) * cap * cell_cap / (cap + cell_cap) * 0.5;
        q = std::clamp(q, -most, most);
        if (std::abs(q) < 1e-9)
            return;
        v.energy -= q;
        book(s, "loss_J", q);
        const double t = w.temp[k] + q / cell_cap;
        w.temp[k] = float(t);
        if (w.liq[k])
            w.latent[k] += (t - w.temp[k]) * world_cap;
        w.wake(k);
        return;
    }
}
void stoves_and_sinks(World &w, Sandbox &s) {
    for (auto &[id, stove] : s.equipment) {
        if (stove.kind != EQ_STOVE || stove.setting <= 0)
            continue;
        double joules = STOVE_WATTS[std::clamp(stove.setting, 0, 3)] * EQUIPMENT_TIME / 60.0;
        std::vector<Equipment *> pots;
        for (auto &[other, e] : s.equipment)
            if (vessel_kind(e.kind) && resting_on(w, s, other) == id)
                pots.push_back(&e);
        double used = 0;
        if (!pots.empty()) {
            for (auto *e : pots)
                if (e->vessel.temperature < MAX_TEMPERATURE) {
                    e->vessel.energy += joules / pots.size();
                    used += joules / pots.size();
                    book(s, "stove_J", joules / pots.size());
                }
        } else // an empty burner heats the air above it, but not past a glowing 250 °C
            for (int x = stove.x; x < stove.x + SPECS[EQ_STOVE].width && stove.y > 0; x++) {
                const int k = (stove.y - 1) * w.width + x;
                if (w.solid[k])
                    continue;
                const double cap = s.capacity(w, k) * JOULES_PER_ENERGY;
                const double q = std::clamp((250.0 - w.temp[k]) * cap, 0.0, joules / SPECS[EQ_STOVE].width);
                w.temp[k] += float(q / cap);
                used += q;
                w.wake(k);
            }
        s.budget["stove_joules"] += used;
    }
    // A pan standing in the sink sits in running cold water.
    for (auto &[id, e] : s.equipment) {
        const int under = resting_on(w, s, id);
        if (!vessel_kind(e.kind) || under < 0 || s.equipment[under].kind != EQ_SINK)
            continue;
        Vessel &v = e.vessel;
        const double cap = vessel_capacity(v, SPECS[e.kind].body);
        const double q = std::min(SINK_BATH * EQUIPMENT_TIME / 60.0, 0.5 * cap) * (v.temperature - BATH_TEMPERATURE);
        v.energy -= q;
        book(s, "sink_J", q);
    }
}
} // namespace

const EquipmentSpec &equipment_spec(int kind) { return SPECS[kind > 0 && kind < EQ_KINDS ? kind : 0]; }
double vessel_mass(const Vessel &v) {
    double m = v.water + v.sugar_crystal + v.salt_crystal + v.bittern_crystal + v.burnt;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            m += v.dissolved[c];
    return m;
}
double vessel_capacity(const Vessel &v, double body) {
    return body + liquid_capacity(v) + SUGAR_CAP * (v.sugar_crystal + v.burnt) + SALT_CAP * v.salt_crystal;
}
// Boiling point of a sugar solution (by mass fraction of sugar in the syrup), raised further by dissolved salts.
double boiling_point(const Vessel &v) {
    if (v.water < 1e-6)
        return 1e9;
    static constexpr double CURVE[][2] = {{0, 100},     {0.5, 102},  {0.6, 103.5}, {0.7, 106},   {0.8, 112},
                                          {0.85, 116},  {0.9, 121},  {0.93, 130},  {0.95, 140},  {0.97, 146},
                                          {0.98, 149},  {0.99, 154}, {0.995, 160}, {0.999, 175}, {1.0, 200}};
    const double x = v.dissolved[SOL_SUGAR] / (v.water + v.dissolved[SOL_SUGAR]);
    double t = 200;
    for (std::size_t i = 1; i < std::size(CURVE); i++)
        if (x <= CURVE[i][0]) {
            t = CURVE[i - 1][1] + (CURVE[i][1] - CURVE[i - 1][1]) * (x - CURVE[i - 1][0]) / (CURVE[i][0] - CURVE[i - 1][0]);
            break;
        }
    return t + std::min(8.0, 17.5 * (v.dissolved[SOL_SALT] + v.dissolved[SOL_BITTERN]) / v.water);
}
// The cook's names for a boiling sugar syrup, by how little water is left in it.
std::string candy_stage(const Vessel &v) {
    const double sugar = v.dissolved[SOL_SUGAR];
    if (sugar < 1 || sugar < v.water)
        return "";
    if (v.burnt > 0.05 * (sugar + v.burnt))
        return "burning";
    const double x = sugar / (sugar + v.water);
    return x < 0.8 ? "syrup" : x < 0.85 ? "thread" : x < 0.88 ? "soft ball" : x < 0.9 ? "firm ball" : x < 0.93 ? "hard ball"
         : x < 0.96 ? "soft crack" : x < 0.995 ? "hard crack" : "caramel";
}
int equipment_at(const World &w, const Sandbox &s, int x, int y) {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height || w.solid[y * w.width + x] != B_EQUIPMENT)
        return -1;
    for (const auto &[id, e] : s.equipment) {
        const auto &spec = SPECS[e.kind];
        if (x >= e.x && x < e.x + spec.width && y >= e.y && y < e.y + spec.height)
            return id;
    }
    return -1;
}
int resting_on(const World &w, const Sandbox &s, int id) {
    auto it = s.equipment.find(id);
    if (it == s.equipment.end())
        return -1;
    const auto &e = it->second;
    return equipment_at(w, s, e.x, e.y + SPECS[e.kind].height);
}
// Stands a piece of equipment on the tile under (x, y): its bottom row is the tile's lower cell row.
int place_equipment(World &w, Grains &g, Sandbox &s, int kind, int x, int y, std::string *why) {
    auto fail = [&](const char *reason) {
        if (why)
            *why = reason;
        return -1;
    };
    if (kind <= 0 || kind >= EQ_KINDS)
        return fail("unknown equipment");
    const auto &spec = SPECS[kind];
    const int x0 = x & ~1, y0 = (y | 1) - spec.height + 1;
    if (x < 0 || y < 0 || x0 + spec.width > w.width || y0 < 1 || y0 + spec.height >= w.height)
        return fail("it does not fit there");
    for (int cy = y0; cy < y0 + spec.height; cy++)
        for (int cx = x0; cx < x0 + spec.width; cx++) {
            const int k = cy * w.width + cx;
            if (w.solid[k] || w.liq[k] || (s.back[k] & BACK_DOOR_OPEN))
                return fail("something is in the way");
        }
    for (int cx = x0; cx < x0 + spec.width; cx++) {
        const int below = (y0 + spec.height) * w.width + cx;
        if (!w.solid[below])
            return fail("it needs a floor or a table under it");
        if (w.solid[below] == B_EQUIPMENT) {
            const int under = equipment_at(w, s, cx, y0 + spec.height);
            if (under < 0 || !SPECS[s.equipment[under].kind].support)
                return fail("it can only stand on a floor, a table, a stove or a sink");
        }
    }
    for (int cy = y0; cy < y0 + spec.height; cy++)
        for (int cx = x0; cx < x0 + spec.width; cx++) {
            const int k = cy * w.width + cx;
            g.erase_cell(cx, cy);
            w.solid[k] = B_EQUIPMENT;
            s.held[k] = 255;
            s.back[k] &= ~BACK_LADDER;
            w.wake(k);
        }
    const int id = y0 * w.width + x0;
    Equipment e;
    e.kind = kind;
    e.x = x0;
    e.y = y0;
    e.vessel.temperature = e.vessel.peak = 20;
    e.vessel.energy = spec.body * 20;
    book(s, "placed_J", e.vessel.energy);
    s.equipment[id] = e;
    return id;
}
bool remove_equipment(World &w, Sandbox &s, int id, std::string *why) {
    auto it = s.equipment.find(id);
    if (it == s.equipment.end())
        return false;
    const auto &e = it->second;
    const auto &spec = SPECS[e.kind];
    if (vessel_mass(e.vessel) > 0.5) {
        if (why)
            *why = "empty it first";
        return false;
    }
    for (const auto &[other, o] : s.equipment)
        if (other != id && resting_on(w, s, other) == id) {
            if (why)
                *why = "take what stands on it off first";
            return false;
        }
    for (int cy = e.y; cy < e.y + spec.height; cy++)
        for (int cx = e.x; cx < e.x + spec.width; cx++) {
            const int k = cy * w.width + cx;
            w.solid[k] = 0;
            w.wake(k);
        }
    book(s, "removed_J", e.vessel.energy);
    s.equipment.erase(it);
    return true;
}

// Carries a piece of equipment, with whatever is in it, to another spot.
int move_equipment(World &w, Grains &g, Sandbox &s, int id, int x, int y, std::string *why) {
    auto it = s.equipment.find(id);
    if (it == s.equipment.end()) {
        if (why)
            *why = "nothing to move";
        return -1;
    }
    for (const auto &[other, o] : s.equipment)
        if (other != id && resting_on(w, s, other) == id) {
            if (why)
                *why = "take what stands on it off first";
            return -1;
        }
    const Equipment old = it->second;
    const auto &spec = SPECS[old.kind];
    auto cells = [&](int block) {
        for (int cy = old.y; cy < old.y + spec.height; cy++)
            for (int cx = old.x; cx < old.x + spec.width; cx++) {
                w.solid[cy * w.width + cx] = block;
                w.wake(cy * w.width + cx);
            }
    };
    cells(0);
    s.equipment.erase(it);
    const int moved = place_equipment(w, g, s, old.kind, x, y, why);
    if (moved < 0) {
        cells(B_EQUIPMENT);
        s.equipment[id] = old;
        return -1;
    }
    book(s, "placed_J", -s.equipment[moved].vessel.energy); // the same vessel, carried, not a new one
    s.equipment[moved].setting = old.setting;
    s.equipment[moved].vessel = old.vessel;
    return moved;
}

void equipment_step(World &w, Grains &g, Sandbox &s) {
    (void)g;
    if (s.equipment.empty())
        return;
    // Equipment whose cells were blown up or painted over is gone, with its contents.
    for (auto it = s.equipment.begin(); it != s.equipment.end();) {
        const auto &e = it->second;
        bool whole = true;
        for (int cy = e.y; cy < e.y + SPECS[e.kind].height && whole; cy++)
            for (int cx = e.x; cx < e.x + SPECS[e.kind].width; cx++)
                whole = whole && w.solid[cy * w.width + cx] == B_EQUIPMENT;
        if (whole) {
            ++it;
            continue;
        }
        s.budget["equipment_destroyed_g"] += vessel_mass(e.vessel);
        book(s, "destroyed_J", e.vessel.energy);
        for (int cy = e.y; cy < e.y + SPECS[e.kind].height; cy++)
            for (int cx = e.x; cx < e.x + SPECS[e.kind].width; cx++)
                if (w.solid[cy * w.width + cx] == B_EQUIPMENT)
                    w.solid[cy * w.width + cx] = 0;
        it = s.equipment.erase(it);
    }
    stoves_and_sinks(w, s);
    for (auto &entry : s.equipment) {
        Equipment &e = entry.second;
        if (!vessel_kind(e.kind))
            continue;
        const auto &spec = SPECS[e.kind];
        Vessel &v = e.vessel;
        settle(v, spec.body);
        lose_heat(w, s, e, vessel_capacity(v, spec.body));
        take_in(w, s, e);
        settle(v, spec.body);
        dissolve_and_crystallize(v);
        settle(v, spec.body);
        // Boil off what the heat allows, or evaporate slowly from a warm open surface.
        v.vapour *= 1 - 1 / 60.0;
        if (v.water > 0) {
            const double tb = boiling_point(v);
            if (v.temperature > tb) {
                // The boiling point climbs as water leaves, so find the mass whose loss leaves the syrup exactly at
                // its new boiling point (the temperature falls with m and the boiling point rises with it).
                auto excess = [&](double m, double &at) {
                    Vessel left = v;
                    left.water -= m;
                    at = boiling_point(left);
                    return (v.energy - m * (2.0 * at + STEAM_HIDDEN)) / vessel_capacity(left, spec.body) - at;
                };
                double lo = 0, hi = v.water, at = tb;
                if (excess(hi, at) >= 0)
                    lo = hi;
                else
                    for (int i = 0; i < 48; i++) {
                        const double mid = 0.5 * (lo + hi);
                        (excess(mid, at) > 0 ? lo : hi) = mid;
                    }
                excess(lo, at);
                if (lo > 0)
                    evaporate(s, v, lo, std::min(at, MAX_TEMPERATURE));
            } else if (v.temperature > 30) {
                // A thick syrup skins over and gives up its last water slowly once it stops boiling.
                const double thin = std::min(1.0, v.water / (0.25 * (v.water + v.dissolved[SOL_SUGAR]) + 1e-9));
                const double m = std::min(v.water, spec.surface * SIMMER * EQUIPMENT_TIME * thin * vapour_ratio(v.temperature, tb));
                evaporate(s, v, m, v.temperature);
            }
            settle(v, spec.body);
        }
        // Sugar caramelizes past 160 °C and burns to smoke past 190 °C.
        double &sugar = v.dissolved[SOL_SUGAR];
        if (v.temperature > 160 && sugar > 0) {
            const double d = sugar * std::min(0.05, 0.00002 * std::pow(2.0, (v.temperature - 165) / 10) * EQUIPMENT_TIME);
            sugar -= d;
            v.burnt += d;
        }
        if (v.temperature > 190 && v.burnt > 0) {
            const double d = std::min(v.burnt, v.burnt * 0.0005 * EQUIPMENT_TIME * (v.temperature - 190) / 10);
            v.burnt -= d;
            v.energy -= SUGAR_CAP * d * v.temperature;
            book(s, "smoke_J", SUGAR_CAP * d * v.temperature);
            v.smoke += d;
            s.budget["burnt_sugar_smoke_g"] += d;
            settle(v, spec.body);
        }
        if (vessel_mass(v) > 0.5)
            v.peak = std::max(v.peak, v.temperature);
        if (v.smoke >= SMOKE_PER_UNIT) {
            FluidBuffer b;
            b.type = L_SMOKE;
            b.amount = std::floor(v.smoke / SMOKE_PER_UNIT);
            b.temperature = v.temperature;
            v.smoke -= release(w, s, e, b) * SMOKE_PER_UNIT;
        }
        if (e.kind == EQ_CANDY_MOLD) {
            const double mass = vessel_mass(v);
            if (!v.set && mass > 1 && v.temperature < SET_BELOW && v.water <= 0.08 * mass)
                v.set = true;
            else if (v.set && v.temperature > MELT_ABOVE)
                v.set = false;
        }
        if (vessel_mass(v) < 1e-9) // keep an empty vessel's numbers clean
            clear_contents(s, v, spec.body, "drained_J");
    }
}

// Adds a bought or tapped ingredient at its own temperature.
bool vessel_add(Sandbox &s, int id, const std::string &ingredient, double grams, double temperature, std::string *why) {
    auto it = s.equipment.find(id);
    auto fail = [&](const char *reason) {
        if (why)
            *why = reason;
        return false;
    };
    if (it == s.equipment.end() || !vessel_kind(it->second.kind))
        return fail("that is not a vessel");
    Equipment &e = it->second;
    Vessel &v = e.vessel;
    if (!(grams > 0) || !std::isfinite(grams) || !std::isfinite(temperature))
        return fail("choose an amount");
    if (v.set)
        return fail("the candy in it has set; collect it first");
    if (vessel_mass(v) + grams > SPECS[e.kind].capacity + 1e-9)
        return fail("it would overflow");
    Vessel add;
    if (ingredient == "water")
        add.water = grams;
    else if (ingredient == "sugar")
        add.sugar_crystal = grams;
    else if (ingredient == "salt")
        add.salt_crystal = grams;
    else if (ingredient == "sea_water") { // 3.5 % sea salts: sodium chloride and the bitter magnesium and calcium salts
        add.water = grams * 0.965;
        add.dissolved[SOL_SALT] = grams * 0.027;
        add.dissolved[SOL_BITTERN] = grams * 0.008;
    } else
        return fail("unknown ingredient");
    v.water += add.water;
    v.sugar_crystal += add.sugar_crystal;
    v.salt_crystal += add.salt_crystal;
    for (int c = 0; c < NSOL; c++)
        v.dissolved[c] += add.dissolved[c];
    v.energy += vessel_capacity(add, 0) * temperature;
    book(s, "added_J", vessel_capacity(add, 0) * temperature);
    settle(v, SPECS[e.kind].body);
    return true;
}
// Pours one vessel into another (the player carries it), as much as fits. Returns grams moved.
double vessel_transfer(Sandbox &s, int from, int to, std::string *why) {
    auto a = s.equipment.find(from), b = s.equipment.find(to);
    if (a == s.equipment.end() || b == s.equipment.end() || from == to || !vessel_kind(a->second.kind) || !vessel_kind(b->second.kind)) {
        if (why)
            *why = "pour into another vessel";
        return 0;
    }
    Vessel &src = a->second.vessel, &dst = b->second.vessel;
    if (src.set || dst.set) {
        if (why)
            *why = "set candy cannot be poured";
        return 0;
    }
    const double mass = vessel_mass(src), room = SPECS[b->second.kind].capacity - vessel_mass(dst);
    if (mass < 1e-9 || room <= 0) {
        if (why)
            *why = mass < 1e-9 ? "it is empty" : "it is full";
        return 0;
    }
    const double f = std::min(1.0, room / mass);
    Vessel moved;
    moved.water = src.water * f;
    moved.sugar_crystal = src.sugar_crystal * f;
    moved.salt_crystal = src.salt_crystal * f;
    moved.bittern_crystal = src.bittern_crystal * f;
    moved.burnt = src.burnt * f;
    for (int c = 0; c < NSOL; c++)
        moved.dissolved[c] = src.dissolved[c] * f;
    const double energy = vessel_capacity(moved, 0) * src.temperature;
    src.water -= moved.water;
    src.sugar_crystal -= moved.sugar_crystal;
    src.salt_crystal -= moved.salt_crystal;
    src.bittern_crystal -= moved.bittern_crystal;
    src.burnt -= moved.burnt;
    for (int c = 0; c < NSOL; c++)
        src.dissolved[c] -= moved.dissolved[c];
    src.energy -= energy;
    dst.water += moved.water;
    dst.sugar_crystal += moved.sugar_crystal;
    dst.salt_crystal += moved.salt_crystal;
    dst.bittern_crystal += moved.bittern_crystal;
    dst.burnt += moved.burnt;
    for (int c = 0; c < NSOL; c++)
        dst.dissolved[c] += moved.dissolved[c];
    dst.energy += energy;
    dst.salt_heat += src.salt_heat * f;
    dst.salt_formed += src.salt_formed * f;
    src.salt_heat *= 1 - f;
    src.salt_formed *= 1 - f;
    dst.peak = std::max(dst.peak, src.peak);
    settle(src, SPECS[a->second.kind].body);
    settle(dst, SPECS[b->second.kind].body);
    return vessel_mass(moved);
}
// Tips the liquid out onto the floor as world cells, in whole units; crystals and what is stuck to the pan stay.
int vessel_spill(World &w, Sandbox &s, int id) {
    auto it = s.equipment.find(id);
    if (it == s.equipment.end() || !vessel_kind(it->second.kind) || it->second.vessel.set)
        return 0;
    Equipment &e = it->second;
    Vessel &v = e.vessel;
    const int units = int(std::floor(v.water / GRAMS_PER_UNIT));
    if (units < 1)
        return 0;
    FluidBuffer b;
    b.type = WATER;
    b.amount = std::min(units, 255);
    b.temperature = v.temperature;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            b.sol[c] = 255.0 * v.dissolved[c] / v.water;
    const int start = b.amount;
    // Into the open cells above and beside the vessel, nearest first.
    std::vector<int> cells = mouth(w, e);
    const auto &spec = SPECS[e.kind];
    for (int cy = e.y; cy < e.y + spec.height; cy++)
        for (int cx : {e.x - 1, e.x + spec.width})
            if (cx >= 0 && cx < w.width)
                cells.push_back(cy * w.width + cx);
    for (int k : cells)
        if (b.amount >= 1 && !w.solid[k])
            s.put(w, b, k, int(b.amount));
    const int placed = start - int(b.amount);
    if (placed > 0) {
        const double grams = placed * GRAMS_PER_UNIT, f = grams / v.water;
        Vessel out;
        out.water = grams;
        for (int c = 0; c < NSOL; c++)
            if (c != OXYGEN_DEFICIT)
                out.dissolved[c] = v.dissolved[c] * f;
        v.energy -= liquid_capacity(out) * v.temperature;
        book(s, "spilled_J", liquid_capacity(out) * v.temperature);
        v.water -= grams;
        for (int c = 0; c < NSOL; c++)
            v.dissolved[c] -= out.dissolved[c];
        settle(v, spec.body);
        s.budget["vessel_spill_units"] += placed;
    }
    return placed;
}
// Pours liquid down the drain. With keep_crystals, wet crystals keep 8 % of their weight in brine.
double vessel_discard(Sandbox &s, int id, bool keep_crystals) {
    auto it = s.equipment.find(id);
    if (it == s.equipment.end() || !vessel_kind(it->second.kind))
        return 0;
    Equipment &e = it->second;
    Vessel &v = e.vessel;
    const double before = vessel_mass(v);
    if (!keep_crystals || v.set) {
        clear_contents(s, v, SPECS[e.kind].body, "drained_J");
        s.budget["drained_g"] += before;
        return before;
    }
    const double crystals = v.sugar_crystal + v.salt_crystal + v.bittern_crystal;
    const double keep = v.water > 0 ? std::min(1.0, 0.08 * crystals / v.water) : 1;
    Vessel out;
    out.water = v.water * (1 - keep);
    for (int c = 0; c < NSOL; c++)
        out.dissolved[c] = v.dissolved[c] * (1 - keep);
    v.energy -= liquid_capacity(out) * v.temperature;
    book(s, "drained_J", liquid_capacity(out) * v.temperature);
    v.water -= out.water;
    for (int c = 0; c < NSOL; c++)
        v.dissolved[c] -= out.dissolved[c];
    settle(v, SPECS[e.kind].body);
    s.budget["drained_g"] += before - vessel_mass(v);
    return before - vessel_mass(v);
}

// Takes the finished product out of a vessel and grades it. Candy comes from a set mold, syrup from a cool
// saucepan, salt crystals (with the brine that clings to them) from a salt pan.
Product vessel_collect(Sandbox &s, int id, std::string *why) {
    Product p;
    auto it = s.equipment.find(id);
    auto fail = [&](const char *reason) {
        if (why)
            *why = reason;
        return Product{};
    };
    if (it == s.equipment.end() || !vessel_kind(it->second.kind))
        return fail("nothing to collect");
    Equipment &e = it->second;
    Vessel &v = e.vessel;
    const double body = SPECS[e.kind].body, mass = vessel_mass(v);
    double impurity = v.dissolved[SOL_SALT] + v.salt_crystal + v.bittern_crystal;
    for (int c = 0; c < NSOL; c++)
        if (c != SOL_SUGAR && c != SOL_SALT && c != OXYGEN_DEFICIT)
            impurity += v.dissolved[c];
    if (e.kind == EQ_CANDY_MOLD) {
        if (!v.set)
            return fail(mass < 1 ? "the mold is empty" : v.temperature >= SET_BELOW ? "let it cool and set first" : "too much water left; it will not set");
        const double sugar = v.dissolved[SOL_SUGAR] + v.sugar_crystal + v.burnt;
        const double water = v.water / mass, burnt = v.burnt / sugar, grainy = v.sugar_crystal / mass, dirty = impurity / mass;
        p.grams = mass;
        if (burnt > 0.15) {
            p.id = "burnt_candy";
            p.grade = "-";
            p.note = "Burnt black. Someone will buy it.";
        } else if (water <= 0.03 && burnt <= 0.01 && grainy <= 0.02 && dirty <= 0.005) {
            p.id = "hard_candy_a";
            p.grade = "A";
            p.note = "Glass-clear hard candy.";
        } else if (water <= 0.05 && burnt <= 0.05 && grainy <= 0.06 && dirty <= 0.02) {
            p.id = "hard_candy_b";
            p.grade = "B";
            p.note = grainy > 0.02 ? "A little grainy." : burnt > 0.01 ? "A little dark." : "Slightly soft.";
        } else {
            p.id = "hard_candy_c";
            p.grade = "C";
            p.note = grainy > 0.06 ? "Grainy: sugar crystals got in." : burnt > 0.05 ? "Scorched." : "Sticky: pulled before the hard crack.";
        }
        clear_contents(s, v, body, "collected_J");
        return p;
    }
    if (e.kind == EQ_SAUCEPAN) {
        const double sugar = v.dissolved[SOL_SUGAR] + v.sugar_crystal;
        if (sugar + v.water < 20)
            return fail("there is not enough in it");
        if (v.temperature > 50)
            return fail("let it cool below 50 °C before bottling");
        const double brix = sugar / (sugar + v.water);
        if (brix < 0.4 || brix > 0.75)
            return fail("that is not a syrup anyone would buy");
        const bool rich = std::abs(brix - 2.0 / 3) < std::abs(brix - 0.5);
        const double off = std::abs(brix - (rich ? 2.0 / 3 : 0.5));
        int grade = off <= 0.015 ? 0 : off <= 0.04 ? 1 : off <= 0.08 ? 2 : 3;
        if (v.sugar_crystal > 0.01 * mass || v.burnt > 0.02 * mass)
            grade = std::max(grade, 2);
        if (impurity > 0.005 * mass)
            grade = std::max(grade, 1);
        if (grade > 2)
            return fail("too far from a 1:1 or 2:1 syrup to sell");
        p.grade = std::string(1, char('A' + grade));
        p.id = std::string(rich ? "syrup_rich_" : "syrup_simple_") + char('a' + grade);
        p.grams = mass;
        p.note = std::string(rich ? "Rich" : "Simple") + " syrup at " + std::to_string(int(std::lround(brix * 100))) + " % sugar.";
        clear_contents(s, v, body, "collected_J");
        return p;
    }
    // Salt pan: the crystals and the brine that clings to them.
    const double crystals = v.salt_crystal + v.bittern_crystal;
    if (crystals < 1)
        return fail("no crystals yet");
    const double wet = std::min(v.water, 0.12 * crystals), f = v.water > 0 ? wet / v.water : 0;
    double carried = 0;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            carried += v.dissolved[c] * f;
    const double grams = crystals + wet + carried;
    const double purity = (v.salt_crystal + v.dissolved[SOL_SALT] * f) / (crystals + carried), moisture = wet / grams;
    const double formed_at = v.salt_formed > 0 ? v.salt_heat / v.salt_formed : 100;
    const bool grown = v.salt_formed >= 0.8 * v.salt_crystal;
    if (purity >= 0.97 && moisture <= 0.02 && formed_at < 90 && grown) {
        p.id = "sea_salt_flaky";
        p.grade = "A";
        p.note = "Flaky sea salt, grown slowly below the boil.";
    } else if (purity >= 0.95 && moisture <= 0.03) {
        p.id = "sea_salt";
        p.grade = "B";
        p.note = formed_at >= 90 ? "Fine sea salt; boiled hard, so no flakes." : "Fine sea salt.";
    } else if (purity >= 0.85 && moisture <= 0.10) {
        p.id = "coarse_salt";
        p.grade = "C";
        p.note = moisture > 0.03 ? "Damp. Dry it next time." : "Bitter: the bitterns crystallized with it.";
    } else {
        p.id = "road_salt";
        p.grade = "-";
        p.note = "Technically salt. The council buys it for the roads.";
    }
    p.grams = grams;
    Vessel out;
    out.water = wet;
    out.salt_crystal = v.salt_crystal;
    out.bittern_crystal = v.bittern_crystal;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            out.dissolved[c] = v.dissolved[c] * f;
    v.energy -= vessel_capacity(out, 0) * v.temperature;
    book(s, "collected_J", vessel_capacity(out, 0) * v.temperature);
    v.water -= wet;
    for (int c = 0; c < NSOL; c++)
        v.dissolved[c] -= out.dissolved[c];
    v.salt_crystal = v.bittern_crystal = v.salt_heat = v.salt_formed = 0;
    settle(v, body);
    return p;
}
} // namespace ecologist
