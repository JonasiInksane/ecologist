// Pressure, momentum and erosion: a port of js/pressure.js, js/momentum.js and js/erosion.js. Quantities, heat and
// ingredients move through the same carry/take/put helpers as the rest of the native sandbox. Not yet ported: magnets
// holding ferrofluid against pressure, drain whirlpool visuals, and mud rotting into methane (that needs ecology).
#include "sandbox.hpp"
#include <algorithm>
#include <cmath>
namespace ecologist {
namespace {
constexpr int LEVEL_FOR = 120, SEARCH_LIMIT = 2000, MOVE = 32, SAMPLES = 32;
constexpr double ACCEL = 0.12, BOUNCE = 0.4, MIN_V = 0.03, CARRY = 0.5, SPLASH = 0.1, MAX_SPLASH = 0.8,
                 DEAD_ZONE = 16, RUN_UP = 0.2, CHUNK_OFF = 96, DRAIN_PULL = 0.04;
constexpr int DRAIN_REACH = 5;
constexpr double ERODE = 0.004, FALL_BOOST = 3, SILT_PER_BLOCK = 48, SETTLE_SILT = 120, PACK = 0.002,
                 MUD_WASH = 0.04, SLUMP = 0.5, BED_SILT = 24;
constexpr std::uint32_t STILL_TICKS = 40;
float clamp_v(double v) { return float(v > 1 ? 1 : v < -1 ? -1 : v); }
bool soft(int b) { return b == B_DIRT || b == B_SAND || b == B_WETDIRT; }
} // namespace

// Liquid resting on a full body of the same liquid searches through that body for an open cell at least two rows
// lower and moves there, so the far arm of a U-bend rises to match. A search that finds nowhere lower marks its body
// level for a while. Only awake chunks are searched.
void Sandbox::pressure_step(World &w) {
    if (!pressure_was_on) {
        pressure_was_on = true;
        w.wake_all(); // just turned on: water that settled without it gets another look
    }
    std::vector<int> surfaces;
    for (std::size_t c = 0; c < w.awake.size(); c++) {
        if (!w.awake[c])
            continue;
        const int cx = int(c % w.chunk_width) * CHUNK, cy = int(c / w.chunk_width) * CHUNK;
        for (int y = std::max(1, cy); y < std::min(w.height - 1, cy + CHUNK); y++)
            for (int x = cx; x < cx + CHUNK; x++) {
                const int k = y * w.width + x, t = w.typ[k], below = k + w.width;
                if (!w.liq[k] || FLUIDS[t].gravity < 0)
                    continue;
                if (w.liq[below] == 255 && w.typ[below] == t && !(w.liq[k - w.width] && w.typ[k - w.width] == t) &&
                    !(level_until[below] > w.tick && y >= level_row[below]))
                    surfaces.push_back(k);
            }
    }
    for (int i = 0; i < SAMPLES && !surfaces.empty(); i++) {
        const int s = surfaces[std::size_t(w.random() * surfaces.size())], t = w.typ[s], sy = s / w.width;
        if (!w.liq[s])
            continue;
        search_pass++;
        int head = 0, tail = 0;
        queue[tail++] = s + w.width;
        seen[s + w.width] = seen[s] = search_pass;
        bool moved_any = false;
        while (head < tail && tail < SEARCH_LIMIT && !moved_any) {
            const int k = queue[head++];
            for (int d = 0; d < 4; d++) {
                const int n = neighbor(w, k, d);
                if (n < 0 || seen[n] == search_pass || w.solid[n])
                    continue;
                seen[n] = search_pass;
                if (w.liq[n] == 255 && w.typ[n] == t) {
                    queue[tail++] = n;
                    continue;
                }
                if (n / w.width > sy + 1 && (!w.liq[n] || w.typ[n] == t)) {
                    const int mv = std::min({int(w.liq[s]), 255 - int(w.liq[n]), MOVE});
                    w.carry(s, n, mv, w.liq[n], w.liq[s]);
                    w.liq[n] += mv;
                    w.typ[n] = t;
                    w.liq[s] -= mv;
                    if (!w.liq[s]) {
                        w.typ[s] = 0;
                        std::fill_n(w.sol.begin() + s * NSOL, NSOL, 0.0);
                    }
                    w.wake(s);
                    w.wake(n);
                    moved_any = true;
                    break;
                }
            }
        }
        if (!moved_any && head >= tail) // searched it all: level up to here
            for (int q = 0; q < tail; q++) {
                level_until[queue[q]] = w.tick + LEVEL_FOR;
                level_row[queue[q]] = std::uint16_t(sy);
            }
    }
}

// Each cell's liquid remembers its sideways speed (vel, cells per tick). A sloping surface speeds it towards the low
// side, thick liquids slow it, and moving liquid carries part of itself on, pushes through full cells and runs up
// walls before bouncing: waves that slosh, jets, splashes where falls land, and the pull of active drains.
void Sandbox::momentum_step(World &w) {
    if (!momentum_on)
        return;
    for (const auto &[k, d] : machines) {
        if (d.kind != B_DRAIN || !d.active)
            continue;
        const int x = k % w.width, y = k / w.width;
        for (int dy = -DRAIN_REACH; dy <= 1; dy++)
            for (int dx = -DRAIN_REACH; dx <= DRAIN_REACH; dx++) {
                const int nx = x + dx, ny = y + dy;
                if (!dx || nx < 0 || ny < 0 || nx >= w.width || ny >= w.height)
                    continue;
                const int n = ny * w.width + nx;
                if (w.liq[n])
                    w.vel[n] = clamp_v(w.vel[n] - (dx > 0 ? 1 : -1) * DRAIN_PULL);
            }
    }
    auto side_level = [&](int k, int t, int self) { return w.solid[k] ? self : !w.liq[k] ? 0 : w.typ[k] == t ? int(w.liq[k]) : 255; };
    auto landed = [&](int k, int y, int t, int g) {
        if (g > 0 ? y == w.height - 1 : y == 0)
            return true;
        const int b = k + w.width * g;
        return w.solid[b] || (w.liq[b] > 0 && (w.typ[b] != t || w.liq[b] == 255) && w.drop[b] == 0);
    };
    for (int y = w.height - 1; y >= 0; y--) {
        const int crow = (y / CHUNK) * w.chunk_width;
        const bool ltr = ((w.tick + y) & 1) == 0;
        for (int i = 0; i < w.width; i++) {
            const int x = ltr ? i : w.width - 1 - i, k = y * w.width + x, a = w.liq[k];
            if (!a) {
                w.vel[k] = 0;
                continue;
            }
            if (!w.awake[crow + x / CHUNK] || moved[k] == w.tick)
                continue;
            const int t = w.typ[k];
            const auto &l = FLUIDS[t];
            double v = w.vel[k];
            const bool rests = landed(k, y, t, l.gravity);
            if (l.gravity > 0 && w.drop[k] >= 3 && rests) // a fall that just landed splashes out sideways
                v += (v > 0 || (v == 0 && w.random() < 0.5) ? 1 : -1) * std::min(MAX_SPLASH, w.drop[k] * SPLASH);
            const int lv = x > 0 ? side_level(k - 1, t, a) : a, rv = x + 1 < w.width ? side_level(k + 1, t, a) : a;
            if (rests && std::abs(lv - rv) > DEAD_ZONE)
                v += (lv - rv) / 255.0 * ACCEL;
            v = clamp_v(v * (1 - 0.015 * w.viscosity(t, w.temp[k])));
            if (std::abs(v) < MIN_V) {
                w.vel[k] = 0;
                continue;
            }
            const int dir = v > 0 ? 1 : -1, nx = x + dir, n = k + dir;
            if (nx < 0 || nx >= w.width || w.solid[n] || (w.liq[n] && w.typ[n] != t)) {
                // running fast into a wall, it surges up it and falls back; then it bounces off
                const int up = k - w.width;
                const double sp = std::abs(v);
                if (sp >= RUN_UP && y > 0 && !w.solid[up] && (!w.liq[up] || w.typ[up] == t)) {
                    const int m = std::min(255 - int(w.liq[up]), int(std::lround(a * sp * CARRY)));
                    if (m >= l.min_spread && m > 0) {
                        w.carry(k, up, m, w.liq[up], w.liq[k]);
                        w.liq[up] += m;
                        w.typ[up] = t;
                        w.vel[up] = float(v * 0.7);
                        moved[up] = w.tick;
                        w.liq[k] -= m;
                        if (!w.liq[k]) {
                            w.typ[k] = 0;
                            std::fill_n(w.sol.begin() + k * NSOL, NSOL, 0.0);
                        }
                        w.wake(up);
                    }
                }
                w.vel[k] = float(-v * BOUNCE);
                continue;
            }
            const int room = 255 - w.liq[n];
            if (!room) { // push on through
                w.vel[n] = clamp_v(w.vel[n] + v * 0.5 * a / 255);
                w.vel[k] = float(v * 0.5);
                continue;
            }
            w.vel[k] = float(v);
            if (!rests)
                continue;
            const int m = std::min(room, int(std::lround(a * std::abs(v) * CARRY)));
            if (!m || (!w.liq[n] && m < l.min_spread))
                continue; // no drops smaller than the liquid's smallest puddle
            if (m < CHUNK_OFF && !landed(n, y, t, l.gravity))
                continue; // only big parcels go over an edge
            if (!w.liq[n])
                w.drop[n] = w.drop[k];
            w.carry(k, n, m, w.liq[n], w.liq[k]);
            w.liq[n] += m;
            w.typ[n] = t;
            moved[n] = w.tick;
            w.liq[k] = a - m;
            if (!w.liq[k]) {
                w.typ[k] = 0;
                w.vel[k] = 0;
                std::fill_n(w.sol.begin() + k * NSOL, NSOL, 0.0);
            }
            if (m >= 8)
                w.flux[n] = w.tick;
            w.wake(k);
            w.wake(n);
        }
    }
}

// Water flowing fast past soft ground wears it away and carries it as silt; in still water the silt sinks, settles
// as mud and packs into wet soil, so rivers cut channels and build deltas. Banks keep their pore water; heat lost or
// gained by a change of material is returned to the parcel, as in the browser.
void Sandbox::erosion_step(World &w) {
    const int cells = w.width * w.height;
    auto silt = [&](int k) -> double & { return w.sol[k * NSOL + SOL_SILT]; };
    auto flowing = [&](int k) { return w.tick - w.flux[k] < 5 && (std::abs(w.vel[k]) > 0.05 || w.drop[k] >= 2); };
    auto energy = [&](std::initializer_list<int> list) {
        double e = 0;
        for (int k : list)
            e += w.temp[k] * capacity(w, k) + w.latent[k] + (pores.count(k) ? pores[k].latent : 0);
        return e;
    };
    auto retain = [&](std::initializer_list<int> list, double before) {
        int receiver = *list.begin();
        for (int k : list)
            if (capacity(w, k) > capacity(w, receiver))
                receiver = k;
        w.temp[receiver] += float((before - energy(list)) / std::max(0.001, capacity(w, receiver)));
    };
    auto pore_amount = [&](int k) {
        auto p = pores.find(k);
        return w.solid[k] == B_SAND || p == pores.end() ? 0.0 : p->second.amount;
    };
    auto erode_bank = [&](int k, int bank) {
        const double wet = pore_amount(bank);
        if (wet != std::floor(wet))
            return; // liquid storage is integral; a fractional pore residue stays in its bank
        const double before = energy({k, bank});
        FluidBuffer water;
        if (wet > 0)
            water = pores[bank];
        erase(w, bank);
        w.solid[bank] = 0;
        if (wet > 0) {
            put(w, water, k, std::min(int(water.amount), 255 - int(w.liq[k])));
            if (water.amount >= 1)
                put(w, water, bank, int(water.amount));
            w.latent[k] += water.latent;
        }
        silt(k) += SILT_PER_BLOCK;
        budget["eroded_blocks"] += 1;
        retain({k, bank}, before);
        w.wake(k);
        w.wake(bank);
    };
    auto slump_bank = [&](int k, int bank) {
        const double wet = pore_amount(bank);
        if (wet != std::floor(wet))
            return;
        const int additional = std::max(160, int(wet)) - int(wet);
        if (additional > w.liq[k])
            return; // a dry bank cannot create its wetting water
        const double before = energy({k, bank});
        FluidBuffer water;
        if (wet > 0)
            water = pores[bank];
        else
            water.temperature = w.temp[bank];
        take(w, k, water, additional);
        erase(w, bank);
        w.solid[bank] = 0;
        put(w, water, bank, int(water.amount));
        w.typ[bank] = L_MUD;
        w.latent[bank] += water.latent;
        budget["slumped_blocks"] += 1;
        retain({k, bank}, before);
        w.wake(k);
        w.wake(bank);
    };
    for (int k = w.width; k < cells - w.width; k++) {
        if (!w.liq[k])
            continue;
        const int t = w.typ[k], x = k % w.width, below = k + w.width, above = k - w.width;
        if (t == WATER) {
            if (flowing(k)) {
                if (silt(k) > 200)
                    continue;
                const double chance = ERODE * (w.drop[k] >= 4 ? FALL_BOOST : 1);
                for (int o : {below, x > 0 ? k - 1 : -1, x + 1 < w.width ? k + 1 : -1, above}) { // under, beside, over
                    if (o < 0 || !soft(w.solid[o]) || w.liq[o] || machines.count(o))
                        continue;
                    if (w.random() > chance * (w.solid[o] == B_SAND ? 2 : w.solid[o] == B_WETDIRT ? 1.5 : 1) * (o == above ? 0.5 : 1))
                        continue;
                    if (w.liq[k] && w.typ[k] == WATER)
                        erode_bank(k, o);
                }
                // a bank the river has undercut (soil over open water or air beside it) slumps in as mud
                for (int o : {x > 0 ? above - 1 : -1, x + 1 < w.width ? above + 1 : -1}) {
                    if (o < 0 || !soft(w.solid[o]) || w.solid[o + w.width] || w.liq[o] || w.random() > chance * SLUMP)
                        continue;
                    if (w.liq[k] && w.typ[k] == WATER)
                        slump_bank(k, o);
                }
                if (!w.liq[k])
                    continue;
                // and washes away mud lying beside or under it
                for (int o : {below, x > 0 ? k - 1 : -1, x + 1 < w.width ? k + 1 : -1}) {
                    if (o < 0 || !w.liq[o] || w.typ[o] != L_MUD || w.solid[o] ||
                        w.random() > MUD_WASH * std::min(1.0, 48.0 / w.liq[o]))
                        continue;
                    const double before = energy({o});
                    w.typ[o] = WATER; // mud's implicit sediment becomes explicit silt, once
                    silt(o) = std::max(silt(o), 255.0);
                    retain({o}, before);
                    w.wake(o);
                }
            } else if (silt(k) && w.tick - w.flux[k] > STILL_TICKS && w.liq[below] && w.typ[below] == WATER) {
                // in still water silt sinks out of suspension towards the bottom
                const double room = std::max(0.0, (255 - silt(below)) * w.liq[below] / 255),
                             moved_silt = std::min(std::max(0.0, silt(k) * w.liq[k] / 255), room);
                silt(k) -= moved_silt * 255 / w.liq[k];
                silt(below) += moved_silt * 255 / w.liq[below];
            } else if (silt(k) >= BED_SILT && w.tick - w.flux[k] > STILL_TICKS && w.liq[below] && w.typ[below] == L_MUD &&
                       w.liq[below] < 255) {
                // still water over a mud bed lays its silt on the bed: a delta grows where a river stills
                const int mv = std::min({int(w.liq[k]), 255 - int(w.liq[below]),
                                         std::max(1, int(std::floor(silt(k) * w.liq[k] / 255)))});
                const double before = energy({k, below});
                w.carry(k, below, mv, w.liq[below], w.liq[k]);
                w.liq[k] -= mv;
                w.liq[below] += mv;
                if (!w.liq[k]) {
                    w.typ[k] = 0;
                    std::fill_n(w.sol.begin() + k * NSOL, NSOL, 0.0);
                }
                retain({k, below}, before);
                w.wake(k);
                w.wake(below);
            } else if (silt(k) >= SETTLE_SILT && w.tick - w.flux[k] > STILL_TICKS && (w.solid[below] || w.typ[below] == L_MUD)) {
                const double before = energy({k}); // still, silty water on the bottom drops its load as mud
                w.typ[k] = L_MUD;
                retain({k}, before);
                w.wake(k);
            }
        } else if (t == L_MUD && w.solid[below] && w.liq[above] && (w.typ[above] == WATER || w.typ[above] == L_MUD) &&
                   !flowing(above) && w.random() < PACK) {
            // mud on the bottom under still water slowly packs into wet soil that keeps its water as pore water
            const double before = energy({k});
            FluidBuffer water;
            water.type = WATER;
            water.amount = w.liq[k];
            water.temperature = w.temp[k];
            water.latent = w.latent[k];
            std::copy_n(w.sol.begin() + k * NSOL, NSOL, water.sol.begin());
            pores[k] = water;
            w.liq[k] = 0;
            w.typ[k] = 0;
            w.latent[k] = 0;
            std::fill_n(w.sol.begin() + k * NSOL, NSOL, 0.0);
            w.solid[k] = B_WETDIRT;
            held[k] = 255;
            retain({k}, before);
            w.wake(k);
        }
    }
}
} // namespace ecologist
