#include "sandbox.hpp"
#include <algorithm>
#include <cmath>
#include <queue>
#include <set>
namespace ecologist {
namespace {
bool logic(int b) { return b == B_AND || b == B_OR || b == B_NOT || b == B_COUNTER; }
bool source(int b) {
    return b == B_LEVER || b == B_PLATE || b == B_SENSOR || b == B_TIMER || b == B_THERMO || b == B_DEPTH ||
           b == B_TURBINE || b == B_WHEEL || b == B_WINDMILL || b == B_SOLAR;
}
bool conductor(const World &w, int k) {
    const int b = w.solid[k];
    if (b)
        return b == B_METAL || b == B_COPPER || b == B_ALUMINIUM || b == B_ZINC || b == B_GOLD ||
               b == B_PATINA;
    return w.liq[k] >= 32 && (w.typ[k] == L_QUICK || w.typ[k] == STORM ||
                              (w.typ[k] == WATER && w.sol[k * NSOL + SOL_SALT] >= 60));
}
int loss(int b) {
    return b == B_COPPER || b == B_PATINA || b == B_GOLD || b == B_ALUMINIUM ? 1
           : b == B_METAL || b == B_ZINC                                     ? 2
                                                                             : 3;
}
bool high(const std::vector<bool> &values) {
    return std::any_of(values.begin(), values.end(), [](bool b) { return b; });
}
bool matches(const World &w, int k, int type) {
    return type == 39 ? w.typ[k] == WATER && w.sol[k * NSOL + SOL_SALT] > 0 : w.typ[k] == type;
}
} // namespace
void Sandbox::devices_step(World &w, Grains &grains) {
    if (machines.empty() && pumps.empty())
        return;
    for (auto &[k, d] : machines) {
        bool on = d.on;
        const int b = d.kind;
        if (b == B_PLATE) {
            int up = neighbor(w, k, 0);
            on = up >= 0 && w.liq[up] >= 128;
        } else if (b == B_SENSOR) {
            on = false;
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n >= 0 && w.liq[n] >= 128 && (!d.filter || matches(w, n, d.filter)))
                    on = true;
            }
        } else if (b == B_THERMO)
            on = w.temp[k] > d.level;
        else if (b == B_DEPTH) {
            double amount = 0;
            for (int n = k - w.width;
                 n >= 0 && !w.solid[n] && w.liq[n] && FLUIDS[w.typ[n]].gravity > 0 && !FLUIDS[w.typ[n]].gas;
                 n -= w.width)
                amount += w.liq[n];
            on = amount / 255 >= d.level;
        } else if (b == B_TIMER)
            on = w.tick % d.period < static_cast<unsigned>(d.period / 2);
        else if (b == B_TURBINE || b == B_WHEEL) {
            on = false;
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n < 0)
                    continue;
                if (b == B_TURBINE && w.typ[n] == L_STEAM && w.liq[n] >= 32) {
                    on = true;
                    w.temp[n] = std::min(w.temp[n], 65.0f);
                }
                if (b == B_WHEEL && w.liq[n] && w.flux[n] && w.tick - w.flux[n] < 6)
                    on = true;
            }
        } else if (b == B_SOLAR) {
            on = sunlight > 0.15;
            for (int n = k - w.width; n >= 0 && on; n -= w.width)
                if (w.solid[n] && w.solid[n] != B_GLASS)
                    on = false;
            for (int dy = -2; dy <= 2 && !on; dy++)
                for (int dx = -2; dx <= 2; dx++) {
                    int x = k % w.width + dx, y = k / w.width + dy;
                    if (x >= 0 && y >= 0 && x < w.width && y < w.height) {
                        int n = y * w.width + x;
                        if (w.typ[n] == L_LIGHT && w.liq[n] >= 64)
                            on = true;
                    }
                }
        } else if (b == B_WINDMILL)
            on = !w.under[k] && std::abs(wind) > 0.2;
        else if (b == B_BATTERY)
            on = !d.charging && d.charge > 0;
        d.on = on;
    }
    // Physical conductor networks have finite signal reach. Keep inactive networks
    // as inputs too, so an attached off switch can actually turn off its target.
    std::vector<int> net(w.liq.size(), -1);
    std::vector<std::vector<int>> networks;
    int network = 0;
    for (const auto &[k, d] : machines)
        if (source(d.kind) || d.kind == B_BATTERY)
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n < 0 || net[n] >= 0 || !conductor(w, n))
                    continue;
                std::vector<int> q{n};
                net[n] = network;
                for (std::size_t h = 0; h < q.size(); h++)
                    for (int side = 0; side < 4; side++) {
                        int o = neighbor(w, q[h], side);
                        if (o >= 0 && net[o] < 0 && conductor(w, o) && q.size() < 8000) {
                            net[o] = network;
                            q.push_back(o);
                        }
                    }
                networks.push_back(q);
                network++;
            }
    std::fill(power.begin(), power.end(), 0);
    auto feed = [&](int k) {
        std::priority_queue<std::pair<int, int>> q;
        for (int dir = 0; dir < 4; dir++) {
            int n = neighbor(w, k, dir);
            if (n >= 0 && net[n] >= 0)
                q.push({120 - loss(w.solid[n]), n});
        }
        while (!q.empty()) {
            auto [value, n] = q.top();
            q.pop();
            if (value <= 0 || power[n] >= value)
                continue;
            power[n] = value;
            for (int dir = 0; dir < 4; dir++) {
                int o = neighbor(w, n, dir);
                if (o >= 0 && net[o] >= 0)
                    q.push({value - loss(w.solid[o]), o});
            }
        }
    };
    for (const auto &[k, d] : machines)
        if (source(d.kind) && d.on)
            feed(k);
    const auto external_power = power;
    for (const auto &[k, d] : machines)
        if (d.kind == B_BATTERY && d.on)
            feed(k);
    std::map<int, std::vector<bool>> inputs;
    for (const auto &[k, d] : machines)
        if (source(d.kind) || logic(d.kind) || d.kind == B_BATTERY)
            for (int target : d.targets)
                inputs[target].push_back(d.on);
    auto network_inputs = [&](int k) {
        std::map<int, bool> values;
        for (int dir = 0; dir < 4; dir++) {
            int n = neighbor(w, k, dir);
            if (n >= 0 && net[n] >= 0)
                values[net[n]] = values[net[n]] || power[n] > 0;
        }
        for (auto [id, on] : values)
            inputs[k].push_back(on);
    };
    for (const auto &[k, d] : machines)
        network_inputs(k);
    for (const auto &p : pumps) {
        network_inputs(p.inlet);
        network_inputs(p.outlet);
    }
    auto powered = [&](int k, bool fallback) {
        auto f = inputs.find(k);
        return f == inputs.end() ? fallback : high(f->second);
    };
    for (auto &[k, d] : machines)
        if (logic(d.kind)) {
            const auto &values = inputs[k];
            const bool hi = high(values);
            if (d.kind == B_AND)
                d.on = !values.empty() && std::all_of(values.begin(), values.end(), [](bool b) { return b; });
            else if (d.kind == B_OR)
                d.on = hi;
            else if (d.kind == B_NOT)
                d.on = !hi;
            else {
                if (hi && !d.was_high)
                    d.count = d.count >= d.limit ? 1 : d.count + 1;
                d.was_high = hi;
                d.on = d.count == d.limit;
            }
        }
    for (auto &[k, d] : machines)
        if (d.kind == B_MOTOR) {
            d.active = powered(k, false);
            if (d.active) {
                transfer(w, neighbor(w, k, d.direction == 2 ? 1 : 2), neighbor(w, k, d.direction),
                         int(CFG_MOTOR_RATE));
                for (int dir = 0; dir < 4; dir++) {
                    int n = neighbor(w, k, dir);
                    auto f = machines.find(n);
                    if (n >= 0 && (f == machines.end() || f->second.kind != B_MOTOR))
                        inputs[n].push_back(true);
                }
            }
        }
    for (auto &entry : machines) {
        const int k = entry.first;
        auto &d = entry.second;
        const int b = d.kind;
        if (b == B_GATE)
            set_gate(w, k, d, powered(k, d.manual), &grains);
        else if (b == B_VALVE)
            d.open = powered(k, d.manual);
        else if (b == B_BATTERY) {
            bool charging = false;
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n >= 0 && external_power[n] > 0)
                    charging = true;
            }
            for (const auto &[s, other] : machines)
                if (s != k && other.on &&
                    std::find(other.targets.begin(), other.targets.end(), k) != other.targets.end())
                    charging = true;
            d.charging = charging;
            if (charging)
                d.charge = std::min(CFG_BATTERY_CAP, d.charge + 1);
            else if (d.on)
                d.charge = std::max(0.0, d.charge - 1);
        } else if (b == B_LAMP || b == B_PIXEL || b == B_EMAGNET)
            d.active = powered(k, false);
        else if (b == B_SPRING) {
            d.active = powered(k, true);
            if (!d.active)
                continue;
            FluidBuffer added;
            added.type = d.liquid == 39 ? WATER : d.liquid;
            added.amount = CFG_SPRING_RATE;
            added.temperature = FLUIDS[d.liquid].paint_temperature;
            if (d.liquid == 39)
                added.sol[SOL_SALT] = 255 * .035 / .965;
            const double heat_per_unit =
                (FLUIDS[added.type].capacity +
                 (SALT_CAP * added.sol[SOL_SALT] + SUGAR_CAP * added.sol[SOL_SUGAR]) / 255) *
                added.temperature / 255;
            for (int dir : {3, 1, 2, 0}) {
                const int amount = put(w, added, neighbor(w, k, dir), int(added.amount));
                source_units += amount;
                source_heat += heat_per_unit * amount;
            }
        } else if (b == B_DRAIN) {
            d.active = powered(k, true);
            if (!d.active)
                continue;
            for (int dir = 0; dir < 4; dir++) {
                FluidBuffer removed;
                int amount = take(w, neighbor(w, k, dir), removed, int(CFG_DRAIN_RATE));
                drain_units += amount;
                drain_heat += (FLUIDS[removed.type].capacity * amount / 255.0 +
                               (SALT_CAP * removed.sol[SOL_SALT] + SUGAR_CAP * removed.sol[SOL_SUGAR]) *
                                   amount / (255.0 * 255.0)) *
                                  removed.temperature +
                              removed.latent;
                for (int s = 0; s < NSOL; s++)
                    drained_solutes[s] += removed.sol[s] * amount / 255;
            }
        } else if (b == B_BOILER) {
            bool coolant = false, hot = false;
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n >= 0 && w.liq[n] && w.typ[n] == L_COOLANT) {
                    coolant = true;
                    if (w.temp[n] > CFG_BOILER_TEMP) {
                        hot = true;
                        w.temp[n] -= 2;
                    }
                }
            }
            d.active = coolant ? hot : powered(k, true);
            if (!d.active)
                continue;
            w.temp[k] = std::max(w.temp[k], float(CFG_BOILER_TEMP));
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n >= 0 && w.liq[n] && w.temp[n] < CFG_BOILER_TEMP) {
                    w.temp[n] += float((CFG_BOILER_TEMP - w.temp[n]) * CFG_BOILER_HEAT);
                    w.wake(n);
                }
            }
        } else if (b == B_SEPARATOR) {
            d.active = powered(k, true);
            if (!d.active || w.tick % 8)
                continue;
            // Fractional salt stays buffered when there is no physical grain output room.
            auto flush = [&]() {
                for (int dir = 0; dir < 4 && d.salt > 1e-9; dir++) {
                    int n = neighbor(w, k, dir);
                    if (n < 0 || w.solid[n] || w.liq[n])
                        continue;
                    for (int pixel = 0; pixel < 64 && d.salt > 1e-9; pixel++) {
                        double amount = std::min(d.salt, GRAIN_AMOUNT),
                               temperature = d.salt_heat / (SALT_CAP * d.salt / 255);
                        if (grains.add(w, n % w.width * 8 + pixel % 8, n / w.width * 8 + pixel / 8,
                                       SALT_GRAIN, amount, temperature)) {
                            d.salt -= amount;
                            d.salt_heat -= SALT_CAP * amount / 255 * temperature;
                        }
                    }
                }
            };
            flush();
            std::set<int> seen;
            std::vector<int> q;
            for (int dir = 0; dir < 4; dir++) {
                int n = neighbor(w, k, dir);
                if (n >= 0 && w.liq[n] && !w.solid[n] && seen.insert(n).second)
                    q.push_back(n);
            }
            for (std::size_t i = 0; i < q.size(); i++) {
                int n = q[i];
                if (w.typ[n] == FOAM) {
                    double energy = capacity(w, n) * w.temp[n];
                    w.typ[n] = w.random() < .5 ? OIL : WATER;
                    w.latent[n] += energy - capacity(w, n) * w.temp[n];
                    w.wake(n);
                }
                double available = std::max(0.0, w.sol[n * NSOL + SOL_SALT]) * w.liq[n] / 255;
                double amount = std::min({available, CFG_SEPARATE_RATE * w.liq[n] / 255, 255 - d.salt});
                if (amount > 0) {
                    d.salt += amount;
                    d.salt_heat += SALT_CAP * amount / 255 * w.temp[n];
                    w.sol[n * NSOL + SOL_SALT] -= amount * 255 / w.liq[n];
                    w.wake(n);
                }
                for (int dir = 0; dir < 4 && q.size() < CFG_SEPARATE_LIMIT; dir++) {
                    int o = neighbor(w, n, dir);
                    if (o >= 0 && !w.solid[o] && w.liq[o] && seen.insert(o).second)
                        q.push_back(o);
                }
            }
            flush();
        } else if (b == B_MEMBRANE) {
            for (auto pair : {std::pair<int, int>{0, 3}, {3, 0}, {1, 2}, {2, 1}}) {
                int a = pair.first, from = neighbor(w, k, a), to = neighbor(w, k, pair.second);
                if (from < 0 || to < 0 || !matches(w, from, d.liquid))
                    continue;
                if ((a == 0 && FLUIDS[d.liquid].gravity < 0) || (a == 3 && FLUIDS[d.liquid].gravity > 0))
                    continue;
                int amount = int(CFG_MEMBRANE_RATE);
                if (a == 1 || a == 2)
                    amount = std::min(amount, (int(w.liq[from]) - int(w.liq[to])) / 2);
                if (amount > 0)
                    transfer(w, from, to, amount);
            }
        } else if (b == B_GEYSER) {
            std::vector<int> pocket;
            double heat = 0;
            for (int dy = 1; dy <= 6; dy++)
                for (int dx = -3; dx <= 3; dx++) {
                    int x = k % w.width + dx, y = k / w.width + dy;
                    if (x < 0 || x >= w.width || y >= w.height)
                        continue;
                    int n = y * w.width + x;
                    if (w.typ[n] == WATER && w.liq[n]) {
                        pocket.push_back(n);
                        heat += w.temp[n];
                    }
                }
            d.active = d.erupting > 0;
            if (d.erupting > 0) {
                --d.erupting;
                int height = 1 + int(w.random() * CFG_GEYSER_SPOUT), out = k - height * w.width;
                if (out < 0 || w.solid[out] || (w.liq[out] && w.typ[out] != WATER))
                    continue;
                int want = std::min(48, 255 - int(w.liq[out])), took = 0;
                for (int n : pocket) {
                    int amount = std::min(want - took, int(w.liq[n]));
                    if (amount > 0 && transfer(w, n, out, amount))
                        took += amount;
                }
                if (!took && want)
                    d.erupting = 0;
            } else if (d.rest > 0)
                --d.rest;
            else if (pocket.size() >= 4 && heat / pocket.size() > CFG_GEYSER_HEAT) {
                d.erupting = int(CFG_GEYSER_BURST);
                d.rest = int(CFG_GEYSER_REST_MIN + w.random() * (CFG_GEYSER_REST_MAX - CFG_GEYSER_REST_MIN));
            }
        } else if (b == B_VENT && w.tick % int(CFG_VENT_EVERY) == 0) {
            int n = neighbor(w, k, 0);
            if (n < 0 || w.solid[n] || (w.liq[n] && (w.typ[n] != L_POISON && w.typ[n] != L_SMOKE)))
                continue;
            FluidBuffer gas;
            gas.type = w.liq[n] ? w.typ[n] : w.random() < .6 ? L_POISON : L_SMOKE;
            gas.amount = w.liq[n] ? w.liq[n] < 200 ? 32 : 0 : 48;
            gas.temperature = 120;
            const double heat_per_unit = FLUIDS[gas.type].capacity * gas.temperature / 255;
            int amount = put(w, gas, n, int(gas.amount));
            source_units += amount;
            source_heat += amount * heat_per_unit;
        }
    }
    for (auto &p : pumps) {
        if (inputs.count(p.inlet) || inputs.count(p.outlet))
            p.on = powered(p.inlet, false) || powered(p.outlet, false);
    }
    // Original game-scale electrolysis: withdraw carrier only after gas space is
    // reserved. Dissolved ingredients stay in the water, including its last unit.
    for (const auto &tiles : networks)
        for (int attempt = 0; attempt < ELECTROLYSIS_TRIES; attempt++) {
            int n = tiles[std::min(tiles.size() - 1, std::size_t(w.random() * tiles.size()))];
            if (power[n] <= 0)
                continue;
            if (w.solid[n])
                n = neighbor(w, n, int(w.random() * 4));
            if (n < 0 || w.solid[n] || w.typ[n] != WATER || w.liq[n] <= 1)
                continue;
            const double chlorine = std::clamp((w.sol[n * NSOL + SOL_SALT] - 120) / 135, 0.0, 1.0);
            const int type = w.random() < 2.0 / 3    ? L_HYDROGEN
                             : w.random() < chlorine ? L_CHLORINE
                                                     : L_OXYGEN;
            int out = n - w.width;
            while (out >= 0 && !w.solid[out] && w.liq[out] &&
                   (w.typ[out] == WATER ||
                    (FLUIDS[w.typ[out]].gas && (w.typ[out] != type || w.liq[out] == 255))))
                out -= w.width;
            if (out < 0 || w.solid[out] || (w.liq[out] && w.typ[out] != type))
                continue;
            const int amount = std::min({ELECTROLYSIS_AMOUNT, 255 - int(w.liq[out]), int(w.liq[n]) - 1});
            if (amount <= 0)
                continue;
            const double before = w.liq[n], phase = w.latent[n] * amount / before;
            w.latent[n] -= phase;
            w.liq[n] -= amount;
            for (int channel = 0; channel < NSOL; channel++) {
                double &c = w.sol[n * NSOL + channel];
                if (channel == 12) {
                    constexpr double oxygen_reference = 9.1 / (15.0 / 255);
                    c = oxygen_reference - (oxygen_reference - c) * before / w.liq[n];
                } else
                    c *= before / w.liq[n];
            }
            FluidBuffer gas;
            gas.type = type;
            gas.amount = amount;
            gas.temperature = w.temp[n];
            gas.sol[12] = 9.1 / (15.0 / 255);
            gas.latent = phase + (FLUIDS[WATER].capacity - FLUIDS[type].capacity) * amount / 255 * w.temp[n];
            put(w, gas, out, amount);
            if (type == L_CHLORINE) {
                double changed = std::min(w.sol[n * NSOL + SOL_SALT], 2.0 * amount / ELECTROLYSIS_AMOUNT);
                w.sol[n * NSOL + SOL_SALT] -= changed;
                w.sol[n * NSOL + 8] += changed;
                w.latent[n] += SALT_CAP * changed / 255 * w.liq[n] / 255 * w.temp[n];
            }
            w.wake(n);
        }
}
} // namespace ecologist
