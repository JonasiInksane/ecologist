#include "sandbox.hpp"
#include <algorithm>
#include <cmath>
#include <queue>
#include <set>
namespace ecologist {
namespace {
double buf_cap(const FluidBuffer &b, double a) {
    return (FLUIDS[b.type].capacity + (SALT_CAP * b.sol[SOL_SALT] + SUGAR_CAP * b.sol[SOL_SUGAR]) / 255.0) *
           a / 255.0;
}
bool is_pipe(int b) { return b == B_PIPE || b == B_VALVE || b == B_FILTER; }
bool logic(int b) { return b == B_AND || b == B_OR || b == B_NOT || b == B_COUNTER; }
bool source(int b) {
    return b == B_LEVER || b == B_PLATE || b == B_SENSOR || b == B_TIMER || b == B_THERMO || b == B_DEPTH ||
           b == B_TURBINE || b == B_WHEEL || b == B_WINDMILL || b == B_SOLAR;
}
bool trigger(int b) { return source(b) || logic(b) || b == B_BATTERY; }
int cycle(int value, std::initializer_list<int> values) {
    auto it = std::find(values.begin(), values.end(), value);
    return it == values.end() || ++it == values.end() ? *values.begin() : *it;
}
bool grain_occupied(const World &w, int k, const Grains *grains) {
    if (!grains || grains->occupied.empty())
        return false;
    for (int y = 0; y < 8; y++)
        for (int x = 0; x < 8; x++)
            if (grains->occupied[(k / w.width * 8 + y) * grains->width + k % w.width * 8 + x])
                return true;
    return false;
}
} // namespace
void Sandbox::reset(const World &w) {
    machines.clear();
    pumps.clear();
    pores.clear();
    meltwater.clear();
    held.assign(w.liq.size(), 255);
    power.assign(w.liq.size(), 0);
    pipe_show.assign(w.liq.size(), 0);
    pipe_time.assign(w.liq.size(), 0);
    pending_inlet = pending_wire = -1;
    source_units = drain_units = source_heat = drain_heat = 0;
    drained_solutes.fill(0);
    message = "Choose a material or build a machine.";
}
int Sandbox::neighbor(const World &w, int k, int d) const {
    const int x = k % w.width, y = k / w.width;
    return d == 0   ? (y ? k - w.width : -1)
           : d == 1 ? (x ? k - 1 : -1)
           : d == 2 ? (x + 1 < w.width ? k + 1 : -1)
                    : (y + 1 < w.height ? k + w.width : -1);
}
double Sandbox::capacity(const World &w, int k) const {
    if (w.solid[k]) {
        auto p = pores.find(k);
        if (p != pores.end())
            return BLOCK_CAP[w.solid[k] == B_WETDIRT     ? B_DIRT
                             : w.solid[k] == B_WETSPONGE ? B_SPONGE
                                                         : w.solid[k]] +
                   buf_cap(p->second, p->second.amount);
        return BLOCK_CAP[w.solid[k]] * held[k] / 255.0 +
               (w.solid[k] == B_ICE ? w.dissolved_capacity(k, held[k]) : 0);
    }
    return w.liq[k] ? FLUIDS[w.typ[k]].capacity * w.liq[k] / 255.0 + w.dissolved_capacity(k, w.liq[k])
                    : AIR_CAP;
}
int Sandbox::take(World &w, int from, FluidBuffer &b, int amount) {
    if (from < 0 || w.solid[from] || !w.liq[from] || (b.amount > 0 && b.type != w.typ[from]))
        return 0;
    amount = std::min({amount, int(w.liq[from]), int(255 - b.amount)});
    if (amount <= 0)
        return 0;
    const double old = buf_cap(b, b.amount), incoming = (FLUIDS[w.typ[from]].capacity * amount / 255.0 +
                                                         w.dissolved_capacity(from, amount));
    b.temperature = (b.temperature * old + w.temp[from] * incoming) / (old + incoming);
    for (int s = 0; s < NSOL; s++)
        b.sol[s] = (b.sol[s] * b.amount + w.sol[from * NSOL + s] * amount) / (b.amount + amount);
    const double latent = w.latent[from] * amount / w.liq[from];
    b.latent += latent;
    w.latent[from] -= latent;
    b.type = w.typ[from];
    b.amount += amount;
    w.liq[from] -= amount;
    if (!w.liq[from]) {
        w.typ[from] = 0;
        std::fill_n(w.sol.begin() + from * NSOL, NSOL, 0.0);
        w.latent[from] = 0;
    }
    w.wake(from);
    return amount;
}
int Sandbox::put(World &w, FluidBuffer &b, int to, int amount) {
    if (to < 0 || w.solid[to] || b.amount < 1 || (w.liq[to] && w.typ[to] != b.type))
        return 0;
    amount = std::min({amount, int(b.amount), 255 - int(w.liq[to])});
    if (amount <= 0)
        return 0;
    const double had = w.liq[to],
                 receiving =
                     had ? (FLUIDS[w.typ[to]].capacity * had / 255 + w.dissolved_capacity(to, had)) : 0,
                 incoming = buf_cap(b, amount);
    const double energy = w.temp[to] * receiving + b.temperature * incoming;
    w.temp[to] = static_cast<float>(energy / (receiving + incoming));
    const double phase = b.latent * amount / b.amount;
    b.latent -= phase;
    w.latent[to] = (had ? w.latent[to] : 0) + phase + energy - w.temp[to] * (receiving + incoming);
    for (int s = 0; s < NSOL; s++)
        w.sol[to * NSOL + s] = (w.sol[to * NSOL + s] * had + b.sol[s] * amount) / (had + amount);
    w.typ[to] = b.type;
    w.liq[to] += amount;
    b.amount -= amount;
    w.flux[to] = w.tick;
    w.wake(to);
    if (b.amount < 1e-10) {
        b.amount = 0;
        b.type = 0;
        b.latent = 0;
        b.sol.fill(0);
    }
    return amount;
}
bool Sandbox::transfer(World &w, int from, int to, int amount) {
    if (from < 0 || to < 0 || from == to || w.solid[from] || w.solid[to] || !w.liq[from] ||
        (w.liq[to] && w.typ[from] != w.typ[to]))
        return false;
    amount = std::min({amount, int(w.liq[from]), 255 - int(w.liq[to])});
    if (amount <= 0)
        return false;
    FluidBuffer b;
    take(w, from, b, amount);
    put(w, b, to, amount);
    return true;
}
double Sandbox::buffered_volume() const {
    double a = 0;
    for (const auto &p : pumps)
        a += p.buffer.amount;
    for (const auto &p : pores)
        a += p.second.amount;
    for (const auto &p : meltwater)
        a += p.second.amount;
    return a;
}
void Sandbox::erase(World &w, int k) {
    machines.erase(k);
    pores.erase(k);
    meltwater.erase(k);
    held[k] = 255;
    pipe_show[k] = pipe_time[k] = 0;
    if (pending_inlet == k)
        pending_inlet = -1;
    if (pending_wire == k)
        pending_wire = -1;
    for (auto &entry : machines) {
        auto &a = entry.second.targets;
        a.erase(std::remove(a.begin(), a.end(), k), a.end());
    }
    for (auto p = pumps.begin(); p != pumps.end();)
        if (p->inlet == k || p->outlet == k) {
            const int other = p->inlet == k ? p->outlet : p->inlet;
            w.solid[other] = 0;
            w.wake(other);
            p = pumps.erase(p);
        } else
            ++p;
}
bool Sandbox::paint(World &w, Grains &g, int x, int y, int radius, int material) {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height)
        return false;
    if (material < 0 &&
        (material <= -80 || DEVICE_KIND(-material) || material == -B_PUMP_IN || material == -B_PUMP_OUT))
        return false;
    radius = std::clamp(radius, 1, 16);
    for (int yy = std::max(0, y - radius + 1); yy < std::min(w.height, y + radius); yy++)
        for (int xx = std::max(0, x - radius + 1); xx < std::min(w.width, x + radius); xx++) {
            if ((xx - x) * (xx - x) + (yy - y) * (yy - y) >= radius * radius)
                continue;
            const int k = yy * w.width + xx;
            if (material <= 0) {
                erase(w, k);
                g.erase_cell(xx, yy);
            }
        }
    const bool ok = w.paint(x, y, radius, material);
    if (ok && material < 0)
        for (int yy = std::max(0, y - radius + 1); yy < std::min(w.height, y + radius); yy++)
            for (int xx = std::max(0, x - radius + 1); xx < std::min(w.width, x + radius); xx++) {
                if ((xx - x) * (xx - x) + (yy - y) * (yy - y) >= radius * radius)
                    continue;
                const int k = yy * w.width + xx, b = -material;
                if (b == B_ICE || b == B_SNOW || b == B_PERMAFROST)
                    w.temp[k] = -10;
                if (b == B_FNITRO)
                    w.temp[k] = 5;
                if (b == B_WETSPONGE || b == B_WETDIRT) {
                    auto &p = pores[k];
                    p.type = WATER;
                    p.amount = b == B_WETDIRT ? 96 : 255;
                }
            }
    return ok;
}
bool Sandbox::use(World &w, int x, int y, int tool, int selected_liquid, const Grains *grains) {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height)
        return false;
    const int k = y * w.width + x;
    selected_liquid = std::clamp(selected_liquid, 1, NLIQ - 1);
    if (tool == 301) {
        for (auto &p : pumps)
            if (p.inlet == k || p.outlet == k) {
                p.on = !p.on;
                message = p.on ? "Pump on" : "Pump off";
                return true;
            }
        if (k == pending_inlet) {
            w.solid[k] = 0;
            pending_inlet = -1;
            message = "Pump placement cancelled";
            return true;
        }
        if (w.solid[k] || w.liq[k] || machines.count(k) || grain_occupied(w, k, grains)) {
            message = "Place machine endpoints in empty cells.";
            return false;
        }
        if (pending_inlet < 0) {
            w.solid[k] = B_PUMP_IN;
            pending_inlet = k;
            message = "Inlet placed. Click an empty cell for the outlet.";
        } else {
            w.solid[k] = B_PUMP_OUT;
            pumps.push_back({pending_inlet, k, true, {}});
            pending_inlet = -1;
            message = "Pump connected. Click either endpoint to toggle.";
        }
        w.wake(k);
        return true;
    }
    const int kind = -tool;
    if (!DEVICE_KIND(kind))
        return false;
    auto found = machines.find(k);
    if (found != machines.end()) {
        auto &d = found->second;
        if (d.kind != kind) {
            message = "Use the matching machine tool to adjust this block.";
            return false;
        }
        if (kind == B_LEVER)
            d.on = !d.on;
        else if (kind == B_GATE || kind == B_VALVE)
            d.manual = !d.manual;
        else if (kind == B_TIMER)
            d.period = cycle(d.period, {60, 120, 240, 480});
        else if (kind == B_COUNTER) {
            d.limit = cycle(d.limit, {2, 3, 4, 5, 8});
            d.count = 0;
        } else if (kind == B_THERMO)
            d.level = cycle(d.level, {0, 50, 100, 200, 500, 1000});
        else if (kind == B_DEPTH)
            d.level = cycle(d.level, {1, 2, 4, 8, 16});
        else if (kind == B_SENSOR)
            d.filter = d.filter == selected_liquid ? 0 : selected_liquid;
        else if (kind == B_SPRING || kind == B_FILTER || kind == B_MEMBRANE)
            d.liquid = selected_liquid;
        else if (kind == B_MOTOR)
            d.direction = d.direction == 2 ? 1 : 2;
        else if (kind == B_PIXEL)
            d.colour = (d.colour + 1) % 5;
        message = "Machine setting updated.";
        w.wake(k);
        return true;
    }
    if (w.solid[k] || w.liq[k] || grain_occupied(w, k, grains)) {
        message = "Machines need an empty cell. Clear it first.";
        return false;
    }
    Machine d;
    d.kind = kind;
    d.liquid = selected_liquid;
    d.manual = kind == B_VALVE;
    d.open = d.manual;
    d.level = kind == B_DEPTH ? 4 : 100;
    machines[k] = d;
    if (kind != B_LEVER)
        w.solid[k] = kind;
    held[k] = 255;
    w.wake(k);
    message = "Machine placed. Click again with its tool to adjust it.";
    return true;
}
bool Sandbox::wire(World &w, int x, int y) {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height)
        return false;
    const int k = y * w.width + x;
    if (pending_wire < 0) {
        auto f = machines.find(k);
        if (f == machines.end() || !trigger(f->second.kind)) {
            message = "Start a wire on a lever, sensor, timer, generator or logic block.";
            return false;
        }
        pending_wire = k;
        message = "Click targets to connect them; click the source again to finish.";
        return true;
    }
    if (k == pending_wire) {
        pending_wire = -1;
        message = "Wiring finished.";
        return true;
    }
    bool target = machines.count(k);
    for (const auto &p : pumps)
        target = target || k == p.inlet || k == p.outlet;
    if (!target) {
        pending_wire = -1;
        message = "Wiring finished.";
        return true;
    }
    auto &links = machines[pending_wire].targets;
    auto pos = std::find(links.begin(), links.end(), k);
    if (pos == links.end())
        links.push_back(k);
    else
        links.erase(pos);
    message = "Wire connection toggled.";
    return true;
}
bool Sandbox::set_gate(World &w, int k, Machine &d, bool open, const Grains *grains) {
    if (open == d.open)
        return true;
    if (!open && ((w.solid[k] && w.solid[k] != B_GATE) || grain_occupied(w, k, grains)))
        return false;
    if (!open && w.liq[k]) {
        const int up = neighbor(w, k, 0);
        if (up < 0 || w.solid[up] || (w.liq[up] && w.typ[up] != w.typ[k]) || w.liq[k] + w.liq[up] > 255)
            return false;
        transfer(w, k, up, w.liq[k]);
    }
    w.solid[k] = open ? 0 : B_GATE;
    d.open = open;
    w.wake(k);
    return true;
}
void Sandbox::pumps_step(World &w) {
    for (auto &p : pumps) {
        if (!p.on)
            continue;
        int room = std::min(int(CFG_PUMP_RATE), int(255 - p.buffer.amount));
        for (int dir = 0; dir < 4 && room; dir++)
            room -= take(w, neighbor(w, p.inlet, dir), p.buffer, room);
        bool open = false;
        for (int d = 0; d < 3; d++) {
            int n = neighbor(w, p.outlet, d);
            if (n >= 0 && !w.solid[n])
                open = true;
        }
        for (int d = 0; d < 4 && p.buffer.amount >= 1; d++) {
            if (d == 3 && open)
                break;
            int n = neighbor(w, p.outlet, d);
            if (n < 0 || w.solid[n])
                continue;
            // Preserve the original pump's water/oil churning while retaining ingredients.
            if (w.liq[n] && w.typ[n] != p.buffer.type &&
                ((w.typ[n] == WATER || w.typ[n] == OIL || w.typ[n] == FOAM) &&
                 (p.buffer.type == WATER || p.buffer.type == OIL))) {
                double energy = capacity(w, n) * w.temp[n];
                w.typ[n] = FOAM;
                w.latent[n] += energy - capacity(w, n) * w.temp[n];
                energy = buf_cap(p.buffer, p.buffer.amount) * p.buffer.temperature;
                p.buffer.type = FOAM;
                p.buffer.latent += energy - buf_cap(p.buffer, p.buffer.amount) * p.buffer.temperature;
            }
            put(w, p.buffer, n, 255);
        }
    }
}
void Sandbox::pipes_step(World &w) {
    std::vector<unsigned char> seen(w.liq.size(), 0);
    auto degree = [&](int k) {
        int count = 0;
        for (int d = 0; d < 4; d++) {
            int n = neighbor(w, k, d);
            if (n >= 0 && is_pipe(w.solid[n]))
                count++;
        }
        return count;
    };
    auto level = [&](int k) {
        if (!w.liq[k])
            return k / w.width * 256 + 255;
        int top = k;
        while (top >= w.width && w.liq[top - w.width] && w.typ[top - w.width] == w.typ[k])
            top -= w.width;
        return top / w.width * 256 + 255 - w.liq[top];
    };
    auto passes = [&](int k, int type, int from) {
        if (w.solid[k] == B_PIPE)
            return true;
        auto f = machines.find(k);
        return f != machines.end() &&
               (w.solid[k] == B_VALVE    ? f->second.open
                : f->second.liquid == 39 ? type == WATER && w.sol[from * NSOL + SOL_SALT] > 0
                                         : f->second.liquid == type);
    };
    for (int start = 0; start < w.width * w.height; start++) {
        if (seen[start] || !is_pipe(w.solid[start]))
            continue;
        std::vector<int> queue{start};
        seen[start] = 1;
        std::map<int, int> mouths;
        for (std::size_t h = 0; h < queue.size(); h++) {
            int k = queue[h];
            bool end = degree(k) <= 1;
            for (int d = 0; d < 4; d++) {
                int n = neighbor(w, k, d);
                if (n < 0)
                    continue;
                if (is_pipe(w.solid[n])) {
                    if (!seen[n]) {
                        seen[n] = 1;
                        queue.push_back(n);
                    }
                } else if (end && !w.solid[n])
                    mouths.emplace(n, k);
            }
        }
        if (mouths.size() < 2)
            continue;
        std::vector<std::pair<int, int>> sources;
        for (auto m : mouths)
            if (w.liq[m.first] >= 8)
                sources.push_back(m);
        std::stable_sort(sources.begin(), sources.end(),
                         [&](auto a, auto b) { return level(a.first) < level(b.first); });
        if (sources.size() > CFG_MAX_SOURCES)
            sources.resize(int(CFG_MAX_SOURCES));
        for (auto src : sources) {
            int from = src.first, type = w.typ[from], entry = src.second;
            if (!w.liq[from] || !passes(entry, type, from))
                continue;
            std::map<int, int> parent;
            parent[entry] = -1;
            std::vector<int> walk{entry};
            int best = -1, best_pipe = -1, best_level = level(from) + int(CFG_MIN_DROP);
            for (std::size_t h = 0; h < walk.size(); h++) {
                int k = walk[h];
                bool end = degree(k) <= 1;
                for (int d = 0; d < 4; d++) {
                    int n = neighbor(w, k, d);
                    if (n < 0 || n == from)
                        continue;
                    if (is_pipe(w.solid[n])) {
                        if (!parent.count(n) && passes(n, type, from)) {
                            parent[n] = k;
                            walk.push_back(n);
                        }
                    } else if (end && !w.solid[n]) {
                        int fill = n;
                        while (w.liq[fill] == 255 && w.typ[fill] == type) {
                            int up = neighbor(w, fill, 0);
                            if (up < 0 || w.solid[up]) {
                                fill = -1;
                                break;
                            }
                            fill = up;
                        }
                        if (fill < 0 || (w.liq[fill] && w.typ[fill] != type))
                            continue;
                        int lv = level(fill);
                        if (lv > best_level) {
                            best_level = lv;
                            best = fill;
                            best_pipe = k;
                        }
                    }
                }
            }
            // Stop at equal pressure; a later source in the same network must not pump
            // the entire parcel straight back after an oversized transfer.
            if (best >= 0 &&
                transfer(w, from, best, std::min(int(CFG_PIPE_RATE), (level(best) - level(from)) / 2)))
                for (int k = best_pipe; k >= 0; k = parent[k]) {
                    pipe_show[k] = type;
                    pipe_time[k] = w.tick;
                }
        }
    }
}
void Sandbox::step(World &w, Grains &g) {
    devices_step(w, g);
    pumps_step(w);
    if (w.tick & 1)
        pipes_step(w);
    if (!(w.tick & 1))
        thermal_step(w);
    if (w.tick % 4 == 2) {
        material_step(w, g);
        grain_effects(w, g);
    }
    if (w.tick % 4 == 3)
        reactions_step(w);
}
} // namespace ecologist
