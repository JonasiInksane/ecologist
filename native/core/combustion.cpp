// Fire, explosions, gases and the air's oxygen: a port of js/fire.js, js/blast.js, js/gases.js and the air half of
// js/oxygen.js. Burning takes oxygen from the cells of air beside the flame and gives back CO2, so a sealed room
// goes out once it falls below 15% oxygen; the open sky tops itself up. Ecology-measured fuels, particles, sound and
// floating bodies are not ported yet: organic blocks burn on the browser's fallback draw from the air.
#include "sandbox.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
namespace ecologist {
namespace {
constexpr int L_ETHANOL = 35, SOL_ETHANOL = 17, SOL_O2 = 12, SOL_CO2 = 18, NITRO_DROP = 6;
constexpr double FLAME_TEMP = 1000, CHARCOAL_FLAME = 1300, RADIANT = 0.04, FLASH = 0.6, BURN_DRAW = 2, FED = 4;
constexpr double OIL_IGNITE = 250, OIL_SMOKE = 200, METHANE_IGNITE = 537, HYDROGEN_IGNITE = 500, NITRO_HEAT = 218;
constexpr double SPIRIT = 100, SPIRIT_IGNITE = 365, SPIRIT_HOLD = 78, SPIRIT_BURN = 0.5, SPIRIT_OXYGEN = 3,
                 SPIRIT_CARBON_PER_OXYGEN = 2.0 / 3;
constexpr double GAS_OXYGEN_PER_UNIT = 1000.0 / 255, GAS_BURN_RATE = 64, GAS_PRODUCT_TEMP = 400;
constexpr double ASH_LEFT = 0.4, ASH_PINCH = 48, BLAST_HEAT = 700;
constexpr int MAX_RADIUS = 6, STILL_FOR = 6;
constexpr double MIX_AIR = 0.45, RISING = 20, GAS_MIX_EPSILON = 1e-7;
constexpr double MG_PER_UNIT = 15.0 / 255, OXYGEN_REFERENCE = 9.1, AIR_O2_MG_PER_UNIT = 32 / 24.055,
                 AIR_CO2_EQ_MG_PER_UNIT = AIR_O2_MG_PER_UNIT / CARB_PER_OX, CO2_PER_AIR = 2.5,
                 SURFACE_STILL = 0.05, SURFACE_MOVING = 0.15, MOVING_SURFACE = 0.3;
constexpr double INF = std::numeric_limits<double>::infinity();

double ignite_at(int b) {
    switch (b) {
    case B_WOOD: return 260;
    case B_COMB: case B_CRISP: return 200;
    case B_PLANT: return 250;
    case B_WOOL: return 570;
    case B_FUSE: return 120;
    case B_LEAF: case B_FLOWER: return 230;
    case B_CHARCOAL: return 350;
    default: return 0;
    }
}
// The browser leaves BURN_TIME[LEAF] inside a comment, so its leaves catch but never burn; here they burn briefly.
int burn_time(int b) {
    switch (b) {
    case B_WOOD: return 240;
    case B_COMB: return 140;
    case B_CRISP: return 180;
    case B_PLANT: return 60;
    case B_WOOL: return 120;
    case B_FUSE: return 10;
    case B_LEAF: return 30;
    case B_FLOWER: return 20;
    case B_CHARCOAL: return 255;
    default: return 0;
    }
}
bool breaks(int b) {
    switch (b) {
    case B_DIRT: case B_STONE: case B_COMB: case B_CRISP: case B_ICE: case B_CRYSTAL: case B_BASALT: case B_WOOD:
    case B_MOSS: case B_SALT: case B_SAND: case B_GLASS: case B_BRICK: case B_SODA: case B_GEM: case B_SPONGE:
    case B_WETSPONGE: case B_WETDIRT: case B_POROUS: case B_WOOL: case B_CORAL: case B_BLEACHED: case B_FUSE:
    case B_ORE: case B_SLAG: case B_SUGAR: case B_RUST: case B_LIMESTONE: case B_QUICKLIME: case B_LIME:
    case B_CHARCOAL: case B_ASH: case B_PLANT: case B_LEAF: case B_FLOWER:
        return true;
    default: return false;
    }
}
bool douser(int t) { return t == WATER || t == L_FROST || t == L_BLOOM || t == L_COOLANT; }
// Water strong enough in alcohol to burn, or poured ethanol.
bool spirit(const World &w, int k) {
    return w.liq[k] && ((w.typ[k] == WATER && w.sol[k * NSOL + SOL_ETHANOL] >= SPIRIT) || w.typ[k] == L_ETHANOL);
}
struct Ring { int dx, dy; double d; };
const std::vector<Ring> &ring() {
    static const std::vector<Ring> r = [] {
        std::vector<Ring> a;
        for (int dy = -MAX_RADIUS; dy <= MAX_RADIUS; dy++)
            for (int dx = -MAX_RADIUS; dx <= MAX_RADIUS; dx++) {
                const double d = std::hypot(dx, dy);
                if (d <= MAX_RADIUS)
                    a.push_back({dx, dy, d});
            }
        // Furthest first, so outer liquid moves out of the way before inner liquid follows it.
        std::stable_sort(a.begin(), a.end(), [](const Ring &p, const Ring &q) { return p.d > q.d; });
        return a;
    }();
    return r;
}
void clear_cell(World &w, int k) {
    w.liq[k] = 0;
    w.typ[k] = 0;
    w.latent[k] = 0;
    std::fill_n(w.sol.begin() + k * NSOL, NSOL, 0.0);
}
double saturation(double t, double salt) {
    static constexpr double SAT[][2] = {{0, 14.6}, {10, 11.3}, {20, 9.1}, {30, 7.6}, {40, 6.4}, {60, 4.7}, {80, 2.9}, {100, 0}};
    double v = 0;
    if (t <= 0)
        v = SAT[0][1];
    else if (t < 100)
        for (int i = 1; i < 8; i++)
            if (t <= SAT[i][0]) {
                v = SAT[i - 1][1] + (SAT[i][1] - SAT[i - 1][1]) * (t - SAT[i - 1][0]) / (SAT[i][0] - SAT[i - 1][0]);
                break;
            }
    return v * (1 - 0.2 * salt / 255);
}
} // namespace

bool Sandbox::air(const World &w, int k) const { return k >= 0 && k < int(w.liq.size()) && !w.solid[k] && !w.liq[k]; }
void Sandbox::stir(const World &w, int k) { air_busy[(k / w.width / CHUNK) * w.chunk_width + (k % w.width) / CHUNK] = STILL_FOR; }
// Breathing or burning air: reserve room for the CO2, use what oxygen there is, return how much was used.
double Sandbox::breathe_air(World &w, int k, double n) {
    if (!air(w, k) || !(n > 0))
        return 0;
    const double used = std::min({n, std::max(0.0, MAX_AIR_CARB - air_carb[k]) / CARB_PER_OX, air_ox[k]});
    if (used > 0) {
        air_ox[k] -= used;
        air_carb[k] += used * CARB_PER_OX;
        stir(w, k);
    }
    return used;
}

void Sandbox::fire_step(World &w) {
    auto burnable = [&](int k) { return air(w, k) && air_ox[k] >= FIRE_OX; };
    auto exposed = [&](int k) {
        for (int d = 0; d < 4; d++) {
            const int n = neighbor(w, k, d);
            if (n >= 0 && (burnable(n) || (w.liq[n] && w.typ[n] == L_OXYGEN)))
                return true;
        }
        return false;
    };
    // Water above or beside; water below doesn't count, so oil keeps burning on a lake.
    auto doused = [&](int k) {
        for (int d = 0; d < 3; d++) {
            const int n = neighbor(w, k, d);
            if (n >= 0 && w.liq[n] >= 32 && douser(w.typ[n]) && !spirit(w, n))
                return true;
        }
        return false;
    };
    auto oxygen_beside = [&](int k, bool hydrogen) {
        for (int d = 0; d < 4; d++) {
            const int n = neighbor(w, k, d);
            if (n >= 0 && w.liq[n] >= 16 && (w.typ[n] == L_OXYGEN || (hydrogen && w.typ[n] == L_CHLORINE)))
                return n;
        }
        return -1;
    };
    auto record = [&](const char *key, double amount) { budget[key] += amount; };
    auto smoke_above = [&](int k) {
        const int u = k - w.width;
        if (u < 0 || w.solid[u] || (w.liq[u] && w.typ[u] != L_SMOKE))
            return;
        if (!w.liq[u]) {
            std::fill_n(w.sol.begin() + u * NSOL, NSOL, 0.0);
            w.temp[u] = 200;
        }
        w.liq[u] = std::min(255, w.liq[u] + 40);
        w.typ[u] = L_SMOKE;
        w.wake(u);
    };
    // CO2 room is reserved before the extent of a reaction is decided; ratio is CO2 molecules per O2 molecule.
    auto room = [&](int n, double ratio) {
        return ratio ? std::max(0.0, MAX_AIR_CARB - air_carb[n]) / (ratio * CARB_PER_OX) : INF;
    };
    auto oxidizer_available = [&](int k, double ratio) {
        double total = 0;
        for (int d = 0; d < 4; d++) {
            const int n = neighbor(w, k, d);
            if (air(w, n))
                total += std::min(air_ox[n], room(n, ratio));
        }
        return total;
    };
    auto consume_oxidizer = [&](int k, double requested, double ratio) {
        double left = requested, carbon = 0;
        for (int d = 0; d < 4 && left > 0; d++) {
            const int n = neighbor(w, k, d);
            if (!air(w, n))
                continue;
            const double got = std::min({left, room(n, ratio), air_ox[n]});
            if (got <= 0)
                continue;
            air_ox[n] -= got;
            const double c = std::min(got * ratio * CARB_PER_OX, std::max(0.0, MAX_AIR_CARB - air_carb[n]));
            air_carb[n] += c;
            carbon += c;
            left -= got;
            stir(w, n);
        }
        record("combustion_oxygen", requested - left);
        record("combustion_carbon", carbon);
        return requested - left;
    };
    auto burn = [&](int k, bool clean, bool measured) {
        if (!measured) {
            double used = 0;
            for (int d = 0; d < 4; d++)
                used += breathe_air(w, neighbor(w, k, d), BURN_DRAW);
            record("combustion_oxygen", used);
            record("combustion_carbon", used * CARB_PER_OX);
        }
        w.temp[k] = std::max(double(w.temp[k]), w.solid[k] == B_CHARCOAL ? CHARCOAL_FLAME : FLAME_TEMP);
        w.wake(k);
        for (int d = 0; d < 3; d++) // flames heat up and sideways
            if (const int n = neighbor(w, k, d); n >= 0)
                w.temp[n] += float((FLAME_TEMP - w.temp[n]) * RADIANT);
        if (w.solid[k] == B_FUSE) // a burning fuse lights what it touches, even below it
            for (int d = 0; d < 4; d++)
                if (const int n = neighbor(w, k, d); n >= 0)
                    w.temp[n] = std::max(w.temp[n], 300.0f);
        for (int d = 0; d < 4; d++) {
            const int n = neighbor(w, k, d);
            if (n >= 0 && w.liq[n] && (w.typ[n] == L_METHANE || w.typ[n] == L_HYDROGEN))
                w.temp[n] = std::max(double(w.temp[n]), FLAME_TEMP);
            else if (n >= 0 && spirit(w, n))
                fire[n] = 1;
        }
        if (std::abs(wind) > 0.1) // and the wind fans them downwind
            if (const int n = neighbor(w, k, wind > 0 ? 2 : 1); n >= 0)
                w.temp[n] += float((FLAME_TEMP - w.temp[n]) * RADIANT * 3 * std::abs(wind));
        const int o = oxygen_beside(k, false);
        if (o >= 0 && !measured) { // oxygen gas feeds the fire: it burns hotter and uses the oxygen up
            for (int d = 0; d < 3; d++)
                if (const int n = neighbor(w, k, d); n >= 0)
                    w.temp[n] += float((FLAME_TEMP - w.temp[n]) * RADIANT * 2);
            w.liq[o] = std::max(0, int(w.liq[o]) - int(FED));
            if (!w.liq[o])
                clear_cell(w, o);
            w.wake(o);
        }
        if (!clean && w.random() < 0.06)
            smoke_above(k);
    };
    // Strong alcohol burns with a clean flame while the water under it stays below boiling. Poured ethanol first
    // becomes the same water-carried spirit the browser models (the carrier is retained, as there).
    auto spirit_burn = [&](int k) {
        if (!spirit(w, k) || !exposed(k) || doused(k))
            return 0.0;
        const int p = k * NSOL;
        if (w.typ[k] == L_ETHANOL) {
            w.typ[k] = WATER;
            std::fill_n(w.sol.begin() + p, NSOL, 0.0);
            w.sol[p + SOL_ETHANOL] = 255;
        }
        const double amount = w.sol[p + SOL_ETHANOL] * w.liq[k] / 255;
        const double wanted = std::min({amount, SPIRIT_BURN * w.liq[k] / 255,
                                        oxidizer_available(k, SPIRIT_CARBON_PER_OXYGEN) / SPIRIT_OXYGEN});
        if (!(wanted > 0))
            return 0.0;
        const double oxygen = consume_oxidizer(k, wanted * SPIRIT_OXYGEN, SPIRIT_CARBON_PER_OXYGEN),
                     used = std::min(amount, oxygen / SPIRIT_OXYGEN);
        w.sol[p + SOL_ETHANOL] = std::max(0.0, w.sol[p + SOL_ETHANOL] - used * 255 / w.liq[k]);
        record("ethanol_burned", used);
        record("ethanol_reaction_water", used * 3);
        fire[k] = 1;
        burn(k, true, true);
        w.temp[k] = std::min(double(w.temp[k]), SPIRIT_HOLD);
        return used;
    };
    // 2 H2 + O2 -> 2 H2O and CH4 + 2 O2 -> CO2 + 2 H2O in the browser's gas-volume equivalents; steam is the product.
    auto burn_fuel_gas = [&](int k, bool hydrogen) {
        if (!exposed(k) || doused(k))
            return 0;
        const double oxygen_ratio = GAS_OXYGEN_PER_UNIT * (hydrogen ? 0.5 : 2), carbon_ratio = hydrogen ? 0 : 0.5;
        int amount = int(std::floor(std::min({double(w.liq[k]), GAS_BURN_RATE,
                                              oxidizer_available(k, carbon_ratio) / oxygen_ratio})));
        if (amount <= 0)
            return 0;
        const int water_ratio = hydrogen ? 1 : 2;
        int target = amount == w.liq[k] && amount * water_ratio <= 255 ? k : -1;
        if (target < 0)
            for (int d = 0; d < 4; d++) {
                const int n = neighbor(w, k, d);
                if (n < 0 || w.solid[n] || (w.liq[n] && w.typ[n] != L_STEAM))
                    continue;
                const int fits = (255 - w.liq[n]) / water_ratio;
                if (fits > 0) {
                    amount = std::min(amount, fits);
                    target = n;
                    break;
                }
            }
        if (target < 0 || amount <= 0)
            return 0;
        consume_oxidizer(k, amount * oxygen_ratio, carbon_ratio);
        const int produced = amount * water_ratio, was = target == k ? 0 : w.liq[target];
        const double old_temp = was ? w.temp[target] : GAS_PRODUCT_TEMP;
        w.liq[k] -= amount;
        if (!w.liq[k])
            clear_cell(w, k);
        if (target != k) {
            w.temp[k] = float(FLAME_TEMP);
            fire[k] = w.liq[k] ? 1 : 0;
            for (int s = 0; s < NSOL; s++) // the steam keeps what it already carried
                w.sol[target * NSOL + s] *= double(was) / (was + produced);
        }
        w.liq[target] = was + produced;
        w.typ[target] = L_STEAM;
        w.temp[target] = float((old_temp * was + GAS_PRODUCT_TEMP * produced) / (was + produced));
        w.wake(k);
        w.wake(target);
        record(hydrogen ? "hydrogen_burned" : "methane_burned", amount);
        record("gas_reaction_water", produced);
        for (int d = 0; d < 4; d++)
            if (const int n = neighbor(w, k, d); n >= 0)
                w.temp[n] += float((FLAME_TEMP - w.temp[n]) * FLASH);
        return amount;
    };
    auto charged = [&](int k) {
        for (int d = 0; d < 4; d++)
            if (const int n = neighbor(w, k, d); n >= 0 && power[n] > 0)
                return true;
        return false;
    };

    const int cells = w.width * w.height;
    for (int k = 0; k < cells; k++) {
        const int b = w.solid[k];
        // Nitro goes off when heated, after a hard landing, or when live power touches it; frozen nitro only by heat.
        if (!b && w.liq[k] && w.typ[k] == L_NITRO) {
            const int below = k + w.width;
            const bool landed = below >= cells || w.solid[below] ||
                                (w.liq[below] && (w.typ[below] == L_NITRO ? w.liq[below] == 255
                                                                          : FLUIDS[w.typ[below]].density >= FLUIDS[L_NITRO].density));
            if (w.temp[k] > NITRO_HEAT || (landed && w.drop[k] >= NITRO_DROP) || charged(k))
                explode(w, k);
            continue;
        }
        if (b == B_FNITRO && w.temp[k] > NITRO_HEAT) {
            const double amount = held[k] ? held[k] : 255;
            erase(w, k);
            w.solid[k] = 0;
            w.liq[k] = std::uint8_t(std::clamp(int(std::lround(amount)), 1, 255));
            w.typ[k] = L_NITRO;
            explode(w, k);
            continue;
        }
        if (!fire[k] && w.temp[k] <= 120) // below the coldest ignition point nothing catches, smokes or flashes
            continue;
        if (!b && w.liq[k] && (w.typ[k] == L_METHANE || w.typ[k] == L_HYDROGEN)) {
            const bool h = w.typ[k] == L_HYDROGEN;
            if (w.temp[k] > (h ? HYDROGEN_IGNITE : METHANE_IGNITE) && !doused(k) && oxygen_beside(k, h) >= 0) {
                // mixed with oxygen it explodes, and the oxygen it touches goes with it
                for (int d = 0; d < 4; d++) {
                    const int n = neighbor(w, k, d);
                    if (n >= 0 && w.liq[n] && (w.typ[n] == L_OXYGEN || (h && w.typ[n] == L_CHLORINE))) {
                        record("blast_oxidizer", w.liq[n]);
                        clear_cell(w, n);
                    }
                }
                fire[k] = 0;
                explode(w, k);
                continue;
            }
            // burning gas flashes through the cloud: each burning cell heats its neighbours hard and is gone soon
            if (w.temp[k] <= (h ? HYDROGEN_IGNITE : METHANE_IGNITE) || !burn_fuel_gas(k, h))
                fire[k] = 0;
            continue;
        }
        if (!b && w.liq[k] && w.typ[k] == L_OIL) {
            // burning oil is hot oil touching air; its heat flows with it, so the fire moves with the oil
            if (w.temp[k] > OIL_IGNITE && exposed(k) && !doused(k)) {
                fire[k] = 1;
                burn(k, false, false);
                record("oil_burned", 1);
                if (!--w.liq[k])
                    clear_cell(w, k);
            } else {
                if (fire[k] && doused(k))
                    w.temp[k] = std::min(w.temp[k], 90.0f);
                fire[k] = 0;
                if (w.temp[k] > OIL_SMOKE && w.random() < 0.02) // hot oil smokes before it catches
                    smoke_above(k);
            }
            continue;
        }
        if (!b && spirit(w, k)) {
            if ((fire[k] || w.temp[k] > SPIRIT_IGNITE) && exposed(k) && !doused(k)) {
                if (!spirit_burn(k))
                    fire[k] = 0;
            } else
                fire[k] = 0;
            continue;
        }
        if (!ignite_at(b)) {
            fire[k] = 0;
            continue;
        }
        if (!fire[k]) {
            if (w.temp[k] > ignite_at(b) && exposed(k))
                fire[k] = std::uint8_t(burn_time(b));
            continue;
        }
        if (doused(k)) {
            fire[k] = 0;
            w.temp[k] = std::min(w.temp[k], 90.0f);
            continue;
        }
        if (!exposed(k)) { // smothered
            fire[k] = 0;
            continue;
        }
        burn(k, false, false);
        if (--fire[k] == 0) {
            const bool ash = (b == B_WOOD || b == B_CHARCOAL || b == B_LEAF) && w.random() < ASH_LEFT;
            erase(w, k);
            w.solid[k] = ash ? B_ASH : 0;
            held[k] = ash ? ASH_PINCH : 255;
            w.wake(k);
        }
    }
}

// Blows up the nitro (or burning gas) in cell k; a fuller cell makes a bigger blast. It breaks soft blocks, heats
// everything in reach (setting off nearby nitro and gas in a chain), pushes liquid outward and fills the hole with smoke.
void Sandbox::explode(World &w, int k) {
    const int x = k % w.width, y = k / w.width,
              r = 2 + int(std::lround(w.liq[k] / 255.0 * (MAX_RADIUS - 2)));
    budget[FLUIDS[w.typ[k]].gas ? "blast_gas" : "blast_nitro"] += w.liq[k];
    clear_cell(w, k);
    fire[k] = 0;
    shake = std::max(shake, double(r * 2));
    explosions++;
    for (const auto &[dx, dy, d] : ring()) {
        if (d > r)
            continue;
        const int nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w.width || ny >= w.height)
            continue;
        const int n = ny * w.width + nx;
        const double f = 1 - d / (r + 1);
        if (breaks(w.solid[n]) && w.solid[n] != B_FNITRO && w.random() < f * 1.5) {
            // Water held in a broken sponge or wet soil is released rather than destroyed.
            FluidBuffer water;
            if (auto p = pores.find(n); p != pores.end())
                water = p->second;
            erase(w, n);
            w.solid[n] = 0;
            if (water.amount >= 1)
                put(w, water, n, int(water.amount));
        }
        w.temp[n] = float(std::min(1400.0, w.temp[n] + BLAST_HEAT * f));
        if (w.liq[n] && (w.typ[n] == L_METHANE || w.typ[n] == L_HYDROGEN))
            w.temp[n] = std::max(w.temp[n], 1000.0f);
        if (w.liq[n] && d > 0) {
            // Move it one cell further from the blast, where there's room.
            const int sx = std::abs(dx) >= std::abs(dy) ? (dx > 0) - (dx < 0) : 0, sy = sx ? 0 : (dy > 0) - (dy < 0);
            const int tx = nx + sx, ty = ny + sy;
            if (tx >= 0 && ty >= 0 && tx < w.width && ty < w.height) {
                const int o = ty * w.width + tx;
                if (!w.solid[o] && (!w.liq[o] || w.typ[o] == w.typ[n])) {
                    const int mv = std::min<int>(w.liq[n], 255 - w.liq[o]);
                    if (mv > 0) {
                        w.carry(n, o, mv, w.liq[o], w.liq[n]);
                        w.liq[o] += mv;
                        w.typ[o] = w.typ[n];
                        w.vel[o] = float(sx);
                        w.liq[n] -= mv;
                        if (!w.liq[n])
                            clear_cell(w, n);
                    }
                }
            }
        } else if (!w.liq[n] && !w.solid[n] && d <= r / 2.0) {
            const int smoke = int(std::lround(160 * f));
            if (smoke > 0) {
                std::fill_n(w.sol.begin() + n * NSOL, NSOL, 0.0);
                w.liq[n] = smoke;
                w.typ[n] = L_SMOKE;
                budget["blast_smoke"] += smoke;
            }
        }
        w.wake(n);
    }
}

