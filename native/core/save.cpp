#include "save.hpp"
#include "equipment.hpp"
#include <cmath>
#include <cstring>
#include <fstream>
#include <type_traits>

namespace ecologist {
namespace {
constexpr char MAGIC[8] = {'E', 'C', 'O', 'S', 'A', 'V', 'E', '1'};
constexpr std::uint64_t MAX_ITEMS = 64ull * 1024 * 1024;

// One function per type serves both directions: Out writes each value, In reads it back in place.
struct Out {
    std::ofstream &f;
    template <class T> std::enable_if_t<std::is_arithmetic_v<T>> raw(T &v) { f.write(reinterpret_cast<const char *>(&v), sizeof v); }
    bool ok() const { return bool(f); }
    std::uint32_t version = SAVE_VERSION;
    static constexpr bool reading = false;
};
struct In {
    std::ifstream &f;
    template <class T> std::enable_if_t<std::is_arithmetic_v<T>> raw(T &v) { f.read(reinterpret_cast<char *>(&v), sizeof v); }
    bool ok() const { return bool(f); }
    std::uint32_t version = SAVE_VERSION;
    static constexpr bool reading = true;
};

template <class S, class T> std::enable_if_t<std::is_arithmetic_v<T>> io(S &s, T &v) { s.raw(v); }
template <class S> void io(S &s, std::string &v);
template <class S, class T> void io(S &s, std::vector<T> &v);
template <class S, class T, std::size_t N> void io(S &s, std::array<T, N> &v) {
    for (auto &x : v)
        io(s, x);
}
template <class S, class K, class V> void io(S &s, std::map<K, V> &m);
template <class S> bool size(S &s, std::size_t &n, std::size_t now) {
    std::uint64_t count = now;
    s.raw(count);
    if (count > MAX_ITEMS) {
        s.f.setstate(std::ios::failbit);
        return false;
    }
    n = std::size_t(count);
    return s.ok();
}
template <class S> void io(S &s, std::string &v) {
    std::size_t n = 0;
    if (!size(s, n, v.size()))
        return;
    if constexpr (S::reading)
        v.resize(n);
    for (auto &c : v)
        s.raw(c);
}
template <class S, class T> void io(S &s, std::vector<T> &v) {
    std::size_t n = 0;
    if (!size(s, n, v.size()))
        return;
    if constexpr (S::reading)
        v.assign(n, T{});
    if constexpr (std::is_arithmetic_v<T> && !std::is_same_v<T, bool>) {
        if constexpr (S::reading)
            s.f.read(reinterpret_cast<char *>(v.data()), std::streamsize(n * sizeof(T)));
        else
            s.f.write(reinterpret_cast<const char *>(v.data()), std::streamsize(n * sizeof(T)));
    } else
        for (auto &x : v)
            io(s, x);
}
template <class S, class K, class V> void io(S &s, std::map<K, V> &m) {
    std::size_t n = 0;
    if (!size(s, n, m.size()))
        return;
    if constexpr (S::reading) {
        m.clear();
        for (std::size_t i = 0; i < n && s.ok(); i++) {
            K key{};
            io(s, key);
            io(s, m[key]);
        }
    } else
        for (auto &[key, value] : m) {
            K k = key;
            io(s, k);
            io(s, value);
        }
}
template <class S> void io(S &s, FluidBuffer &b) {
    io(s, b.type), io(s, b.amount), io(s, b.temperature), io(s, b.latent), io(s, b.sol);
}
template <class S> void io(S &s, Machine &m) {
    io(s, m.kind), io(s, m.liquid), io(s, m.filter), io(s, m.period), io(s, m.limit), io(s, m.count);
    io(s, m.direction), io(s, m.level), io(s, m.colour), io(s, m.erupting), io(s, m.rest);
    io(s, m.on), io(s, m.active), io(s, m.open), io(s, m.manual), io(s, m.was_high), io(s, m.charging);
    io(s, m.charge), io(s, m.salt), io(s, m.salt_heat), io(s, m.targets);
}
template <class S> void io(S &s, Pump &p) { io(s, p.inlet), io(s, p.outlet), io(s, p.on), io(s, p.buffer); }
template <class S> void io(S &s, Grain &g) { io(s, g.x), io(s, g.y), io(s, g.kind), io(s, g.amount), io(s, g.temperature); }
template <class S> void io(S &s, World &w) {
    io(s, w.width), io(s, w.height), io(s, w.chunk_width), io(s, w.tick), io(s, w.rng);
    io(s, w.solid), io(s, w.liq), io(s, w.typ), io(s, w.drop), io(s, w.awake), io(s, w.under);
    io(s, w.stamp), io(s, w.flux), io(s, w.temp), io(s, w.vel), io(s, w.latent), io(s, w.sol);
}
template <class S> void io(S &s, Grains &g) {
    io(s, g.width), io(s, g.height), io(s, g.particles), io(s, g.occupied), io(s, g.image);
}
template <class S> void io(S &s, Sandbox &b) {
    io(s, b.machines), io(s, b.pumps), io(s, b.pores), io(s, b.meltwater), io(s, b.held);
    io(s, b.power), io(s, b.pipe_show), io(s, b.pipe_time), io(s, b.pending_inlet), io(s, b.pending_wire);
    io(s, b.source_units), io(s, b.drain_units), io(s, b.source_heat), io(s, b.drain_heat), io(s, b.drained_solutes);
    io(s, b.sunlight), io(s, b.wind), io(s, b.air_ox), io(s, b.air_carb), io(s, b.fire), io(s, b.air_busy);
    io(s, b.level_until), io(s, b.seen), io(s, b.moved), io(s, b.level_row), io(s, b.queue), io(s, b.search_pass);
    io(s, b.pressure_on), io(s, b.momentum_on), io(s, b.pressure_was_on), io(s, b.shake), io(s, b.explosions);
    io(s, b.budget), io(s, b.back);
    if (s.version >= 2)
        io(s, b.equipment);
}
template <class S> void io(S &s, Vessel &v) {
    io(s, v.water), io(s, v.dissolved), io(s, v.sugar_crystal), io(s, v.salt_crystal), io(s, v.bittern_crystal);
    io(s, v.burnt), io(s, v.energy), io(s, v.temperature), io(s, v.peak), io(s, v.salt_heat), io(s, v.salt_formed);
    io(s, v.vapour), io(s, v.smoke), io(s, v.set);
}
template <class S> void io(S &s, Equipment &e) { io(s, e.kind), io(s, e.x), io(s, e.y), io(s, e.setting), io(s, e.vessel); }
template <class S> void io(S &s, Player &p) {
    io(s, p.x), io(s, p.y), io(s, p.vx), io(s, p.vy), io(s, p.spawn_x), io(s, p.spawn_y), io(s, p.health);
    io(s, p.breath), io(s, p.facing), io(s, p.deaths), io(s, p.active), io(s, p.on_ground), io(s, p.climbing), io(s, p.swimming);
}
bool fail(std::string *error, const char *why) {
    if (error)
        *error = why;
    return false;
}
} // namespace

bool save_world(const std::string &path, const World &w, const Grains &g, const Sandbox &s, const Player &p, std::string *error) {
    std::ofstream f(path, std::ios::binary | std::ios::trunc);
    if (!f)
        return fail(error, "could not open the save file for writing");
    Out out{f};
    f.write(MAGIC, sizeof MAGIC);
    std::uint32_t version = SAVE_VERSION;
    io(out, version);
    // The io functions take references so one definition serves both directions; nothing is changed here.
    io(out, const_cast<World &>(w));
    io(out, const_cast<Grains &>(g));
    io(out, const_cast<Sandbox &>(s));
    io(out, const_cast<Player &>(p));
    f.flush();
    return out.ok() ? true : fail(error, "writing the save file failed");
}

bool load_world(const std::string &path, World &w, Grains &g, Sandbox &s, Player &p, std::string *error) {
    std::ifstream f(path, std::ios::binary);
    if (!f)
        return fail(error, "could not open the save file");
    char magic[sizeof MAGIC]{};
    f.read(magic, sizeof magic);
    if (!f || std::memcmp(magic, MAGIC, sizeof MAGIC) != 0)
        return fail(error, "not an Ecologist world save");
    In in{f};
    std::uint32_t version = 0;
    io(in, version);
    if (!in.ok() || version < 1 || version > SAVE_VERSION)
        return fail(error, "this save was made by a different version of the game");
    in.version = version; // version 1 saves have no equipment
    // Read into fresh copies so a damaged file leaves the running world untouched.
    World nw;
    Grains ng;
    Sandbox ns;
    Player np;
    io(in, nw), io(in, ng), io(in, ns), io(in, np);
    if (!in.ok())
        return fail(error, "the save file is damaged or cut short");
    const std::size_t n = std::size_t(nw.width) * std::size_t(nw.height);
    const bool shaped = nw.width > 0 && nw.height > 0 && n <= std::size_t(MAX_CELLS) && nw.solid.size() == n &&
                        nw.liq.size() == n && nw.typ.size() == n && nw.temp.size() == n && nw.sol.size() == n * NSOL &&
                        ns.back.size() == n && ns.air_ox.size() == n && ns.fire.size() == n;
    if (!shaped)
        return fail(error, "the save file does not describe a valid world");
    for (const auto &[id, e] : ns.equipment) {
        const auto &spec = equipment_spec(e.kind);
        bool placed = e.kind > 0 && e.kind < EQ_KINDS && e.x >= 0 && e.y >= 0 && e.x + spec.width <= nw.width &&
                      e.y + spec.height <= nw.height && id == e.y * nw.width + e.x && e.setting >= 0 && e.setting <= 3 &&
                      std::isfinite(e.vessel.energy) && std::isfinite(e.vessel.temperature);
        for (int cy = e.y; placed && cy < e.y + spec.height; cy++)
            for (int cx = e.x; cx < e.x + spec.width; cx++)
                placed = placed && nw.solid[std::size_t(cy) * nw.width + cx] == B_EQUIPMENT;
        if (!placed)
            return fail(error, "the save file describes equipment that does not fit the world");
    }
    w = std::move(nw);
    g = std::move(ng);
    s = std::move(ns);
    p = std::move(np);
    return true;
}
} // namespace ecologist
