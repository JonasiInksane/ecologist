#include "sandbox.hpp"
#include <algorithm>
#include <cmath>
namespace ecologist {
void Sandbox::freeze(World &w, int k, int block) {
    held[k] = w.liq[k] ? w.liq[k] : held[k];
    w.solid[k] = block;
    w.liq[k] = 0;
    w.typ[k] = 0;
    w.wake(k);
}
void Sandbox::melt(World &w, int k, int type) {
    w.solid[k] = 0;
    w.liq[k] = std::clamp(int(std::round(held[k])), 1, 255);
    w.typ[k] = type;
    held[k] = 255;
    w.wake(k);
}
void Sandbox::thermal_step(World &w) {
    auto conductivity = [&](int k) {
        return w.solid[k] ? BLOCK_COND[w.solid[k]] : w.liq[k] ? LIQ_COND[w.typ[k]] : AIR_CONDUCTANCE;
    };
    auto exchange = [&](int a, int b) {
        double delta = w.temp[b] - w.temp[a];
        if (std::abs(delta) < 0.001)
            return;
        double ca = std::max(0.001, capacity(w, a)), cb = std::max(0.001, capacity(w, b));
        double heat = delta * std::min(conductivity(a), conductivity(b)) * HEAT_RATE;
        double maxheat = std::abs(delta) * ca * cb / (ca + cb) * 0.25;
        heat = std::clamp(heat, -maxheat, maxheat);
        const double ta = w.temp[a] + heat / ca, tb = w.temp[b] - heat / cb;
        w.temp[a] = static_cast<float>(ta);
        w.temp[b] = static_cast<float>(tb);
        w.latent[a] += (ta - w.temp[a]) * ca;
        w.latent[b] += (tb - w.temp[b]) * cb;
        auto attached = [&](int n) {
            int block = w.solid[n];
            return block == B_SPONGE || block == B_WETSPONGE || block == B_DIRT || block == B_WETDIRT;
        };
        if (pores.count(a) && attached(a))
            pores[a].temperature = w.temp[a];
        if (pores.count(b) && attached(b))
            pores[b].temperature = w.temp[b];
    };
    for (int k = 0; k < w.width * w.height; k++) {
        if (k % w.width + 1 < w.width)
            exchange(k, k + 1);
        if (k + w.width < w.width * w.height)
            exchange(k, k + w.width);
    }
    for (int k = 0; k < w.width * w.height; k++) {
        const int t = w.typ[k], b = w.solid[k];
        const double temp = w.temp[k], amount = w.liq[k] ? w.liq[k] : held[k];
        auto phase = [&](double at, double latent, int block, int liquid, bool heating) {
            if (heating ? temp <= at : temp >= at)
                return;
            const double available = capacity(w, k) * (w.temp[k] - at) + w.latent[k],
                         need = latent * 0.25 * amount / 255;
            w.temp[k] = static_cast<float>(at);
            w.latent[k] = available;
            if (heating ? available < need : available > -need)
                return;
            const double extra = available + (heating ? -need : need);
            if (block)
                freeze(w, k, block);
            else
                melt(w, k, liquid);
            const double cap = std::max(0.001, capacity(w, k)), newtemp = at + extra / cap;
            w.temp[k] = static_cast<float>(newtemp);
            w.latent[k] = (newtemp - w.temp[k]) * cap;
        };
        if (t == WATER) {
            int down = neighbor(w, k, 3);
            if (down < 0 || w.solid[down] || w.liq[down] >= 250)
                phase(-0.085 * w.sol[k * NSOL + SOL_SALT], 334, B_ICE, 0, false);
        } else if (b == B_ICE)
            phase(0, 334, 0, WATER, true);
        else if (t == L_LAVA) {
            int down = neighbor(w, k, 3);
            if (down < 0 || w.solid[down] || w.liq[down])
                phase(1000, 400 * 2.7, B_BASALT, 0, false);
        } else if (t == L_MOLTEN)
            phase(1150, 247 * 7, B_METAL, 0, false);
        else if (b == B_METAL)
            phase(1538, 247 * 7.85, 0, L_MOLTEN, true);
        else if (t == L_MSLAG)
            phase(1300, 400 * 2.7, B_SLAG, 0, false);
        else if (b == B_OBSIDIAN || b == B_BASALT || b == B_STONE)
            phase(1200, 400 * 2.7, 0, L_LAVA, true);
        else if (b == B_COMB && temp > 64)
            melt(w, k, L_HONEY);
        else if (t == L_HONEY && temp > 160)
            freeze(w, k, B_CRISP);
        else if (b == B_SUGAR && temp > 170)
            w.solid[k] = B_CRISP;
        else if (b == B_CLAY && temp > 900)
            w.solid[k] = B_BRICK;
        else if (t == L_QUICK && temp > 357)
            w.typ[k] = L_POISON;
        else if (t == L_NITRO && temp < 12)
            freeze(w, k, B_FNITRO);
        else if (b == B_FNITRO && temp > 14)
            melt(w, k, L_NITRO);
        else if (t == L_MUD && temp > 100)
            freeze(w, k, B_DIRT);
        else if (t == L_FROST)
            w.temp[k] = std::min(w.temp[k], -40.0f);
        else if (b == B_PERMAFROST && temp > 0) {
            held[k] = 200;
            melt(w, k, L_MUD);
        } else if (b == B_SNOW && temp > 0) {
            held[k] = held[k] * 64 / 255;
            melt(w, k, WATER);
        }
    }
}
void Sandbox::material_step(World &w, Grains &grains) {
    // Corrosion can remove a wet matrix. Its contents remain recoverable even if
    // acid temporarily occupies every available outlet.
    for (auto it = pores.begin(); it != pores.end();) {
        int k = it->first, b = w.solid[k];
        if (b == B_SPONGE || b == B_WETSPONGE || b == B_DIRT || b == B_WETDIRT) {
            ++it;
            continue;
        }
        put(w, it->second, k, 255);
        for (int dir = 0; dir < 4; dir++)
            put(w, it->second, neighbor(w, k, dir), 255);
        if (it->second.amount < 1e-9)
            it = pores.erase(it);
        else
            ++it;
    }
    for (int k = 0; k < w.width * w.height; k++) {
        const int b = w.solid[k];
        if (b == B_SPONGE || b == B_WETSPONGE || b == B_DIRT || b == B_WETDIRT) {
            const bool soil = b == B_DIRT || b == B_WETDIRT;
            auto found = pores.find(k);
            bool adjacent = false;
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n >= 0 && w.typ[n] == WATER && w.liq[n])
                    adjacent = true;
            }
            if (found == pores.end() && !adjacent)
                continue;
            auto &p = pores[k];
            p.temperature = w.temp[k];
            const double limit = soil ? 96 : 255, matrix = BLOCK_CAP[soil ? B_DIRT : B_SPONGE];
            if (w.temp[k] <= 60 && (!soil || w.random() < 0.01))
                for (int dir = 0; dir < 4; dir++) {
                    int n = neighbor(w, k, dir);
                    if (n < 0 || w.typ[n] != WATER)
                        continue;
                    double oldcap = capacity(w, k), energy = oldcap * w.temp[k];
                    FluidBuffer incoming;
                    take(w, n, incoming, std::min(32, int(limit - p.amount)));
                    if (incoming.amount <= 0)
                        continue;
                    double inc =
                        (FLUIDS[WATER].capacity +
                         (SALT_CAP * incoming.sol[SOL_SALT] + SUGAR_CAP * incoming.sol[SOL_SUGAR]) / 255) *
                        incoming.amount / 255;
                    for (int s = 0; s < NSOL; s++)
                        p.sol[s] = (p.sol[s] * p.amount + incoming.sol[s] * incoming.amount) /
                                   (p.amount + incoming.amount);
                    p.amount += incoming.amount;
                    p.type = WATER;
                    p.latent += incoming.latent;
                    double cap =
                        matrix + (FLUIDS[WATER].capacity +
                                  (SALT_CAP * p.sol[SOL_SALT] + SUGAR_CAP * p.sol[SOL_SUGAR]) / 255) *
                                     p.amount / 255;
                    double next = (energy + incoming.temperature * inc) / cap;
                    w.temp[k] = static_cast<float>(next);
                    w.latent[k] += (next - w.temp[k]) * cap;
                    p.temperature = w.temp[k];
                    w.wake(k);
                }
            if (p.amount >= 1 && (w.temp[k] > 60 || soil)) {
                int budget = soil ? 8 : 32;
                for (int dir : {3, 1, 2, 0}) {
                    int n = neighbor(w, k, dir);
                    if (n < 0 || w.solid[n])
                        continue;
                    if (soil && dir != 3)
                        continue;
                    put(w, p, n, budget);
                    if (!soil && p.amount < 1)
                        break;
                }
            }
            w.solid[k] =
                soil ? (p.amount >= 86 ? B_WETDIRT : B_DIRT) : (p.amount >= 1 ? B_WETSPONGE : B_SPONGE);
        } else if (b == B_POROUS) {
            int up = neighbor(w, k, 0), down = neighbor(w, k, 3);
            if (up >= 0 && down >= 0) {
                if (w.liq[up] && FLUIDS[w.typ[up]].gravity > 0)
                    transfer(w, up, down, 8);
                if (w.liq[down] && FLUIDS[w.typ[down]].gravity < 0)
                    transfer(w, down, up, 8);
            }
        } else if (b == B_SALT || b == B_GEM || b == B_SUGAR || b == B_CRISP || b == B_SODA) {
            int channel = b == B_SUGAR || b == B_CRISP ? SOL_SUGAR : b == B_SODA ? 8 : SOL_SALT;
            for (int dir = 0; dir < 4 && w.solid[k]; dir++) {
                int n = neighbor(w, k, dir);
                if (n < 0 || w.typ[n] != WATER || !w.liq[n])
                    continue;
                double &c = w.sol[n * NSOL + channel];
                double ceiling = channel == 8 ? 255 : saturation(channel, w.temp[n]);
                double amount = std::min({24.0, held[k], std::max(0.0, (ceiling - c) * w.liq[n] / 255)});
                if (amount <= 0)
                    continue;
                const double energy = capacity(w, n) * w.temp[n] + BLOCK_CAP[b] * amount / 255 * w.temp[k];
                c += amount * 255 / w.liq[n];
                held[k] -= amount;
                const double cap = capacity(w, n), next = energy / cap;
                w.temp[n] = static_cast<float>(next);
                w.latent[n] += (next - w.temp[n]) * cap;
                if (held[k] < 1e-9) {
                    w.solid[k] = 0;
                    held[k] = 255;
                }
                w.wake(k);
                w.wake(n);
            }
        }
    }
    // Material-defined magnets and powered electromagnets pull actual ferrofluid.
    std::vector<unsigned char> moved(w.liq.size(), 0);
    for (int k = 0; k < w.width * w.height; k++) {
        bool magnet = w.solid[k] == B_MAGNET;
        auto d = machines.find(k);
        if (d != machines.end() && d->second.kind == B_EMAGNET && d->second.active)
            magnet = true;
        if (!magnet)
            continue;
        for (int dy = -8; dy <= 8; dy++)
            for (int dx = -8; dx <= 8; dx++) {
                int x = k % w.width + dx, y = k / w.width + dy;
                if (x < 0 || y < 0 || x >= w.width || y >= w.height)
                    continue;
                int n = y * w.width + x;
                if (w.typ[n] != L_FERRO || !w.liq[n] || moved[n])
                    continue;
                int dir = std::abs(dx) > std::abs(dy) ? (dx > 0 ? 1 : 2) : (dy > 0 ? 0 : 3),
                    target = neighbor(w, n, dir);
                if (target >= 0 && transfer(w, n, target, 24))
                    moved[target] = 1;
            }
    }
    (void)grains;
}
void Sandbox::grain_effects(World &w, Grains &g) {
    for (std::size_t i = 0; i < g.particles.size();) {
        auto &p = g.particles[i];
        if (p.amount < 1e-9) {
            g.remove(i);
            continue;
        }
        int k = p.y / 8 * w.width + p.x / 8;
        // Grain/cell heat exchange is quantity weighted and preserves sensible heat.
        const double gc = grain_capacity(p.kind, p.amount), wc = capacity(w, k),
                     delta = w.temp[k] - p.temperature;
        if (gc > 0 && wc > 0) {
            double heat = delta * gc * wc / (gc + wc) * 0.12;
            p.temperature += heat / gc;
            double next = w.temp[k] - heat / wc;
            w.temp[k] = static_cast<float>(next);
            w.latent[k] += (next - w.temp[k]) * wc;
        }
        int next = p.kind;
        if (p.kind == SUGAR_GRAIN && p.temperature > 170)
            next = 8;
        if (p.kind == SAND && p.temperature > 1700)
            next = 9;
        if (p.kind == SAND && p.temperature > 1000 && next != 9) {
            for (auto offset : {std::pair<int, int>{0, -1}, {-1, 0}, {1, 0}, {0, 1}}) {
                int x = p.x + offset.first, y = p.y + offset.second;
                if (x < 0 || y < 0 || x >= g.width || y >= g.height)
                    continue;
                const auto slot = g.occupied[y * g.width + x];
                if (!slot)
                    continue;
                auto &flux = g.particles[slot - 1];
                if ((flux.kind == 5 || flux.kind == 6) && flux.amount > 0) {
                    const double used = std::min(p.amount, flux.amount);
                    flux.amount -= used;
                    next = 9;
                    break;
                }
            }
        }
        if (p.kind == 5 && p.temperature > 150)
            next = 6;
        if (p.kind == SUGAR_GRAIN && w.typ[k] == L_ACID)
            next = 10;
        if (p.kind == 7 && w.typ[k] == WATER && w.liq[k]) {
            next = 11;
            w.temp[k] += float(60 * p.amount / 255 / std::max(.001, wc));
        }
        if (p.kind == 6 && w.liq[k] &&
            (w.typ[k] == L_ACID || (w.typ[k] == WATER && w.sol[k * NSOL + 7] >= 40))) {
            for (const auto &rule : CONTACT_RULES)
                if (rule.block == B_ASH && rule.kind == 0 && w.random() < rule.rate) {
                    int outlet = neighbor(w, k, 0),
                        amount = std::max(1, int(std::ceil(rule.gas_amount * p.amount / 255)));
                    if (outlet < 0 || w.solid[outlet] || (w.liq[outlet] && w.typ[outlet] != rule.gas) ||
                        255 - w.liq[outlet] < amount)
                        break;
                    FluidBuffer gas;
                    gas.type = rule.gas;
                    gas.amount = amount;
                    gas.temperature = p.temperature;
                    put(w, gas, outlet, amount);
                    const double fraction = p.amount / 255;
                    w.temp[k] += float(rule.heat * fraction / std::max(.001, wc));
                    if (w.typ[k] == WATER) {
                        w.sol[k * NSOL + 7] = std::max(0.0, w.sol[k * NSOL + 7] - rule.uses * fraction);
                        for (int channel = 0; channel < NSOL; channel++)
                            w.sol[k * NSOL + channel] += rule.solutes[channel] * fraction;
                    } else {
                        FluidBuffer used;
                        take(w, k, used, std::max(1, int(std::ceil(rule.uses * fraction))));
                    }
                    p.amount = 0;
                    break;
                }
            if (p.amount < 1e-9) {
                g.remove(i);
                continue;
            }
        }
        if (p.kind == 5 && w.typ[k] == L_ACID && w.liq[k]) {
            int up = neighbor(w, k, 0);
            if (up >= 0 && !w.solid[up] && (!w.liq[up] || w.typ[up] == L_CO2) && 255 - w.liq[up] >= 1) {
                FluidBuffer gas;
                gas.type = L_CO2;
                gas.amount = 1;
                gas.temperature = p.temperature;
                put(w, gas, up, 1);
                w.liq[k] = std::max(0, int(w.liq[k]) - 1);
                if (!w.liq[k])
                    w.typ[k] = 0;
                next = 6;
            }
        }
        if (next != p.kind) {
            const double energy = gc * p.temperature;
            p.kind = next;
            p.temperature = energy / std::max(0.000001, grain_capacity(next, p.amount));
            g.image[p.y * g.width + p.x] = next;
        }
        if (p.kind == 4 && p.temperature > 0) {
            auto &water = meltwater[k];
            const double energy = water.amount / 255 * FLUIDS[WATER].capacity * water.temperature +
                                  grain_capacity(p.kind, p.amount) * p.temperature;
            water.type = WATER;
            water.amount += p.amount;
            water.temperature = energy / (water.amount / 255 * FLUIDS[WATER].capacity);
            g.remove(i);
            continue;
        }
        ++i;
    }
    for (std::size_t i = 0; i < g.particles.size();)
        if (g.particles[i].amount < 1e-9)
            g.remove(i);
        else
            ++i;
    for (auto it = meltwater.begin(); it != meltwater.end();) {
        put(w, it->second, it->first, 255);
        if (it->second.amount < 1e-9)
            it = meltwater.erase(it);
        else
            ++it;
    }
}
} // namespace ecologist