// The Ignite tool: brings fuel under the brush past its ignition point. Nitro and gas react exactly as heat would.
bool Sandbox::ignite(World &w, int x, int y, int radius) {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height)
        return false;
    bool changed = false;
    radius = std::clamp(radius, 1, 16);
    for (int yy = std::max(0, y - radius + 1); yy < std::min(w.height, y + radius); yy++)
        for (int xx = std::max(0, x - radius + 1); xx < std::min(w.width, x + radius); xx++) {
            if ((xx - x) * (xx - x) + (yy - y) * (yy - y) >= radius * radius)
                continue;
            const int k = yy * w.width + xx, t = w.liq[k] ? w.typ[k] : 0;
            double at = ignite_at(w.solid[k]);
            if (!w.solid[k])
                at = t == L_OIL ? OIL_IGNITE : t == L_METHANE ? METHANE_IGNITE : t == L_HYDROGEN ? HYDROGEN_IGNITE
                     : t == L_NITRO ? NITRO_HEAT : spirit(w, k) ? SPIRIT_IGNITE : 0;
            if (w.solid[k] == B_FNITRO)
                at = NITRO_HEAT;
            if (!at)
                continue;
            w.temp[k] = std::max(double(w.temp[k]), at + 40);
            w.wake(k);
            changed = true;
        }
    return changed;
}

