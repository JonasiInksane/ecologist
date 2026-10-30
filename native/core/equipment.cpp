// Kitchen and lab equipment (M1) and the logistics kit (M2): see docs/design/m1-shack-slice.md and
// docs/design/m2-logistics.md. Vessel contents are tracked in grams and joules. Liquid crossing an open top or a
// port goes through the same FluidBuffer take/put the pumps use, so mass, solutes and heat are conserved across it
// exactly as across a pump; vapour vents outside, and every joule in or out is booked in the sandbox budget.
#include "equipment.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
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
    {"laptop", 2, 1, 0, 0, 0, 0, false},
    {"drum", 2, 4, 200000, 9000, 2.0, 0, false, true},
    {"tote", 6, 6, 1000000, 100000, 6.0, 0, false, true},
    {"coupling", 2, 2, 20000, 5000, 0.5, 0, false, true},
    {"kettle", 6, 4, 60000, 20000, 12.0, 6, false, false},
    {"centrifuge", 4, 4, 30000, 30000, 3.0, 0.5, false, false, 30000},
};
constexpr int OXYGEN_DEFICIT = 12, SOL_BITTERN = SOL_METAL, SOL_COLLOID = SOL_SILT, SOL_ASH = SOL_METAL, SOL_ACIDS = 7, SOL_LIME = 8;
constexpr double SET_BELOW = 45, MELT_ABOVE = 90, MAX_TEMPERATURE = 400;
constexpr double SIMMER = 0.016; // g per tick per unit of surface at the boiling point, before EQUIPMENT_TIME
constexpr double SMOKE_PER_UNIT = 10, FOG_LATENT = 0.5; // world energy per unit
constexpr double CASING_BODY = 5000;                     // J/K of the centrifuge casing
// Sugar beet per gram (M2): water, sucrose, marc (the insoluble pulp), colloids (pectin, protein) and ash.
constexpr double BEET_WATER = 0.755, BEET_SUGAR = 0.17, BEET_MARC = 0.05, BEET_COLLOID = 0.015, BEET_ASH = 0.01;
constexpr double MARC_CAP = 1.4, MUD_CAP = 1.0, DIRT_CAP = 1.0;
constexpr double DIFFUSE = 0.0001; // per tick at full rate, before EQUIPMENT_TIME: cossettes give up their sugar in ~45 s
constexpr double SPIN_FILM = 0.015, SPIN_RATE = 0.01; // the syrup film a spun crystal bed keeps, and how fast it spins out
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
    const double capacity = vessel_capacity(v, body);
    if (capacity > 1e-12)
        v.temperature = v.energy / capacity;
}
double tissue(const Vessel &v) { return v.beet + v.beet_water + v.beet_sugar + v.beet_colloid + v.beet_ash; }
double liquid_mass(const Vessel &v) { // the water and what is dissolved in it
    double m = v.water;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            m += v.dissolved[c];
    return m;
}
double nonsugar(const Vessel &v) { // dissolved non-sugars
    return liquid_mass(v) - v.water - v.dissolved[SOL_SUGAR];
}
double compartment_body(int kind, bool aux) { return aux ? CASING_BODY : SPECS[kind].body; }
double compartment_capacity(int kind, bool aux) { return aux ? SPECS[kind].aux : SPECS[kind].capacity; }
// Moves the share f of everything in one vessel into another, carrying its heat.
void move_share(Vessel &from, double from_body, Vessel &to, double to_body, double f) {
    Vessel moved;
    moved.water = from.water * f;
    for (int c = 0; c < NSOL; c++)
        moved.dissolved[c] = from.dissolved[c] * f;
    moved.sugar_crystal = from.sugar_crystal * f;
    moved.salt_crystal = from.salt_crystal * f;
    moved.bittern_crystal = from.bittern_crystal * f;
    moved.burnt = from.burnt * f;
    moved.beet = from.beet * f;
    moved.beet_water = from.beet_water * f;
    moved.beet_sugar = from.beet_sugar * f;
    moved.beet_colloid = from.beet_colloid * f;
    moved.beet_ash = from.beet_ash * f;
    moved.mud = from.mud * f;
    moved.crystal_dirt = from.crystal_dirt * f;
    const double energy = vessel_capacity(moved, 0) * from.temperature;
    const double cut = tissue(moved) + tissue(to) > 0 ? (from.beet_cut * tissue(moved) + to.beet_cut * tissue(to)) / (tissue(moved) + tissue(to)) : 0;
    from.water -= moved.water;
    to.water += moved.water;
    for (int c = 0; c < NSOL; c++) {
        from.dissolved[c] -= moved.dissolved[c];
        to.dissolved[c] += moved.dissolved[c];
    }
    for (auto field : {&Vessel::sugar_crystal, &Vessel::salt_crystal, &Vessel::bittern_crystal, &Vessel::burnt, &Vessel::beet,
                       &Vessel::beet_water, &Vessel::beet_sugar, &Vessel::beet_colloid, &Vessel::beet_ash, &Vessel::mud,
                       &Vessel::crystal_dirt}) {
        from.*field -= moved.*field;
        to.*field += moved.*field;
    }
    to.beet_cut = cut;
    from.energy -= energy;
    to.energy += energy;
    to.salt_heat += from.salt_heat * f;
    to.salt_formed += from.salt_formed * f;
    from.salt_heat *= 1 - f;
    from.salt_formed *= 1 - f;
    to.peak = std::max(to.peak, from.peak);
    settle(from, from_body);
    settle(to, to_body);
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
// Takes `out` (part of v's contents) out of the vessel with its heat at the vessel's temperature; returns the joules.
double subtract(Vessel &v, double body, const Vessel &out) {
    const double joules = vessel_capacity(out, 0) * v.temperature;
    const double cut = v.beet_cut;
    v.water -= out.water;
    for (int c = 0; c < NSOL; c++)
        v.dissolved[c] -= out.dissolved[c];
    for (auto field : {&Vessel::sugar_crystal, &Vessel::salt_crystal, &Vessel::bittern_crystal, &Vessel::burnt, &Vessel::beet,
                       &Vessel::beet_water, &Vessel::beet_sugar, &Vessel::beet_colloid, &Vessel::beet_ash, &Vessel::mud,
                       &Vessel::crystal_dirt})
        v.*field = std::max(0.0, v.*field - out.*field);
    v.beet_cut = tissue(v) > 1e-9 ? cut : 0;
    v.energy -= joules;
    settle(v, body);
    return joules;
}
// The same, for contents leaving the equipment: the heat is booked under key.
void take_out(Sandbox &s, Vessel &v, double body, const Vessel &out, const char *key) { book(s, key, subtract(v, body, out)); }
// The liquid share f of a vessel: its water with what is dissolved in it.
Vessel liquid_share(const Vessel &v, double f) {
    Vessel out;
    out.water = v.water * f;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            out.dissolved[c] = v.dissolved[c] * f;
    return out;
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
// Dissolving and crystallizing towards the temperature's solubility; beet cells giving up their sap; lime
// clearing colloids; and an alkaline juice browning as it boils.
void chemistry(Vessel &v) {
    const double t = v.temperature;
    double &sugar = v.dissolved[SOL_SUGAR], &salt = v.dissolved[SOL_SALT], &bittern = v.dissolved[SOL_BITTERN];
    // Sugar diffuses out of the beet's cells into the liquid around them, and their colloids and ash with it. The
    // cell walls only open up once heated past about 50 °C; shredding into cossettes gives a dozen times the surface.
    if (v.beet_water > 1e-9 && v.water > 1e-9) {
        const double open = 0.04 + 0.96 * std::clamp((t - 50) / 22, 0.0, 1.0);
        const double k = DIFFUSE * EQUIPMENT_TIME * open * (0.08 + 0.92 * v.beet_cut);
        const double reduced = v.beet_water * v.water / (v.beet_water + v.water);
        for (auto [inside, channel] : {std::pair{&v.beet_sugar, SOL_SUGAR}, {&v.beet_colloid, SOL_COLLOID}, {&v.beet_ash, SOL_ASH}}) {
            const double flux = k * (*inside / v.beet_water - v.dissolved[channel] / v.water) * reduced;
            *inside -= flux;
            v.dissolved[channel] += flux;
        }
        // Past 80 °C the pectin in the marc breaks down and clouds the juice.
        if (t > 80) {
            const double d = v.beet * 5e-7 * (t - 80) * EQUIPMENT_TIME;
            v.beet -= d;
            v.beet_colloid += d;
        }
    }
    // Hot lime coagulates the colloids into a mud that settles out; what lime is left over stays dissolved.
    double &lime = v.dissolved[SOL_LIME], &colloid = v.dissolved[SOL_COLLOID];
    if (t > 60 && lime > 0 && colloid > 0) {
        const double r = std::min(lime, colloid) * 0.001 * EQUIPMENT_TIME * std::clamp((t - 60) / 25, 0.0, 1.0);
        lime -= r;
        colloid -= r;
        v.mud += 2 * r;
    }
    // Leftover lime browns the sugar while it boils.
    if (t > 100 && lime > 0 && sugar > 0 && v.water > 1e-6) {
        const double d = std::min(sugar, sugar * 0.00007 * EQUIPMENT_TIME * lime / v.water);
        sugar -= d;
        v.burnt += d;
    }
    const double sugar_sat = v.water * sugar_ratio(t);
    if (v.sugar_crystal > 0 && sugar < sugar_sat) {
        const double d = std::min({v.sugar_crystal, sugar_sat - sugar, v.sugar_crystal * 0.0006 * (1 + t / 20) + 0.02});
        const double freed = v.crystal_dirt * d / v.sugar_crystal; // what the dissolved crystal had trapped
        v.sugar_crystal -= d;
        sugar += d;
        v.crystal_dirt -= freed;
        v.dissolved[SOL_ASH] += freed;
    } else if (sugar > sugar_sat) {
        // Below about 10 % water a sugar melt sets as glass instead of crystallizing; that is hard candy.
        const bool glass = v.water < 0.1 * (v.water + sugar);
        // Seed crystals grow fast; without them a cool syrup only slowly finds its own grain, and molasses, with a
        // tenth or more of non-sugars in it, never does.
        const double seeded = v.sugar_crystal > 0.5 ? 0.2 * std::min(0.05, v.sugar_crystal / sugar) + 0.01 * std::min(1.0, v.sugar_crystal / sugar) : 0;
        const double unseeded = t < 60 ? 0.0002 * std::max(0.0, 1 - 10 * nonsugar(v) / (sugar + nonsugar(v))) : 0;
        double rate = glass ? 0 : seeded > 0 ? 0.002 + seeded : unseeded;
        rate /= 1 + 20 * colloid / sugar; // colloids coat the crystal faces and slow them
        const double c = (sugar - sugar_sat) * rate;
        sugar -= c;
        v.sugar_crystal += c;
        // Growing crystals trap a little of the mother liquor, so a dirty syrup makes dirty sugar.
        const double dirt = nonsugar(v);
        if (c > 0 && dirt > 1e-12) {
            const double trapped = std::min(dirt, c * 0.02 * dirt / (sugar + dirt));
            for (int ch = 0; ch < NSOL; ch++)
                if (ch != SOL_SUGAR && ch != OXYGEN_DEFICIT && v.dissolved[ch] > 0)
                    v.dissolved[ch] -= trapped * v.dissolved[ch] / dirt;
            v.crystal_dirt += trapped;
        }
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
void lose_heat(World &w, Sandbox &s, const Equipment &e, Vessel &v, double loss, double cap) {
    for (int k : mouth(w, e)) {
        if (w.solid[k])
            continue;
        const double world_cap = s.capacity(w, k), cell_cap = world_cap * JOULES_PER_ENERGY;
        const double delta = v.temperature - w.temp[k];
        double q = loss * EQUIPMENT_TIME / 60.0 * delta;
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
    // The kettle has its own gas ring under it.
    for (auto &[id, e] : s.equipment)
        if (e.kind == EQ_KETTLE && e.setting > 0 && e.vessel.temperature < MAX_TEMPERATURE) {
            const double joules = KETTLE_WATTS[std::clamp(e.setting, 0, 3)] * EQUIPMENT_TIME / 60.0;
            e.vessel.energy += joules;
            book(s, "stove_J", joules);
            s.budget["stove_joules"] += joules;
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
// One tick of one compartment: heat lost to the air above, water taken in through an open top, chemistry, then
// boiling or evaporation and burning. A closed compartment keeps its water: it neither takes in nor evaporates.
void work(World &w, Sandbox &s, Equipment &e, Vessel &v, double body, double loss, bool open) {
    const auto &spec = SPECS[e.kind];
    settle(v, body);
    lose_heat(w, s, e, v, loss, vessel_capacity(v, body));
    if (open)
        take_in(w, s, e);
    settle(v, body);
    chemistry(v);
    settle(v, body);
    // Boil off what the heat allows, or evaporate slowly from a warm open surface.
    v.vapour *= 1 - 1 / 60.0;
    if (open && v.water > 0) {
        const double tb = boiling_point(v);
        if (v.temperature > tb) {
            // The boiling point climbs as water leaves, so find the mass whose loss leaves the syrup exactly at
            // its new boiling point (the temperature falls with m and the boiling point rises with it).
            auto excess = [&](double m, double &at) {
                Vessel left = v;
                left.water -= m;
                at = boiling_point(left);
                return (v.energy - m * (2.0 * at + STEAM_HIDDEN)) / vessel_capacity(left, body) - at;
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
        settle(v, body);
    }
    // Sugar caramelizes past 160 °C and burns to smoke past 190 °C.
    double &sugar = v.dissolved[SOL_SUGAR];
    if (v.temperature > 160 && sugar > 0) {
        const double d = sugar * std::min(0.05, 0.00002 * std::pow(2.0, (v.temperature - 165) / 10) * EQUIPMENT_TIME);
        sugar -= d;
        v.burnt += d;
    }
    if (open && v.temperature > 190 && v.burnt > 0) {
        const double d = std::min(v.burnt, v.burnt * 0.0005 * EQUIPMENT_TIME * (v.temperature - 190) / 10);
        v.burnt -= d;
        v.energy -= SUGAR_CAP * d * v.temperature;
        book(s, "smoke_J", SUGAR_CAP * d * v.temperature);
        v.smoke += d;
        s.budget["burnt_sugar_smoke_g"] += d;
        settle(v, body);
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
        clear_contents(s, v, body, "drained_J");
}
// A spinning centrifuge flings the syrup out of its basket through the screen into the casing, until only a thin
// film is left on the crystals. Beet pulp and mud stay in the basket with them.
void spin(Sandbox &s, Equipment &e) {
    s.budget["power_joules"] += CENTRIFUGE_WATTS / 60.0;
    Vessel &basket = e.vessel, &casing = e.aux;
    const double crystals = basket.sugar_crystal + basket.salt_crystal + basket.bittern_crystal;
    const double liquid = liquid_mass(basket) + basket.burnt, film = SPIN_FILM * crystals;
    if (liquid <= film || liquid < 1e-9)
        return;
    const double m = std::min((liquid - film) * SPIN_RATE + 0.01, SPECS[EQ_CENTRIFUGE].aux - vessel_mass(casing));
    if (m <= 1e-12)
        return;
    const double f = std::min(1.0, m / liquid);
    Vessel out = liquid_share(basket, f);
    out.burnt = basket.burnt * f;
    casing.energy += subtract(basket, SPECS[EQ_CENTRIFUGE].body, out);
    casing.water += out.water;
    for (int c = 0; c < NSOL; c++)
        casing.dissolved[c] += out.dissolved[c];
    casing.burnt += out.burnt;
    settle(casing, CASING_BODY);
}
} // namespace

const EquipmentSpec &equipment_spec(int kind) { return SPECS[kind > 0 && kind < EQ_KINDS ? kind : 0]; }
const std::vector<PortSpec> &equipment_ports(int kind) {
    static const std::vector<PortSpec> none, drum{{0, 3, 1}, {1, 3, 2}, {1, 0, 0}},
        tote{{0, 5, 1}, {5, 5, 2}, {2, 0, 0}, {3, 0, 0}},
        coupling{{0, 0, 0}, {1, 0, 0}, {0, 0, 1}, {0, 1, 1}, {0, 1, 3}, {1, 1, 3}}, kettle{{0, 3, 1}, {5, 3, 2}},
        centrifuge{{0, 3, 1, true}, {3, 3, 2, true}};
    switch (kind) {
    case EQ_DRUM: return drum;
    case EQ_TOTE: return tote;
    case EQ_COUPLING: return coupling;
    case EQ_KETTLE: return kettle;
    case EQ_CENTRIFUGE: return centrifuge;
    default: return none;
    }
}
double vessel_mass(const Vessel &v) {
    return liquid_mass(v) + v.sugar_crystal + v.salt_crystal + v.bittern_crystal + v.burnt + tissue(v) + v.mud + v.crystal_dirt;
}
double vessel_capacity(const Vessel &v, double body) {
    return body + liquid_capacity(v) + SUGAR_CAP * (v.sugar_crystal + v.burnt) + SALT_CAP * v.salt_crystal +
           FLUIDS[WATER].capacity * v.beet_water + SUGAR_CAP * v.beet_sugar + MARC_CAP * v.beet + MUD_CAP * v.mud +
           DIRT_CAP * v.crystal_dirt;
}
// Juice is slightly acid; leftover lime makes it alkaline. A pH meter reads this.
double vessel_ph(const Vessel &v) {
    if (v.water < 1)
        return 7.0;
    const double acids = v.dissolved[SOL_COLLOID] + v.dissolved[SOL_ACIDS];
    return std::clamp(7.0 - std::min(0.9, 40 * acids / v.water) + 2.2 * std::log10(1 + 400 * v.dissolved[SOL_LIME] / v.water), 1.0, 12.6);
}

// Ports (M2): the pipe network sees a vessel through a port as one more mouth, with the vessel's liquid level.
bool find_port(const World &w, const Sandbox &s, int cell, int from, PortRef &ref) {
    if (cell < 0 || from < 0 || w.solid[cell] != B_EQUIPMENT)
        return false;
    const int id = equipment_at(w, s, cell % w.width, cell / w.width);
    if (id < 0)
        return false;
    const Equipment &e = s.equipment.at(id);
    const auto &ports = equipment_ports(e.kind);
    for (std::size_t i = 0; i < ports.size(); i++)
        if ((e.y + ports[i].dy) * w.width + e.x + ports[i].dx == cell && s.neighbor(w, cell, ports[i].dir) == from) {
            ref = {id, int(i)};
            return true;
        }
    return false;
}
bool port_level(const World &w, const Sandbox &s, const PortRef &ref, bool source, int &level) {
    (void)w;
    auto it = s.equipment.find(ref.id);
    if (it == s.equipment.end() || ref.port < 0 || ref.port >= int(equipment_ports(it->second.kind).size()))
        return false;
    const Equipment &e = it->second;
    const auto &spec = SPECS[e.kind];
    const PortSpec &p = equipment_ports(e.kind)[ref.port];
    const Vessel &v = p.aux ? e.aux : e.vessel;
    const double capacity = compartment_capacity(e.kind, p.aux), mass = vessel_mass(v);
    if (v.set || capacity <= 0)
        return false;
    const double surface = e.y + spec.height * (1 - std::clamp(mass / capacity, 0.0, 1.0));
    const int row = e.y + p.dy;
    const bool pushed = e.kind == EQ_COUPLING && e.setting > 0; // the tanker's pump pushes it anywhere
    if (source) {
        if (v.water < GRAMS_PER_UNIT || (!pushed && surface >= row + 1))
            return false;
        level = pushed ? -(1 << 24) : int(std::floor(256 * surface));
        return true;
    }
    if (pushed || capacity - mass < 2 * GRAMS_PER_UNIT)
        return false;
    level = std::min(int(std::floor(256 * surface)), 256 * (row + 1) - 1);
    return true;
}
double port_salt(const Sandbox &s, const PortRef &ref) {
    auto it = s.equipment.find(ref.id);
    if (it == s.equipment.end())
        return 0;
    const PortSpec &p = equipment_ports(it->second.kind)[ref.port];
    return (p.aux ? it->second.aux : it->second.vessel).dissolved[SOL_SALT];
}
int port_take(Sandbox &s, const PortRef &ref, FluidBuffer &b, int units) {
    auto it = s.equipment.find(ref.id);
    if (it == s.equipment.end() || (b.amount > 0 && b.type != WATER))
        return 0;
    Equipment &e = it->second;
    const PortSpec &p = equipment_ports(e.kind)[ref.port];
    Vessel &v = p.aux ? e.aux : e.vessel;
    units = std::min({units, int(std::floor(v.water / GRAMS_PER_UNIT)), int(255 - b.amount)});
    if (v.set || units < 1)
        return 0;
    const double grams = units * GRAMS_PER_UNIT;
    FluidBuffer part;
    part.type = WATER;
    part.amount = units;
    part.temperature = v.temperature;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            part.sol[c] = 255.0 * v.dissolved[c] / v.water;
    const Vessel out = liquid_share(v, grams / v.water);
    s.budget["port_out_g"] += vessel_mass(out);
    take_out(s, v, compartment_body(e.kind, p.aux), out, "port_out_J");
    // Mixed into the buffer the way Sandbox::take mixes a cell into it.
    const double old = buf_cap(b, b.amount), incoming = buf_cap(part, units);
    b.temperature = old + incoming > 0 ? (b.temperature * old + part.temperature * incoming) / (old + incoming) : part.temperature;
    for (int c = 0; c < NSOL; c++)
        b.sol[c] = (b.sol[c] * b.amount + part.sol[c] * units) / (b.amount + units);
    b.type = WATER;
    b.amount += units;
    return units;
}
int port_put(Sandbox &s, const PortRef &ref, FluidBuffer &b, int units) {
    auto it = s.equipment.find(ref.id);
    if (it == s.equipment.end() || b.amount < 1 || b.type != WATER)
        return 0;
    Equipment &e = it->second;
    const PortSpec &p = equipment_ports(e.kind)[ref.port];
    Vessel &v = p.aux ? e.aux : e.vessel;
    double per_unit = GRAMS_PER_UNIT;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            per_unit += std::max(0.0, b.sol[c]) / 255.0 * GRAMS_PER_UNIT;
    units = std::min({units, int(b.amount), int(std::floor((compartment_capacity(e.kind, p.aux) - vessel_mass(v)) / per_unit))});
    if (v.set || units < 1)
        return 0;
    const double grams = units * GRAMS_PER_UNIT, latent = b.latent * units / b.amount;
    v.water += grams;
    for (int c = 0; c < NSOL; c++)
        if (c != OXYGEN_DEFICIT)
            v.dissolved[c] += b.sol[c] / 255.0 * grams;
    const double joules = (buf_cap(b, units) * b.temperature + latent) * JOULES_PER_ENERGY;
    v.energy += joules;
    book(s, "port_in_J", joules);
    s.budget["port_in_g"] += grams * per_unit / GRAMS_PER_UNIT;
    settle(v, compartment_body(e.kind, p.aux));
    b.latent -= latent;
    b.amount -= units;
    if (b.amount < 1e-10) {
        b.amount = 0;
        b.type = 0;
        b.latent = 0;
        b.sol.fill(0);
    }
    return units;
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
    if (spec.aux > 0) {
        e.aux.temperature = e.aux.peak = 20;
        e.aux.energy = CASING_BODY * 20;
        book(s, "placed_J", e.aux.energy);
    }
    s.equipment[id] = e;
    return id;
}
bool remove_equipment(World &w, Sandbox &s, int id, std::string *why) {
    auto it = s.equipment.find(id);
    if (it == s.equipment.end())
        return false;
    const auto &e = it->second;
    const auto &spec = SPECS[e.kind];
    if (vessel_mass(e.vessel) > 0.5 || vessel_mass(e.aux) > 0.5) {
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
    book(s, "removed_J", e.vessel.energy + e.aux.energy);
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
    book(s, "placed_J", -s.equipment[moved].vessel.energy - s.equipment[moved].aux.energy); // the same vessel, carried
    s.equipment[moved].setting = old.setting;
    s.equipment[moved].vessel = old.vessel;
    s.equipment[moved].aux = old.aux;
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
        s.budget["equipment_destroyed_g"] += vessel_mass(e.vessel) + vessel_mass(e.aux);
        book(s, "destroyed_J", e.vessel.energy + e.aux.energy);
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
        if (e.kind == EQ_CENTRIFUGE && e.setting > 0)
            spin(s, e);
        work(w, s, e, e.vessel, spec.body, spec.loss, !spec.closed);
        if (spec.aux > 0)
            work(w, s, e, e.aux, CASING_BODY, spec.loss * 0.5, false);
    }
}

// Adds a bought or tapped ingredient at its own temperature. Beets go in whole, or as cossettes when shredded.
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
    } else if (ingredient == "lime") // slaked lime, as milk of lime
        add.dissolved[SOL_LIME] = grams;
    else if (ingredient == "sugar_beet" || ingredient == "cossettes") {
        add.beet_water = grams * BEET_WATER;
        add.beet_sugar = grams * BEET_SUGAR;
        add.beet = grams * BEET_MARC;
        add.beet_colloid = grams * BEET_COLLOID;
        add.beet_ash = grams * BEET_ASH;
        add.beet_cut = ingredient == "cossettes" ? 1 : 0;
    } else
        return fail("unknown ingredient");
    const double joules = vessel_capacity(add, 0) * temperature;
    add.temperature = add.peak = temperature;
    add.energy = joules;
    move_share(add, 0, v, SPECS[e.kind].body, 1);
    book(s, "added_J", joules);
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
    if (SPECS[b->second.kind].closed) {
        if (why)
            *why = "it has a lid; pipe it in through a port";
        return 0;
    }
    const double mass = vessel_mass(src), room = SPECS[b->second.kind].capacity - vessel_mass(dst);
    if (mass < 1e-9 || room <= 0) {
        if (why)
            *why = mass < 1e-9 ? "it is empty" : "it is full";
        return 0;
    }
    const double f = std::min(1.0, room / mass);
    move_share(src, SPECS[a->second.kind].body, dst, SPECS[b->second.kind].body, f);
    return mass * f;
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
// Pours liquid down the drain. With keep_crystals, the solids stay: wet crystals keep 8 % of their weight in brine,
// beet pulp 15 % and lime mud half.
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
    const double cling = 0.08 * (v.sugar_crystal + v.salt_crystal + v.bittern_crystal) + 0.15 * tissue(v) + 0.5 * v.mud;
    const double keep = v.water > 0 ? std::min(1.0, cling / v.water) : 1;
    take_out(s, v, SPECS[e.kind].body, liquid_share(v, 1 - keep), "drained_J");
    s.budget["drained_g"] += before - vessel_mass(v);
    return before - vessel_mass(v);
}

namespace {
Product made(const char *id, const char *grade, const std::string &note, double grams) {
    Product p;
    p.id = id;
    p.grade = grade;
    p.note = note;
    p.grams = grams;
    return p;
}
std::string percent(double x) { return std::to_string(int(std::lround(x * 100))) + " %"; }
// Salt crystals with the brine that clings to them, from a salt pan or a kettle of boiled-down sea water.
Product collect_salt(Sandbox &s, Vessel &v, double body) {
    const double crystals = v.salt_crystal + v.bittern_crystal;
    const double wet = std::min(v.water, 0.12 * crystals), f = v.water > 0 ? wet / v.water : 0;
    Vessel out = liquid_share(v, f);
    out.salt_crystal = v.salt_crystal;
    out.bittern_crystal = v.bittern_crystal;
    const double grams = vessel_mass(out), carried = vessel_mass(out) - crystals - wet;
    const double purity = (v.salt_crystal + v.dissolved[SOL_SALT] * f) / (crystals + carried), moisture = wet / grams;
    const double formed_at = v.salt_formed > 0 ? v.salt_heat / v.salt_formed : 100;
    const bool grown = v.salt_formed >= 0.8 * v.salt_crystal;
    Product p;
    if (purity >= 0.97 && moisture <= 0.02 && formed_at < 90 && grown)
        p = made("sea_salt_flaky", "A", "Flaky sea salt, grown slowly below the boil.", grams);
    else if (purity >= 0.95 && moisture <= 0.03)
        p = made("sea_salt", "B", formed_at >= 90 ? "Fine sea salt; boiled hard, so no flakes." : "Fine sea salt.", grams);
    else if (purity >= 0.85 && moisture <= 0.10)
        p = made("coarse_salt", "C", moisture > 0.03 ? "Damp. Dry it next time." : "Bitter: the bitterns crystallized with it.", grams);
    else
        p = made("road_salt", "-", "Technically salt. The council buys it for the roads.", grams);
    take_out(s, v, body, out, "collected_J");
    v.salt_heat = v.salt_formed = 0;
    return p;
}
// A cool sugar syrup, bottled: simple (1:1) or rich (2:1) from white sugar, beet syrup when the beet's non-sugars
// are in it. Returns an empty product and sets why when it is not something anyone would buy.
Product collect_syrup(Sandbox &s, Vessel &v, double body, std::string &why) {
    const double mass = vessel_mass(v), sugar = v.dissolved[SOL_SUGAR] + v.sugar_crystal;
    if (sugar + v.water < 20)
        return why = "there is not enough in it", Product{};
    if (v.temperature > 50)
        return why = "let it cool below 50 °C before bottling", Product{};
    const double dirt = nonsugar(v) + v.burnt + v.mud + tissue(v), brix = sugar / (sugar + v.water + nonsugar(v));
    if (dirt > 0.02 * (sugar + dirt) && v.dissolved[SOL_SALT] < 0.01 * mass) {
        // Beet syrup is beet juice boiled down to about 78 % sugar: dark, malty, and spread on bread.
        if (tissue(v) > 0.01 * mass || v.mud > 0.01 * mass)
            return why = "fish the pulp and mud out first", Product{};
        const double off = std::abs(brix - 0.78);
        const int grade = std::max(off <= 0.025 ? 0 : off <= 0.05 ? 1 : off <= 0.09 ? 2 : 3, v.burnt > 0.04 * mass ? 2 : 0);
        if (grade > 2)
            return why = brix < 0.78 ? "too thin for beet syrup; boil it down further" : "too thick to pour; that is nearly candy", Product{};
        static const char *ids[] = {"beet_syrup_a", "beet_syrup_b", "beet_syrup_c"};
        Product p = made(ids[grade], grade ? grade == 1 ? "B" : "C" : "A", "Beet syrup at " + percent(brix) + " sugar." +
                         (v.burnt > 0.04 * mass ? " Rather burnt." : ""), mass);
        clear_contents(s, v, body, "collected_J");
        return p;
    }
    if (brix < 0.4 || brix > 0.75)
        return why = "that is not a syrup anyone would buy", Product{};
    const bool rich = std::abs(brix - 2.0 / 3) < std::abs(brix - 0.5);
    const double off = std::abs(brix - (rich ? 2.0 / 3 : 0.5));
    int grade = off <= 0.015 ? 0 : off <= 0.04 ? 1 : off <= 0.08 ? 2 : 3;
    if (v.sugar_crystal > 0.01 * mass || v.burnt > 0.02 * mass)
        grade = std::max(grade, 2);
    if (dirt > 0.005 * mass)
        grade = std::max(grade, 1);
    if (grade > 2)
        return why = "too far from a 1:1 or 2:1 syrup to sell", Product{};
    const std::string id = std::string(rich ? "syrup_rich_" : "syrup_simple_") + char('a' + grade);
    Product p;
    p.id = id;
    p.grade = std::string(1, char('A' + grade));
    p.grams = mass;
    p.note = std::string(rich ? "Rich" : "Simple") + " syrup at " + percent(brix) + " sugar.";
    clear_contents(s, v, body, "collected_J");
    return p;
}
// Sugar crystals from a centrifuge basket, with whatever syrup film is still on them, graded by purity.
Product collect_sugar(Sandbox &s, Vessel &v, double body) {
    Vessel out = liquid_share(v, 1);
    out.sugar_crystal = v.sugar_crystal;
    out.crystal_dirt = v.crystal_dirt;
    out.burnt = v.burnt;
    const double grams = vessel_mass(out), dry = grams - out.water;
    const double purity = (out.sugar_crystal + out.dissolved[SOL_SUGAR]) / dry, moisture = out.water / grams;
    Product p;
    if (purity >= 0.995 && moisture <= 0.02)
        p = made("sugar", "A", "White sugar, as good as the shop's, which is the point. It goes in with your sugar.", grams);
    else if (purity >= 0.985 && moisture <= 0.04)
        p = made("beet_sugar_b", "B", "Off-white sugar. Fine for baking.", grams);
    else if (purity >= 0.94)
        p = made("brown_sugar", "C", "Brown sugar. On purpose, if anyone asks.", grams);
    else
        p = made("raw_sugar", "-", moisture > 0.04 ? "Wet raw sugar: spin it longer." : "Raw sugar. A refinery takes it, cheaply.", grams);
    char reading[32];
    std::snprintf(reading, sizeof reading, " Purity %.1f %%.", std::floor(purity * 1000) / 10);
    p.note += reading;
    take_out(s, v, body, out, "collected_J");
    return p;
}
// Everything liquid in a tank or a centrifuge casing, if it is something there is a use or a buyer for.
Product collect_liquid(Sandbox &s, Vessel &v, double body, std::string &why) {
    const double liquid = liquid_mass(v) + v.burnt;
    if (liquid < 20)
        return why = "there is not enough liquid in it", Product{};
    const double sugar = v.dissolved[SOL_SUGAR], salts = v.dissolved[SOL_SALT] + v.dissolved[SOL_BITTERN], other = liquid - v.water;
    Vessel out = liquid_share(v, 1);
    out.burnt = v.burnt;
    Product p;
    if (other < 0.001 * liquid)
        p = made("water", "-", "Plain water.", liquid);
    else if (sugar < 0.001 * liquid && salts > 0.025 * liquid && salts < 0.05 * liquid && salts > 0.9 * other)
        p = made("sea_water", "-", "Sea water, bottled for the salt pans.", liquid);
    else if (sugar > 0.4 * liquid && other - sugar > 0.08 * other)
        p = made("molasses", "-", "Molasses: black, sticky, and wanted by every brewer in town.", liquid);
    else if (sugar > 0.4 * liquid && v.temperature <= 50) {
        Product syrup = collect_syrup(s, v, body, why);
        return syrup;
    } else
        return why = sugar > 0.01 * liquid ? "thin juice; nobody buys that, boil it down first" : "nobody buys that mixture", Product{};
    take_out(s, v, body, out, "collected_J");
    return p;
}
} // namespace

// Takes the finished product out of a vessel and grades it. Candy comes from a set mold, syrup from a cool pan or
// kettle, salt crystals (with the brine that clings to them) from a salt pan or kettle, beet pulp and lime mud from
// the kettle, sugar and molasses from the centrifuge, and bulk liquids from tanks.
Product vessel_collect(Sandbox &s, int id, std::string *why) {
    std::string reason;
    auto fail = [&](const std::string &text) {
        if (why)
            *why = text;
        return Product{};
    };
    auto it = s.equipment.find(id);
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
        Product p;
        if (burnt > 0.15)
            p = made("burnt_candy", "-", "Burnt black. Someone will buy it.", mass);
        else if (water <= 0.03 && burnt <= 0.01 && grainy <= 0.02 && dirty <= 0.005)
            p = made("hard_candy_a", "A", "Glass-clear hard candy.", mass);
        else if (water <= 0.05 && burnt <= 0.05 && grainy <= 0.06 && dirty <= 0.02)
            p = made("hard_candy_b", "B", grainy > 0.02 ? "A little grainy." : burnt > 0.01 ? "A little dark." : "Slightly soft.", mass);
        else
            p = made("hard_candy_c", "C", grainy > 0.06 ? "Grainy: sugar crystals got in." : burnt > 0.05 ? "Scorched." : "Sticky: pulled before the hard crack.", mass);
        clear_contents(s, v, body, "collected_J");
        return p;
    }
    if (e.kind == EQ_SAUCEPAN) {
        Product p = collect_syrup(s, v, body, reason);
        return reason.empty() ? p : fail(reason);
    }
    if (e.kind == EQ_SALT_PAN) {
        if (v.salt_crystal + v.bittern_crystal < 1)
            return fail("no crystals yet");
        return collect_salt(s, v, body);
    }
    if (e.kind == EQ_KETTLE) {
        if (v.salt_crystal + v.bittern_crystal >= 1)
            return collect_salt(s, v, body);
        if (tissue(v) >= 1) { // the spent cossettes, wet with juice
            Vessel out = liquid_share(v, v.water > 0 ? std::min(1.0, 0.15 * tissue(v) / v.water) : 0);
            out.beet = v.beet, out.beet_water = v.beet_water, out.beet_sugar = v.beet_sugar;
            out.beet_colloid = v.beet_colloid, out.beet_ash = v.beet_ash;
            const double left = (v.beet_sugar + out.dissolved[SOL_SUGAR]) / vessel_mass(out);
            Product p = made("beet_pulp", "-", "Beet pulp, " + percent(left) + " sugar still in it. Cows are not fussy.", vessel_mass(out));
            take_out(s, v, body, out, "collected_J");
            return p;
        }
        if (v.mud >= 1) {
            Vessel out = liquid_share(v, v.water > 0 ? std::min(1.0, 0.5 * v.mud / v.water) : 0);
            out.mud = v.mud;
            Product p = made("lime_mud", "-", "Lime mud. Farmers spread it on their fields and pay a little for it.", vessel_mass(out));
            take_out(s, v, body, out, "collected_J");
            return p;
        }
        if (v.sugar_crystal >= 1 && v.sugar_crystal > 0.05 * mass)
            return fail("that is massecuite: spin the sugar out of it in a centrifuge");
        Product p = collect_syrup(s, v, body, reason);
        return reason.empty() ? p : fail(reason);
    }
    if (e.kind == EQ_CENTRIFUGE) {
        if (v.sugar_crystal >= 1)
            return collect_sugar(s, v, body);
        Product p = collect_liquid(s, e.aux, CASING_BODY, reason);
        return reason.empty() ? p : fail(reason == "there is not enough liquid in it" ? "no sugar in the basket and nothing in the casing" : reason);
    }
    Product p = collect_liquid(s, v, body, reason);
    return reason.empty() ? p : fail(reason);
}
} // namespace ecologist