// Every 4 ticks: the atmosphere tops up the air open to the sky; the rest of the air mixes with its neighbours in
// chunks that changed lately, so a cave with a door is refreshed and a sealed room is not. Water surfaces exchange
// oxygen and CO2 with the air above them.
void Sandbox::atmosphere_step(World &w) {
    const int cells = w.width * w.height, chunk_h = w.height / CHUNK;
    for (int x = 0; x < w.width; x++)
        for (int k = x; k < cells; k += w.width) {
            if (w.solid[k] || (w.liq[k] && !FLUIDS[w.typ[k]].gas))
                break; // gas lets the sky's air through; anything else roofs it over
            if (!w.liq[k] && (air_ox[k] != AIR_OX || air_carb[k] != AIR_CARB)) {
                budget["atmosphere_oxygen_mg"] += (AIR_OX - air_ox[k]) * AIR_O2_MG_PER_UNIT;
                budget["atmosphere_carbon_eq_mg"] += (AIR_CARB - air_carb[k]) * AIR_CO2_EQ_MG_PER_UNIT;
                air_ox[k] = AIR_OX;
                air_carb[k] = AIR_CARB;
                stir(w, k);
            }
        }
    auto share = [&](int a, int b, double f) {
        bool changed = false;
        for (auto *arr : {&air_ox, &air_carb}) {
            const double d = (*arr)[a] - (*arr)[b];
            if (std::abs(d) < GAS_MIX_EPSILON)
                continue;
            (*arr)[a] -= d * f;
            (*arr)[b] += d * f;
            changed = true;
        }
        return changed;
    };
    for (int cy = 0; cy < chunk_h; cy++)
        for (int cx = 0; cx < w.chunk_width; cx++) {
            const int c = cy * w.chunk_width + cx;
            if (!air_busy[c] && !(cx > 0 && air_busy[c - 1]) && !(cx + 1 < w.chunk_width && air_busy[c + 1]) &&
                !(cy > 0 && air_busy[c - w.chunk_width]) && !(cy + 1 < chunk_h && air_busy[c + w.chunk_width]))
                continue;
            bool changed = false;
            for (int y = cy * CHUNK; y < (cy + 1) * CHUNK; y++)
                for (int x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
                    const int k = y * w.width + x;
                    if (!air(w, k))
                        continue;
                    if (x + 1 < w.width && air(w, k + 1))
                        changed = share(k, k + 1, MIX_AIR) || changed;
                    if (y + 1 < w.height && air(w, k + w.width)) // hot air rises and draws fresh air in behind it
                        changed = share(k, k + w.width, w.temp[k + w.width] > w.temp[k] + RISING ? 0.5 : MIX_AIR) || changed;
                }
            if (changed)
                air_busy[c] = STILL_FOR;
            else if (air_busy[c])
                air_busy[c]--;
        }
    // Surface exchange debits both finite reservoirs; only a surface at the top edge meets the outside atmosphere.
    for (int k = 0; k < cells; k++) {
        if (!w.liq[k] || w.typ[k] != WATER)
            continue;
        const int up = k - w.width;
        if (up >= 0 && (w.solid[up] || w.liq[up]))
            continue;
        const int p = k * NSOL;
        const bool outside = up < 0;
        const double volume = w.liq[k] / 255.0, air_o = outside ? AIR_OX : air_ox[up], air_c = outside ? AIR_CARB : air_carb[up];
        const double rate = std::abs(w.vel[k]) > MOVING_SURFACE ? SURFACE_MOVING : SURFACE_STILL;
        const double have = std::max(0.0, OXYGEN_REFERENCE - w.sol[p + SOL_O2] * MG_PER_UNIT),
                     target = saturation(w.temp[k], w.sol[p + SOL_SALT]) * air_o / AIR_OX;
        double oxygen = (target - have) * volume * rate;
        oxygen = oxygen >= 0 ? std::min(oxygen, outside ? INF : air_o * AIR_O2_MG_PER_UNIT)
                             : -std::min({-oxygen, have * volume, outside ? INF : std::max(0.0, MAX_AIR_OX - air_o) * AIR_O2_MG_PER_UNIT});
        w.sol[p + SOL_O2] = (OXYGEN_REFERENCE - have) / MG_PER_UNIT - oxygen / (volume * MG_PER_UNIT);
        const double carbon_have = std::max(0.0, w.sol[p + SOL_CO2]);
        double carbon = (air_c * CO2_PER_AIR - carbon_have) * volume * MG_PER_UNIT * SURFACE_STILL;
        carbon = carbon >= 0 ? std::min(carbon, outside ? INF : air_c * AIR_CO2_EQ_MG_PER_UNIT)
                             : -std::min({-carbon, carbon_have * volume * MG_PER_UNIT, outside ? INF : std::max(0.0, MAX_AIR_CARB - air_c) * AIR_CO2_EQ_MG_PER_UNIT});
        w.sol[p + SOL_CO2] = std::max(0.0, carbon_have + carbon / (volume * MG_PER_UNIT));
        if (outside) {
            budget["atmosphere_oxygen_mg"] += oxygen;
            budget["atmosphere_carbon_eq_mg"] += carbon;
        } else {
            air_ox[up] = std::max(0.0, air_o - oxygen / AIR_O2_MG_PER_UNIT);
            air_carb[up] = std::max(0.0, air_c - carbon / AIR_CO2_EQ_MG_PER_UNIT);
            if (oxygen || carbon)
                stir(w, up);
        }
    }
}

// Gases: smoke, methane and hydrogen that reach the open top escape; smoke, poison and chlorine thin out under open
// sky; loose CO2 and oxygen gas join the air beside them. Neighbouring different gases trade places now and then,
// so a rising and a sinking gas meet in a mixed band (which is what lets hydrogen or methane meet oxygen and explode).
void Sandbox::gas_step(World &w) {
    auto fade = [](int t) {
        return t == L_SMOKE ? 3.0 : t == L_POISON ? 0.15 : t == L_CHLORINE || t == L_CO2 ? 0.1 : t == L_OXYGEN ? 0.05 : 0.0;
    };
    auto sky_air = [&](int k) {
        for (int o = k - w.width; o >= 0; o -= w.width)
            if (w.solid[o] || (w.liq[o] && !FLUIDS[w.typ[o]].gas))
                return false;
        return true;
    };
    auto into_air = [&](int k, int t, int requested) {
        auto &arr = t == L_OXYGEN ? air_ox : air_carb;
        const double scale = t == L_OXYGEN ? 1000.0 / 255 : 10000.0 / 255, maximum = t == L_OXYGEN ? MAX_AIR_OX : MAX_AIR_CARB;
        const int x = k % w.width;
        for (int n : {k - w.width, x > 0 ? k - 1 : -1, x + 1 < w.width ? k + 1 : -1, k + w.width}) {
            if (!air(w, n))
                continue;
            const int mv = std::min({requested, int(w.liq[k]), int(std::floor(std::max(0.0, maximum - arr[n]) / scale))});
            if (mv <= 0)
                continue;
            const double energy = w.latent[k] * mv / w.liq[k];
            w.latent[k] -= energy;
            w.temp[n] += float(energy / AIR_CAP);
            arr[n] += mv * scale;
            w.liq[k] -= mv;
            stir(w, n);
            return;
        }
    };
    const int cells = w.width * w.height;
    for (int k = 0; k < cells; k++) {
        if (!w.liq[k])
            continue;
        int t = w.typ[k];
        if (t != L_SMOKE && t != L_METHANE && t != L_POISON && t != L_CHLORINE && t != L_CO2 && t != L_HYDROGEN && t != L_OXYGEN)
            continue;
        if ((t == L_SMOKE || t == L_METHANE || t == L_HYDROGEN) && k < w.width && !w.under[k]) {
            budget[std::string("escaped_") + (t == L_SMOKE ? "smoke" : t == L_METHANE ? "methane" : "hydrogen")] += w.liq[k];
            clear_cell(w, k);
            w.wake(k);
            continue;
        }
        if (w.random() < 0.3) { // trade places with a random neighbour holding a different gas
            const int x = k % w.width, d = int(w.random() * 4);
            const int n = d == 0 ? k - w.width : d == 1 ? k + w.width : d == 2 ? (x > 0 ? k - 1 : -1) : (x + 1 < w.width ? k + 1 : -1);
            if (n >= 0 && n < cells && w.liq[n] && w.typ[n] != t && FLUIDS[w.typ[n]].gas) {
                std::swap(w.liq[k], w.liq[n]);
                std::swap(w.typ[k], w.typ[n]);
                std::swap(w.temp[k], w.temp[n]);
                std::swap(w.latent[k], w.latent[n]);
                w.swap_sol(k, n);
                w.wake(k);
                t = w.typ[k];
            }
        }
        const double f = fade(t);
        if (!f || ((t == L_SMOKE || t == L_POISON || t == L_CHLORINE) && !sky_air(k)))
            continue;
        const int n = int(f) + (w.random() < f - int(f) ? 1 : 0);
        if (!n)
            continue;
        if (t == L_CO2 || t == L_OXYGEN)
            into_air(k, t, n);
        else {
            const int removed = std::min(n, int(w.liq[k]));
            w.liq[k] -= removed;
            budget[t == L_SMOKE ? "faded_smoke" : t == L_POISON ? "faded_poison" : "faded_chlorine"] += removed;
        }
        if (!w.liq[k])
            clear_cell(w, k);
        w.wake(k);
    }
}
} // namespace ecologist
