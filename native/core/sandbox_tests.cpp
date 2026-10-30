#include "equipment.hpp"
#include "save.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iostream>
using namespace ecologist;
int checks = 0, failures = 0;
void check(bool ok, const char *label) {
    ++checks;
    if (!ok) {
        ++failures;
        std::cerr << "FAIL: " << label << '\n';
    }
}
bool near(double a, double b, double tolerance = 1e-5) { return std::abs(a - b) < tolerance; }
struct Fixture {
    World w;
    Grains g;
    Sandbox s;
    Fixture() {
        w.reset(32, 32, 7);
        g.reset(w);
        s.reset(w);
    }
    int cell(int x, int y) { return y * w.width + x; }
    void fill(int k, int type, int amount = 255, double temperature = 20) {
        w.solid[k] = 0;
        w.typ[k] = type;
        w.liq[k] = amount;
        w.temp[k] = float(temperature);
    }
    void machine(int k, int type, int liquid = 1) { s.use(w, k % 32, k / 32, -type, liquid); }
    double component(int channel) {
        double n = 0;
        for (int k = 0; k < 1024; k++)
            n += w.sol[k * NSOL + channel] * w.liq[k] / 255;
        for (auto &p : s.pumps)
            n += p.buffer.sol[channel] * p.buffer.amount / 255;
        for (auto &p : s.pores)
            n += p.second.sol[channel] * p.second.amount / 255;
        return n;
    }
    double heat() {
        double e = 0;
        for (int k = 0; k < 1024; k++)
            if (w.liq[k] || w.solid[k])
                e += s.capacity(w, k) * w.temp[k] + w.latent[k];
        for (auto &p : s.pumps) {
            auto &b = p.buffer;
            e += (FLUIDS[b.type].capacity +
                  (SALT_CAP * b.sol[SOL_SALT] + SUGAR_CAP * b.sol[SOL_SUGAR]) / 255) *
                     b.amount / 255 * b.temperature +
                 b.latent;
        }
        for (auto &p : s.pores)
            e += p.second.latent;
        return e;
    }
    double volume() { return w.volume() + s.buffered_volume(); }
};
int main() {
    {
        Fixture f;
        int k = f.cell(10, 10);
        for (int b = 1; b < 80; b++) {
            if (DEVICE_KIND(b) || b == B_PUMP_IN || b == B_PUMP_OUT)
                continue;
            check(f.s.paint(f.w, f.g, 10, 10, 1, -b) && f.w.solid[k] == b,
                  "original terrain block can be placed");
        }
        check(!f.s.paint(f.w, f.g, 10, 10, 1, -80), "undefined block rejected");
    }
    {
        Fixture f;
        int a = f.cell(10, 10), b = f.cell(20, 10);
        f.s.use(f.w, 10, 10, 301, 1);
        f.s.use(f.w, 20, 10, 301, 1);
        f.fill(a - 32, WATER, 255, 73);
        f.w.sol[(a - 32) * NSOL + SOL_SUGAR] = 410;
        f.w.latent[a - 32] = 17;
        for (int d = 0; d < 4; d++)
            f.w.solid[f.s.neighbor(f.w, b, d)] = B_STONE;
        double v = f.volume(), q = f.component(SOL_SUGAR), e = f.heat();
        for (int i = 0; i < 20; i++)
            f.s.pumps_step(f.w);
        check(near(f.volume(), v) && near(f.component(SOL_SUGAR), q) && near(f.heat(), e),
              "blocked pump retains carrier, sugar and heat");
        check(f.s.pumps[0].buffer.amount == 255, "blocked pump keeps full buffer");
        f.w.solid[b - 32] = 0;
        e = f.heat();
        f.s.pumps_step(f.w);
        check(f.w.liq[b - 32] == 255 && f.s.pumps[0].buffer.amount == 0,
              "unblocked pump empties retained buffer");
        check(near(f.heat(), e) && near(f.component(SOL_SUGAR), q),
              "pump output preserves heat and ingredient");
    }
    {
        Fixture f;
        int a = f.cell(10, 10), b = f.cell(20, 10);
        f.s.use(f.w, 10, 10, 301, 1);
        f.s.use(f.w, 20, 10, 301, 1);
        f.fill(a - 32, WATER, 80, 70);
        f.fill(b - 32, OIL, 80, 35);
        double e = f.heat(), v = f.volume();
        f.s.pumps_step(f.w);
        check(f.w.typ[b - 32] == FOAM && near(f.volume(), v) && near(f.heat(), e),
              "water/oil pump churn retains volume and enthalpy");
    }
    {
        Fixture f;
        std::fill(f.w.solid.begin(), f.w.solid.end(), B_STONE);
        int a = f.cell(10, 10), b = a + 4;
        for (int n = a; n <= b; n++)
            f.w.solid[n] = B_PIPE;
        f.w.solid[a + 2] = 0;
        f.machine(a + 2, B_VALVE);
        f.s.machines[a + 2].open = false;
        f.fill(a - 1, WATER);
        f.w.sol[(a - 1) * NSOL + SOL_SUGAR] = 100;
        f.w.solid[b + 1] = 0;
        double v = f.volume(), q = f.component(SOL_SUGAR);
        f.s.pipes_step(f.w);
        check(f.w.liq[b + 1] == 0, "closed valve stops connected pipe");
        f.s.machines[a + 2].open = true;
        f.s.pipes_step(f.w);
        check(f.w.liq[b + 1] > 0 && near(f.volume(), v) && near(f.component(SOL_SUGAR), q),
              "open valve carries actual liquid and sugar");
        f.s.machines[a + 2].kind = B_FILTER;
        f.w.solid[a + 2] = B_FILTER;
        f.s.machines[a + 2].liquid = OIL;
        int before = f.w.liq[b + 1];
        f.s.pipes_step(f.w);
        check(f.w.liq[b + 1] == before, "wrong filter rejects water");
        f.s.machines[a + 2].liquid = 39;
        f.w.sol[(a - 1) * NSOL + SOL_SALT] = 12;
        f.s.pipes_step(f.w);
        check(f.w.liq[b + 1] > before, "brine filter matches salted water");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_GATE);
        auto &d = f.s.machines[k];
        f.s.set_gate(f.w, k, d, true);
        f.fill(k, WATER, 180);
        f.w.solid[k - 32] = B_STONE;
        check(!f.s.set_gate(f.w, k, d, false) && f.w.liq[k] == 180 && d.open,
              "gate refuses to delete trapped water");
        f.w.solid[k - 32] = 0;
        check(f.s.set_gate(f.w, k, d, false) && f.w.liq[k - 32] == 180 && f.w.solid[k] == B_GATE,
              "gate displaces water before closing");
    }
    {
        Fixture f;
        int a = f.cell(8, 10), b = f.cell(10, 10), c = f.cell(12, 10);
        f.machine(a, B_LEVER);
        f.machine(b, B_NOT);
        f.machine(c, B_LAMP);
        f.s.wire(f.w, 8, 10);
        f.s.wire(f.w, 10, 10);
        f.s.wire(f.w, 8, 10);
        f.s.wire(f.w, 10, 10);
        f.s.wire(f.w, 12, 10);
        f.s.wire(f.w, 10, 10);
        f.s.devices_step(f.w, f.g);
        f.s.devices_step(f.w, f.g);
        check(f.s.machines[c].active, "NOT drives lamp from off lever");
        f.s.use(f.w, 8, 10, -B_LEVER, 1);
        f.s.devices_step(f.w, f.g);
        check(f.s.machines[c].active, "logic retains one tick propagation delay");
        f.s.devices_step(f.w, f.g);
        check(!f.s.machines[c].active, "wired lever changes logic output");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_BOILER);
        f.w.solid[k - 1] = B_METAL;
        f.fill(k + 1, WATER);
        f.s.devices_step(f.w, f.g);
        check(f.s.machines[k].active && f.w.temp[k + 1] > 20,
              "plain metal container does not disable boiler");
        f.machine(k - 2, B_LEVER);
        f.s.devices_step(f.w, f.g);
        check(!f.s.machines[k].active, "off lever through metal controls boiler");
        f.s.machines[k - 2].on = true;
        f.s.devices_step(f.w, f.g);
        check(f.s.machines[k].active, "powered conductor starts boiler");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_SPRING, 39);
        f.s.devices_step(f.w, f.g);
        check(f.w.volume() == 40 && f.s.source_units == 40, "spring records external carrier source");
        check(f.w.typ[k + 32] == WATER && f.w.sol[(k + 32) * NSOL + SOL_SALT] > 0,
              "brine spring emits canonical salted water");
        f.s.erase(f.w, k);
        f.w.solid[k] = 0;
        f.machine(k, B_DRAIN);
        f.s.devices_step(f.w, f.g);
        check(f.w.volume() == 0 && f.s.drain_units == 40 && f.s.drained_solutes[SOL_SALT] > 0,
              "drain records removed water and ingredients");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_SEPARATOR);
        f.fill(k + 32, WATER, 128, 35);
        f.w.sol[(k + 32) * NSOL + SOL_SALT] = 70;
        f.w.sol[(k + 32) * NSOL + SOL_SUGAR] = 150;
        double salt = f.component(SOL_SALT), sugar = f.component(SOL_SUGAR), v = f.volume();
        f.w.tick = 8;
        f.s.devices_step(f.w, f.g);
        check(f.g.mass(SALT_GRAIN) > 0, "separator deposits physical salt grains");
        check(near(f.component(SOL_SALT) + f.g.mass(SALT_GRAIN) + f.s.machines[k].salt, salt) &&
                  near(f.component(SOL_SUGAR), sugar) && near(f.volume(), v),
              "separator preserves fractional salt, sugar and carrier");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.s.paint(f.w, f.g, 10, 10, 1, -B_SPONGE);
        f.fill(k + 1, WATER, 200, 37);
        f.w.sol[(k + 1) * NSOL + SOL_SUGAR] = 123;
        double v = f.volume(), q = f.component(SOL_SUGAR), e = f.heat();
        f.s.material_step(f.w, f.g);
        check(f.s.pores[k].amount == 32 && f.w.solid[k] == B_WETSPONGE,
              "sponge absorbs into separate reservoir");
        check(near(f.volume(), v) && near(f.component(SOL_SUGAR), q) && near(f.heat(), e, 1e-4),
              "sponge absorption preserves carrier, ingredient and heat");
        f.w.temp[k] = 75;
        f.s.material_step(f.w, f.g);
        check(f.s.pores[k].amount == 0 && near(f.volume(), v) && near(f.component(SOL_SUGAR), q),
              "heated sponge releases stored solution");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.s.paint(f.w, f.g, 10, 10, 1, -B_WETSPONGE);
        f.s.pores[k].sol[SOL_SUGAR] = 44;
        f.w.solid[k] = 0;
        f.s.material_step(f.w, f.g);
        check(f.s.pores.empty() && f.w.liq[k] == 255 && near(f.component(SOL_SUGAR), 44),
              "destroyed sponge releases recoverable contents");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.fill(k, WATER, 79, -20);
        f.w.sol[k * NSOL + SOL_SALT] = 12;
        f.s.freeze(f.w, k, B_ICE);
        check(f.s.held[k] == 79 && f.w.solid[k] == B_ICE, "freezing stores partial carrier");
        f.s.melt(f.w, k, WATER);
        check(f.w.liq[k] == 79 && f.w.sol[k * NSOL + SOL_SALT] == 12, "thaw restores partial salted water");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.s.paint(f.w, f.g, 10, 10, 1, -B_METAL);
        f.s.paint(f.w, f.g, 11, 10, 1, -B_METAL);
        f.w.temp[k] = 300;
        double e = 0;
        for (int n = 0; n < 1024; n++)
            e += f.s.capacity(f.w, n) * f.w.temp[n] + f.w.latent[n];
        f.s.thermal_step(f.w);
        double after = 0;
        for (int n = 0; n < 1024; n++)
            after += f.s.capacity(f.w, n) * f.w.temp[n] + f.w.latent[n];
        check(f.w.temp[k + 1] > 20 && near(e, after, 1e-3),
              "thermal conduction preserves total sensible heat");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.s.paint(f.w, f.g, 10, 10, 1, -B_POROUS);
        f.fill(k - 32, WATER);
        f.s.material_step(f.w, f.g);
        check(f.w.liq[k + 32] == 8 && f.w.liq[k - 32] == 247, "porous rock transmits limited downward flow");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.s.paint(f.w, f.g, 10, 10, 1, -B_MAGNET);
        f.fill(k + 4, L_FERRO);
        f.s.material_step(f.w, f.g);
        check(f.w.liq[k + 3] == 24 && f.w.liq[k + 4] == 231, "magnet pulls finite ferrofluid toward it");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.fill(k, L_ACID);
        f.fill(k + 1, L_LYE);
        f.s.reactions_step(f.w);
        check(f.w.typ[k] == WATER && f.w.typ[k + 1] == WATER && f.w.sol[k * NSOL + SOL_SALT] > 0,
              "acid/base contact forms warm salt solution");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.fill(k, L_LYE);
        f.fill(k + 1, OIL);
        f.s.reactions_step(f.w);
        check(f.w.typ[k + 1] == FOAM && f.w.sol[(k + 1) * NSOL + 13] > 0, "lye/oil contact forms soap foam");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.fill(k, L_ACID);
        f.w.solid[k + 1] = B_LIMESTONE;
        for (int i = 0; i < 500 && f.w.solid[k + 1]; i++)
            f.s.reactions_step(f.w);
        check(!f.w.solid[k + 1], "exported acid/limestone rule executes");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.g.add(f.w, 80, 80, 4, GRAIN_AMOUNT, 20);
        f.s.grain_effects(f.w, f.g);
        check(f.g.particles.empty() && near(f.volume(), GRAIN_AMOUNT) && f.w.liq[k] == 3,
              "snow melts completely with fractional liquid retained");
        f.g.add(f.w, 81, 80, 4, GRAIN_AMOUNT, 20);
        f.s.grain_effects(f.w, f.g);
        check(f.w.liq[k] == 7 && near(f.volume(), 2 * GRAIN_AMOUNT),
              "fractional snow melt combines across grains");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.fill(k, WATER);
        f.g.add(f.w, 80, 80, 7);
        f.s.grain_effects(f.w, f.g);
        check(f.g.particles[0].kind == 11 && f.w.temp[k] > 20, "fine quicklime hydrates and warms water");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.g.add(f.w, 80, 80, SUGAR_GRAIN, GRAIN_AMOUNT, 200);
        f.w.temp[k] = 200;
        f.s.grain_effects(f.w, f.g);
        check(f.g.particles[0].kind == 8 && near(f.g.mass(8), GRAIN_AMOUNT),
              "fine sugar caramelizes without losing quantity");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_GATE);
        auto &gate = f.s.machines[k];
        f.s.set_gate(f.w, k, gate, true);
        f.fill(k, WATER, 89);
        f.s.freeze(f.w, k, B_ICE);
        check(!f.s.set_gate(f.w, k, gate, false) && f.w.solid[k] == B_ICE && f.s.held[k] == 89,
              "gate cannot crush frozen carrier");
        f.s.melt(f.w, k, WATER);
        f.s.set_gate(f.w, k, gate, false);
        check(f.w.liq[k - 32] == 89, "gate closes after thaw by displacing water");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_GATE);
        auto &gate = f.s.machines[k];
        f.s.set_gate(f.w, k, gate, true);
        f.g.add(f.w, 80, 80, SAND);
        check(!f.s.set_gate(f.w, k, gate, false, &f.g), "gate cannot crush fine grains");
        check(!f.s.use(f.w, 10, 10, 301, 1, &f.g), "pump placement refuses fine grains");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_SEPARATOR);
        f.fill(k + 32, FOAM, 200, 50);
        f.w.sol[(k + 32) * NSOL + SOL_SUGAR] = 78;
        double e = f.heat(), v = f.volume(), s = f.component(SOL_SUGAR);
        f.w.tick = 8;
        f.s.devices_step(f.w, f.g);
        check((f.w.typ[k + 32] == WATER || f.w.typ[k + 32] == OIL) && near(f.volume(), v) &&
                  near(f.heat(), e) && near(f.component(SOL_SUGAR), s),
              "separator splits foam without losing carrier, sugar or heat");
    }
    {
        Fixture f;
        int k = f.cell(10, 18);
        f.machine(k, B_GEYSER);
        for (int x = -2; x < 2; x++) {
            f.fill(k + 64 + x, WATER, 255, 90);
            f.w.sol[(k + 64 + x) * NSOL + SOL_SUGAR] = 44;
        }
        double e = f.heat(), v = f.volume(), s = f.component(SOL_SUGAR);
        f.s.devices_step(f.w, f.g);
        check(f.s.machines[k].erupting == CFG_GEYSER_BURST, "geyser starts from a heated water pocket");
        f.s.devices_step(f.w, f.g);
        bool spouted = false;
        for (int n = 0; n < k; n++)
            spouted = spouted || f.w.liq[n] > 0;
        check(spouted && near(f.volume(), v) && near(f.component(SOL_SUGAR), s) && near(f.heat(), e),
              "geyser transfers pocket water with ingredients and heat");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_SPRING, 39);
        double e = f.heat();
        f.s.devices_step(f.w, f.g);
        check(near(f.heat() - e, f.s.source_heat), "brine source heat budget matches canonical solution");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_VENT);
        double e = f.heat();
        f.w.tick = 40;
        f.s.devices_step(f.w, f.g);
        check((f.w.typ[k - 32] == L_POISON || f.w.typ[k - 32] == L_SMOKE) && f.w.liq[k - 32] == 48 &&
                  near(f.heat() - e, f.s.source_heat),
              "vent uses original gases and records emitted heat");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.g.add(f.w, 80, 80, SAND, GRAIN_AMOUNT, 1100);
        f.g.add(f.w, 81, 80, 6, GRAIN_AMOUNT, 1100);
        f.w.temp[k] = 1100;
        f.s.grain_effects(f.w, f.g);
        check(f.g.mass(9) > 0 && f.g.mass(6) == 0, "sand uses adjacent fine ash as glass flux");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.fill(k, L_ACID);
        f.g.add(f.w, 80, 80, 6);
        for (int i = 0; i < 500 && !f.g.particles.empty(); i++)
            f.s.grain_effects(f.w, f.g);
        check(f.g.particles.empty() && f.w.typ[k - 32] == L_CO2,
              "fine ash reacts with acid and produces gas");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.fill(k, WATER);
        f.fill(k + 1, WATER);
        f.w.sol[k * NSOL + 3] = 100;
        double dye = f.component(3);
        f.w.tick = 4;
        chemistry_step(f.w, f.g);
        check(f.w.sol[(k + 1) * NSOL + 3] > 0 && near(f.component(3), dye),
              "ink diffuses without deleting pigment");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_LEVER);
        f.s.machines[k].on = true;
        f.w.solid[k + 1] = B_COPPER;
        f.fill(k + 2, WATER);
        f.w.sol[(k + 2) * NSOL + SOL_SUGAR] = 20;
        double q = f.component(SOL_SUGAR), v = f.volume();
        for (int i = 0; i < 100; i++)
            f.s.devices_step(f.w, f.g);
        check(f.w.liq[k + 2] < 255 && f.w.liq[k + 2] >= 1, "powered electrode splits water into gas");
        check(near(f.volume(), v) && near(f.component(SOL_SUGAR), q),
              "electrolysis retains carrier-equivalent units and dissolved sugar");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_LEVER);
        f.s.machines[k].on = true;
        f.w.solid[k + 1] = B_COPPER;
        f.fill(k + 2, WATER);
        f.w.solid[k + 2 - 32] = B_STONE;
        for (int i = 0; i < 100; i++)
            f.s.devices_step(f.w, f.g);
        check(f.w.liq[k + 2] == 255, "blocked electrolysis reserves product space before consumption");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.machine(k, B_LEVER);
        f.s.machines[k].on = true;
        f.w.solid[k + 1] = B_COPPER;
        f.fill(k + 2, WATER);
        f.w.sol[(k + 2) * NSOL + 12] = 22;
        const double reference = 9.1 / (15.0 / 255), oxygen = reference * f.volume() / 255 - f.component(12);
        for (int i = 0; i < 100; i++)
            f.s.devices_step(f.w, f.g);
        check(near(reference * f.volume() / 255 - f.component(12), oxygen),
              "electrolysis does not add reference dissolved oxygen in gas");
    }
    {
        Fixture f;
        int k = f.cell(10, 10);
        f.s.paint(f.w, f.g, 10, 10, 1, -B_WETSPONGE);
        f.s.pores[k].temperature = 0;
        f.w.solid[k] = 0;
        f.w.temp[k] = 100;
        f.w.temp[k + 1] = 150;
        f.s.thermal_step(f.w);
        check(f.s.pores[k].temperature == 0, "orphan pore water is not heated for free by air conduction");
    }

    // Combustion, explosions, gases, pressure, momentum and erosion (native/core/combustion.cpp, flow_systems.cpp).
    auto run = [](Fixture &f, int ticks) {
        for (int i = 0; i < ticks; i++) {
            f.w.step();
            f.s.step(f.w, f.g);
        }
    };
    auto stone_box = [](Fixture &f, int x0, int y0, int x1, int y1) {
        for (int y = y0; y <= y1; y++)
            for (int x = x0; x <= x1; x++)
                if (x == x0 || x == x1 || y == y0 || y == y1)
                    f.w.solid[f.cell(x, y)] = B_STONE;
    };
    {
        Fixture f;
        for (int x = 0; x < 32; x++)
            f.w.solid[f.cell(x, 20)] = B_STONE;
        const int k = f.cell(10, 19);
        f.w.solid[k] = B_WOOD;
        f.w.temp[k] = 300;
        run(f, 4);
        check(f.s.fire[k] > 0, "hot wood in open air catches fire");
        double sky = 0;
        run(f, 600);
        check(f.w.solid[k] != B_WOOD && f.s.fire[k] == 0, "burning wood is used up and leaves air or ash");
        for (int x = 0; x < 32; x++)
            sky += f.s.air_ox[f.cell(x, 0)];
        check(near(sky, 32 * AIR_OX), "the open sky's air is topped up to 21% oxygen");
    }
    {
        Fixture f;
        stone_box(f, 8, 8, 14, 14);
        const int k = f.cell(11, 13);
        f.w.solid[k] = B_WOOD;
        f.w.temp[k] = 300;
        auto air_total = [&] {
            double o = 0;
            for (int y = 9; y < 14; y++)
                for (int x = 9; x < 14; x++)
                    o += f.s.air_ox[f.cell(x, y)] + f.s.air_carb[f.cell(x, y)] / CARB_PER_OX;
            return o;
        };
        const double before = air_total();
        run(f, 1500);
        double oxygen = 0;
        int cells = 0;
        for (int y = 9; y < 14; y++)
            for (int x = 9; x < 14; x++)
                if (f.s.air(f.w, f.cell(x, y))) {
                    oxygen += f.s.air_ox[f.cell(x, y)];
                    cells++;
                }
        check(f.w.solid[k] == B_WOOD && f.s.fire[k] == 0, "a fire in a sealed room goes out with fuel left");
        check(oxygen / cells < FIRE_OX + 15, "a smothered room's oxygen ends near the 15% burning limit");
        check(near(air_total(), before, 1e-6), "sealed combustion trades oxygen for CO2 one for one");
    }
    {
        Fixture f;
        const int k = f.cell(10, 10);
        f.fill(k, L_METHANE, 200, 600);
        f.fill(k + 1, L_OXYGEN, 200);
        f.s.fire_step(f.w);
        check(f.s.explosions == 1 && f.w.typ[k + 1] != L_OXYGEN && f.w.typ[k] != L_METHANE, "lit methane touching oxygen explodes");
        check(f.s.shake > 0, "an explosion shakes the camera");
    }
    {
        Fixture f;
        for (int x = 0; x < 32; x++)
            f.w.solid[f.cell(x, 25)] = B_STONE;
        f.fill(f.cell(10, 2), L_NITRO, 255, 20);
        f.w.solid[f.cell(20, 24)] = B_WOOD;
        run(f, 80);
        check(f.s.explosions >= 1, "nitro dropped from a height explodes on landing");
        check(f.w.solid[f.cell(10, 25)] == 0 || f.w.solid[f.cell(9, 25)] == 0 || f.w.solid[f.cell(11, 25)] == 0,
              "the blast breaks the stone it lands on");
    }
    {
        Fixture f;
        const int k = f.cell(10, 10);
        f.w.solid[k] = B_FNITRO;
        f.w.temp[k] = 300;
        f.s.fire_step(f.w);
        check(f.s.explosions == 1 && f.w.solid[k] == 0, "heated frozen nitro still goes off");
    }
    {
        Fixture f;
        const int k = f.cell(10, 10);
        f.fill(k, L_HYDROGEN, 255, 600);
        const double before = f.s.air_ox[k - 1] + f.s.air_ox[k + 1] + f.s.air_ox[k - 32] + f.s.air_ox[k + 32];
        f.s.fire_step(f.w);
        int steam = 0;
        for (int n = 0; n < 1024; n++)
            if (f.w.typ[n] == L_STEAM)
                steam += f.w.liq[n];
        const double after = f.s.air_ox[k - 1] + f.s.air_ox[k + 1] + f.s.air_ox[k - 32] + f.s.air_ox[k + 32];
        check(f.w.liq[k] == 255 - 64 && steam == 64, "burning hydrogen makes its own volume of steam");
        check(near(before - after, 64 * 1000.0 / 255 * 0.5), "hydrogen burns with half its volume of oxygen");
    }
    {
        Fixture f;
        const int k = f.cell(10, 10);
        f.w.solid[k] = B_WOOD;
        f.s.fire[k] = 100;
        f.w.temp[k] = 1000;
        f.fill(k - 32, WATER);
        f.s.fire_step(f.w);
        check(f.s.fire[k] == 0 && f.w.temp[k] <= 90, "water poured over a fire puts it out");
    }
    {
        Fixture f;
        const int k = f.cell(10, 20);
        f.w.solid[k + 32] = B_STONE;
        f.fill(k, L_OIL, 255, 300);
        f.fill(k + 32, WATER);
        f.w.solid[k + 32] = 0;
        f.w.solid[k + 64] = B_STONE;
        f.s.fire_step(f.w);
        check(f.s.fire[k] == 1 && f.w.liq[k] == 254, "hot oil on water burns, using its own fuel");
    }
    {
        Fixture f;
        for (int y = 0; y < 32; y++)
            for (int x = 0; x < 32; x++)
                f.w.solid[f.cell(x, y)] = B_STONE;
        for (int y = 2; y < 25; y++)
            for (int x : {5, 6, 7, 18, 19, 20})
                f.w.solid[f.cell(x, y)] = 0;
        for (int y = 22; y < 25; y++)
            for (int x = 5; x <= 20; x++)
                f.w.solid[f.cell(x, y)] = 0;
        for (int y = 2; y < 22; y++)
            for (int x = 5; x <= 7; x++)
                f.fill(f.cell(x, y), WATER);
        f.w.wake_all();
        const double volume = f.volume();
        run(f, 1600);
        int right = 0;
        for (int y = 2; y < 22; y++)
            for (int x = 18; x <= 20; x++)
                right += f.w.liq[f.cell(x, y)];
        check(right > 255, "pressure lifts water up the far arm of a U-bend");
        check(near(f.volume(), volume), "pressure conserves liquid");
    }
    {
        Fixture f;
        f.s.pressure_on = false;
        for (int x = 0; x < 32; x++)
            f.w.solid[f.cell(x, 31)] = B_STONE;
        for (int y = 16; y < 31; y++)
            for (int x = 0; x < 10; x++)
                f.fill(f.cell(x, y), WATER);
        f.w.wake_all();
        const double volume = f.volume();
        bool moving = false;
        for (int i = 0; i < 30; i++) {
            run(f, 1);
            for (int k = 0; k < 1024; k++)
                moving = moving || std::abs(f.w.vel[k]) > 0.1f;
        }
        check(moving, "a dam break gives the water sideways momentum");
        check(near(f.volume(), volume), "momentum conserves liquid");
    }
    {
        Fixture f;
        const int k = f.cell(10, 10);
        f.fill(k, WATER);
        f.s.paint(f.w, f.g, 11, 10, 1, -B_WETDIRT);
        f.w.liq[k] = 100;
        auto all_heat = [&] {
            double e = 0;
            for (int n = 0; n < 1024; n++)
                e += f.s.capacity(f.w, n) * f.w.temp[n] + f.w.latent[n];
            for (auto &p : f.s.pores)
                e += p.second.latent;
            return e;
        };
        const double volume = f.volume(), heat = all_heat();
        for (int i = 0; i < 20000 && f.w.solid[k + 1]; i++) {
            f.w.tick++;
            f.w.flux[k] = f.w.tick;
            f.w.vel[k] = 0.5f;
            f.s.erosion_step(f.w);
        }
        check(!f.w.solid[k + 1] && f.w.sol[k * NSOL + SOL_SILT] >= 48, "flowing water wears soil away into silt");
        check(near(f.volume(), volume), "eroded wet soil releases its pore water");
        check(near(all_heat(), heat, 1e-3), "erosion keeps the bank's heat");
    }
    {
        Fixture f;
        const int k = f.cell(10, 0);
        f.fill(k, L_SMOKE, 100);
        f.s.gas_step(f.w);
        check(!f.w.liq[k] && f.s.budget["escaped_smoke"] == 100, "smoke at the open top escapes and is recorded");
        stone_box(f, 4, 4, 8, 8);
        const int c = f.cell(6, 6);
        f.fill(c, L_CO2, 200);
        double carbon = 0;
        for (int n = 0; n < 1024; n++)
            carbon += f.s.air_carb[n];
        for (int i = 0; i < 400; i++)
            f.s.gas_step(f.w);
        double after = 0;
        for (int n = 0; n < 1024; n++)
            after += f.s.air_carb[n];
        check(f.w.liq[c] < 200 && near(after - carbon, (200 - f.w.liq[c]) * 10000.0 / 255, 1e-6),
              "loose CO2 gas joins the air without loss");
    }

    {
        // Building in 2 x 2 tiles: only into empty cells, removal gives back soaked water.
        Fixture f;
        check(f.s.build(f.w, f.g, 5, 5, -B_STONE) == 4 && f.w.solid[f.cell(4, 4)] == B_STONE &&
                  f.w.solid[f.cell(5, 5)] == B_STONE,
              "a stone tile fills its 2 x 2 cells");
        f.fill(f.cell(8, 4), WATER, 200);
        const double v = f.volume();
        check(f.s.build(f.w, f.g, 8, 4, -B_BRICK) == 0 && f.w.liq[f.cell(8, 4)] == 200,
              "building is refused where liquid stands");
        check(f.s.build(f.w, f.g, 12, 12, -B_PUMP_IN) == 0, "only plain blocks can be built");
        check(f.s.build(f.w, f.g, 4, 4, BUILD_REMOVE) == 4 && !f.w.solid[f.cell(5, 5)], "removing clears the tile");
        check(f.s.build(f.w, f.g, 4, 4, BUILD_BACK_WOOD) == 4 && (f.s.back[f.cell(4, 4)] & BACK_WALL) == 1,
              "background wall goes behind empty cells");
        check(f.s.build(f.w, f.g, 4, 4, BUILD_LADDER) == 4 && (f.s.back[f.cell(5, 5)] & BACK_LADDER),
              "ladder is placed on the background layer");
        check(f.s.build(f.w, f.g, 4, 4, BUILD_REMOVE) == 4 && !(f.s.back[f.cell(5, 5)] & BACK_LADDER) &&
                  (f.s.back[f.cell(5, 5)] & BACK_WALL),
              "remove takes the ladder before the wall");
        check(f.s.build(f.w, f.g, 4, 4, BUILD_REMOVE) == 4 && !f.s.back[f.cell(5, 5)], "then the wall");
        check(near(f.volume(), v), "building never changes liquid volume");
    }
    {
        // A door is a solid while closed and lets liquid through while open.
        Fixture f;
        stone_box(f, 2, 20, 28, 30);
        check(f.s.build(f.w, f.g, 14, 28, BUILD_DOOR) == 12 && f.w.solid[f.cell(14, 24)] == B_DOOR &&
                  f.w.solid[f.cell(15, 29)] == B_DOOR,
              "a door stands three tiles tall on the clicked tile");
        for (int y = 26; y < 30; y++)
            for (int x = 3; x < 14; x++)
                f.fill(f.cell(x, y), WATER, 255);
        const double v = f.volume();
        for (int i = 0; i < 60; i++)
            f.w.step();
        check(!f.w.liq[f.cell(20, 29)], "a closed door holds water back");
        check(f.s.toggle_door(f.w, 14, 25) && !f.w.solid[f.cell(14, 25)] && (f.s.back[f.cell(15, 28)] & BACK_DOOR_OPEN),
              "opening a door clears every door cell");
        for (int i = 0; i < 200; i++)
            f.w.step();
        check(f.w.liq[f.cell(20, 29)] > 0 && near(f.volume(), v), "water flows through an open door without loss");
        check(!f.s.toggle_door(f.w, 14, 29), "a door cannot close on standing water");
        for (int y = 24; y < 30; y++)
            for (int x = 14; x < 16; x++)
                f.w.liq[f.cell(x, y)] = 0;
        check(f.s.toggle_door(f.w, 14, 29) && f.w.solid[f.cell(15, 24)] == B_DOOR, "a dry doorway closes");
        check(f.s.build(f.w, f.g, 14, 26, BUILD_REMOVE) == 4 && f.w.solid[f.cell(14, 24)] == B_DOOR,
              "doors are removed a tile at a time");
    }
    {
        // The player walks, is stopped by walls and doors, steps up ledges, climbs and keeps the room's air.
        World w;
        Grains g;
        Sandbox s;
        Player p;
        start_plot(w, g, s, p, 3);
        const double spawn_y = p.y;
        for (int i = 0; i < 30; i++)
            step_game(w, g, s, &p);
        check(p.on_ground && near(p.y, spawn_y), "the player stands on the shack floor");
        p.input.right = true;
        for (int i = 0; i < 240; i++)
            step_game(w, g, s, &p);
        check(p.x + Player::WIDTH <= 270 * 8 && p.x + Player::WIDTH > 268 * 8, "the closed door stops the player");
        check(s.toggle_door(w, 270, 96), "the shack door opens");
        for (int i = 0; i < 120; i++)
            step_game(w, g, s, &p);
        check(p.x > 280 * 8 && p.on_ground, "the player walks out through the open door");
        const int ledge = (int(p.x / 8) + 6) & ~1;
        check(s.build(w, g, ledge, 98, -B_STONE) == 4, "a one-tile ledge is built in the way");
        const double ground = p.y;
        double highest = p.y;
        for (int i = 0; i < 60; i++) {
            step_game(w, g, s, &p);
            highest = std::min(highest, p.y);
        }
        check(highest <= ground - 15 && p.x > (ledge + 2) * 8, "walking steps up a one-tile ledge");
        p.input = {};
        for (int i = 0; i < 60; i++)
            step_game(w, g, s, &p);
        const double standing = p.y;
        p.input.jump = true;
        step_game(w, g, s, &p);
        p.input.jump = false;
        for (int i = 0; i < 6; i++)
            step_game(w, g, s, &p);
        check(p.y < standing - 20, "jumping lifts the player");
        for (int i = 0; i < 90; i++)
            step_game(w, g, s, &p);
        check(p.on_ground && near(p.y, standing) && p.health == 100, "a jump lands without harm");
        const int lx = int(p.x / 8) & ~1;
        for (int y = 70; y < 100; y += 2)
            s.build(w, g, lx, y, BUILD_LADDER);
        s.build(w, g, lx + 2, 70, BUILD_LADDER);
        p.input.up = true;
        for (int i = 0; i < 60; i++)
            step_game(w, g, s, &p);
        check(p.climbing && p.y < standing - 60, "the player climbs a ladder");
        p.input = {};
        const double hold = p.y;
        for (int i = 0; i < 30; i++)
            step_game(w, g, s, &p);
        check(near(p.y, hold), "a ladder holds the player in place");
        p.input.jump = true;
        step_game(w, g, s, &p);
        p.input = {};
        for (int i = 0; i < 200; i++)
            step_game(w, g, s, &p);
        check(p.on_ground && p.health < 100 && p.health > 0, "a long fall hurts without killing");
    }
    {
        // Sealed in a small room the player uses up the oxygen and is eventually overcome, then respawns.
        Fixture f;
        Player p;
        stone_box(f, 2, 2, 12, 12);
        p.active = true;
        p.place(4 * 8, 12 * 8 - Player::HEIGHT);
        p.spawn_x = 20 * 8, p.spawn_y = 30 * 8 - Player::HEIGHT;
        auto room = [&](const std::vector<double> &a) {
            double n = 0;
            for (int y = 3; y < 12; y++)
                for (int x = 3; x < 12; x++)
                    n += a[f.cell(x, y)];
            return n;
        };
        for (int y = 3; y < 12; y++)
            for (int x = 3; x < 12; x++)
                f.s.air_ox[f.cell(x, y)] = 121;
        const double oxygen = room(f.s.air_ox), carbon = room(f.s.air_carb);
        for (int i = 0; i < 120; i++)
            step_game(f.w, f.g, f.s, &p);
        check(room(f.s.air_ox) < oxygen && near(room(f.s.air_carb) - carbon, (oxygen - room(f.s.air_ox)) * 10, 1e-6),
              "breathing turns the room's oxygen into CO2");
        check(p.breath == 100, "air above the choking level is fine");
        bool choked = false;
        for (int i = 0; i < 60 * 600 && !choked; i++) {
            step_game(f.w, f.g, f.s, &p);
            choked = p.deaths > 0;
        }
        check(choked && p.x == p.spawn_x, "running out of air respawns the player");
    }
    {
        // Equipment (M1): stoves, sinks and tables stand on floors and pans stand on them. Every joule that enters
        // or leaves a vessel is booked, and the books balance through each process.
        Fixture f;
        for (int y = 30; y < 32; y++)
            for (int x = 0; x < 32; x++)
                f.w.solid[f.cell(x, y)] = B_STONE;
        std::string why;
        const int stove = place_equipment(f.w, f.g, f.s, EQ_STOVE, 3, 29, &why);
        const int sink = place_equipment(f.w, f.g, f.s, EQ_SINK, 9, 29, &why);
        const int table = place_equipment(f.w, f.g, f.s, EQ_TABLE, 16, 29, &why);
        check(stove == f.cell(2, 26) && sink == f.cell(8, 26) && table == f.cell(16, 26) &&
                  f.w.solid[f.cell(5, 29)] == B_EQUIPMENT,
              "a stove, a sink and a table stand on the floor");
        check(place_equipment(f.w, f.g, f.s, EQ_SAUCEPAN, 26, 10, &why) < 0 && why == "it needs a floor or a table under it",
              "equipment does not float");
        check(place_equipment(f.w, f.g, f.s, EQ_STOVE, 4, 29, &why) < 0, "equipment does not overlap");
        int pan = place_equipment(f.w, f.g, f.s, EQ_SAUCEPAN, 2, 25, &why);
        check(pan == f.cell(2, 24) && resting_on(f.w, f.s, pan) == stove && equipment_at(f.w, f.s, 3, 25) == pan,
              "a saucepan stands on the stove");
        check(place_equipment(f.w, f.g, f.s, EQ_CANDY_MOLD, 2, 23, &why) < 0, "nothing stands on a saucepan");
        auto books = [&] { // what the vessels hold minus what the budgets say went in and out
            double held = 0;
            for (auto &[id, e] : f.s.equipment)
                held += e.vessel.energy;
            auto &b = f.s.budget;
            return held - (b["placed_J"] - b["removed_J"] - b["destroyed_J"] + b["added_J"] + b["stove_J"] +
                           b["intake_J"] - b["loss_J"] - b["vented_J"] - b["sink_J"] - b["smoke_J"] - b["drained_J"] -
                           b["spilled_J"] - b["collected_J"]);
        };
        // Water poured onto the open top is taken up with its salt and heat; condensed fog is left alone.
        for (int x : {2, 3}) {
            f.fill(f.cell(x, 23), WATER, 20, 20);
            f.w.sol[f.cell(x, 23) * NSOL + SOL_SALT] = 30;
        }
        Vessel *pv = &f.s.equipment[pan].vessel;
        const double world0 = f.heat(), vessel0 = pv->energy, salt0 = f.component(SOL_SALT), units0 = f.volume();
        equipment_step(f.w, f.g, f.s);
        check(near(f.volume(), units0 - 40) && near(pv->water, 40 * GRAMS_PER_UNIT, 1e-9) &&
                  near(pv->dissolved[SOL_SALT], salt0 * GRAMS_PER_UNIT, 1e-9) &&
                  near((f.heat() - world0) * JOULES_PER_ENERGY + pv->energy - vessel0, 0, 1e-6),
              "a pan takes up poured water with its salt and heat");
        const int fog = f.cell(2, 23);
        f.fill(fog, WATER, 30, 95);
        f.w.latent[fog] = 30 * 2.2;
        const double before_fog = pv->water;
        equipment_step(f.w, f.g, f.s);
        check(f.w.liq[fog] == 30 && near(pv->water, before_fog), "a pan does not catch condensed fog");
        f.w.liq[fog] = 0;
        f.w.typ[fog] = 0;
        f.w.latent[fog] = 0;
        // Tipping a pan out puts its liquid back into the world, heat and salt included.
        const double world1 = f.heat(), vessel1 = pv->energy, salt1 = f.component(SOL_SALT), units1 = f.volume();
        const int spilled = vessel_spill(f.w, f.s, pan);
        check(spilled == 40 && near(f.volume(), units1 + 40) && pv->water < 1e-6 &&
                  near((f.component(SOL_SALT) - salt1) * GRAMS_PER_UNIT, salt0 * GRAMS_PER_UNIT, 1e-6) &&
                  near((f.heat() - world1) * JOULES_PER_ENERGY + pv->energy - vessel1, 0, 1e-6),
              "a spilled pan pours its water, salt and heat into the world");
        for (int k = 0; k < 1024; k++)
            if (f.w.liq[k]) {
                f.w.liq[k] = 0;
                f.w.typ[k] = 0;
                f.w.latent[k] = 0;
            }
        vessel_discard(f.s, pan, false);
        check(near(books(), 0, 1e-6), "the books balance after pouring, catching and spilling");
        // Hard candy: dissolve the sugar on a medium flame, boil hard, ease off near the end and pour at 150 °C.
        Equipment &st = f.s.equipment[stove];
        auto cook = [&](double sugar, double water, double pull, bool gentle) {
            vessel_add(f.s, pan, "sugar", sugar, 20, &why);
            vessel_add(f.s, pan, "water", water, 15, &why);
            bool soft_ball = false;
            st.setting = gentle ? 2 : 3;
            for (int i = 0; i < 60 * 300 && pv->temperature < pull; i++) {
                if (gentle && pv->sugar_crystal < 0.01)
                    st.setting = pv->temperature > pull - 12 ? 1 : 3;
                step_game(f.w, f.g, f.s, nullptr);
                soft_ball = soft_ball || candy_stage(*pv) == "soft ball";
            }
            st.setting = 0;
            return soft_ball;
        };
        const int mold = place_equipment(f.w, f.g, f.s, EQ_CANDY_MOLD, 16, 25, &why);
        auto pour_and_set = [&] {
            vessel_transfer(f.s, pan, mold, &why);
            for (int i = 0; i < 60 * 300 && !f.s.equipment[mold].vessel.set; i++)
                step_game(f.w, f.g, f.s, nullptr);
            return vessel_collect(f.s, mold, &why);
        };
        const double water0 = pv->water + f.s.budget["vented_vapour_g"];
        const bool stages = cook(600, 200, 150, true);
        check(stages && pv->temperature >= 150 && near(boiling_point(*pv), pv->temperature, 0.5) &&
                  candy_stage(*pv) == "hard crack" && pv->sugar_crystal < 0.01 && pv->burnt < 0.5,
              "a syrup climbs through the candy stages at its boiling point");
        check(near(pv->water + f.s.budget["vented_vapour_g"], water0 + 200, 1e-6), "boiled-off water is all accounted for");
        Product candy = pour_and_set();
        check(candy.id == "hard_candy_a" && candy.grams > 600 && candy.grams < 615, "candy poured at 150 °C sets glass-clear");
        check(vessel_collect(f.s, mold, &why).id.empty() && why == "the mold is empty", "an empty mold gives nothing");
        cook(600, 200, 138, true);
        check(pour_and_set().id == "hard_candy_b", "candy poured short of the hard crack is soft");
        cook(600, 100, 150, false);
        candy = pour_and_set();
        check(candy.id == "hard_candy_c" && candy.note.find("Grainy") == 0, "too little water and a hard boil make grainy candy");
        check(near(books(), 0, 1e-3), "the books balance through three batches of candy");
        // Syrup: dissolve on a low flame, then cool the pan in the sink before bottling.
        vessel_add(f.s, pan, "sugar", 500, 20, &why);
        vessel_add(f.s, pan, "water", 500, 15, &why);
        st.setting = 2;
        for (int i = 0; i < 60 * 300 && pv->sugar_crystal > 0.01; i++)
            step_game(f.w, f.g, f.s, nullptr);
        st.setting = 0;
        check(vessel_collect(f.s, pan, &why).id.empty() && why == "let it cool below 50 °C before bottling",
              "hot syrup is not bottled");
        check(move_equipment(f.w, f.g, f.s, stove, 24, 29, &why) < 0 && why == "take what stands on it off first",
              "a stove with a pan on it stays put");
        const double carried = pv->water;
        pan = move_equipment(f.w, f.g, f.s, pan, 8, 25, &why);
        pv = &f.s.equipment[pan].vessel;
        check(pan == f.cell(8, 24) && resting_on(f.w, f.s, pan) == sink && near(pv->water, carried) &&
                  f.w.solid[f.cell(2, 24)] == 0,
              "a pan is carried to the sink with its contents");
        int cooled = 0;
        for (; cooled < 60 * 300 && pv->temperature > 49; cooled++)
            step_game(f.w, f.g, f.s, nullptr);
        Product syrup = vessel_collect(f.s, pan, &why);
        check(cooled < 60 * 15 && syrup.id == "syrup_simple_a" && syrup.grams > 980, "syrup cooled in the sink bottles as grade A");
        check(remove_equipment(f.w, f.s, sink, &why) == false && why == "take what stands on it off first",
              "a sink with a pan in it stays");
        // Sea salt: simmer below the boil, pour off the bitter brine once the salt has crystallized, dry the rest.
        auto salt_run = [&](bool drain) {
            const int salt_pan = place_equipment(f.w, f.g, f.s, EQ_SALT_PAN, 2, 25, &why);
            Vessel &v = f.s.equipment[salt_pan].vessel;
            vessel_add(f.s, salt_pan, "sea_water", 2000, 15, &why);
            const double water = v.water;
            bool drained = false;
            st.setting = 2;
            for (int i = 0; i < 60 * 900; i++) {
                step_game(f.w, f.g, f.s, nullptr);
                if (drain && !drained && v.water < 0.03 * water) {
                    vessel_discard(f.s, salt_pan, true);
                    drained = true;
                }
                if ((drained || !drain) && v.water <= 0.015 * vessel_mass(v))
                    break;
            }
            st.setting = 0;
            Product salt = vessel_collect(f.s, salt_pan, &why);
            vessel_discard(f.s, salt_pan, false);
            remove_equipment(f.w, f.s, salt_pan, &why);
            return salt;
        };
        Product salt = salt_run(true);
        check(salt.id == "sea_salt_flaky" && salt.grams > 30 && salt.grams < 40, "slow-simmered, drained sea water gives flaky salt");
        check(salt_run(false).id == "road_salt", "boiling sea water dry leaves bitter road salt");
        check(near(books(), 0, 1e-3), "the books balance through syrup and salt");
        // Equipment whose cells are destroyed is gone, contents and all, and the books still balance.
        vessel_add(f.s, pan, "water", 300, 30, &why);
        f.w.solid[f.cell(9, 25)] = 0;
        step_game(f.w, f.g, f.s, nullptr);
        check(!f.s.equipment.count(pan) && f.w.solid[f.cell(8, 24)] == 0 && near(f.s.budget["equipment_destroyed_g"], 300) &&
                  near(books(), 0, 1e-3),
              "a destroyed pan is gone with its contents");
    }
    {
        // Tanks and pipes (M2): a port couples a vessel to the pipe network, and liquid finds its level between
        // vessels and the world with its water, salts and heat conserved.
        Fixture f;
        for (int y = 30; y < 32; y++)
            for (int x = 0; x < 32; x++)
                f.w.solid[f.cell(x, y)] = B_STONE;
        std::string why;
        const int tote = place_equipment(f.w, f.g, f.s, EQ_TOTE, 2, 29, &why);
        const int drum = place_equipment(f.w, f.g, f.s, EQ_DRUM, 12, 29, &why);
        check(tote == f.cell(2, 24) && drum == f.cell(12, 26), "a tote and a drum stand on the floor");
        auto books = [&] {
            double held = 0;
            for (auto &[id, e] : f.s.equipment)
                held += e.vessel.energy + e.aux.energy;
            auto &b = f.s.budget;
            return held - (b["placed_J"] - b["removed_J"] - b["destroyed_J"] + b["added_J"] + b["stove_J"] +
                           b["intake_J"] - b["loss_J"] - b["vented_J"] - b["sink_J"] - b["smoke_J"] - b["drained_J"] -
                           b["spilled_J"] - b["collected_J"] + b["port_in_J"] - b["port_out_J"]);
        };
        Vessel &tv = f.s.equipment[tote].vessel, &dv = f.s.equipment[drum].vessel;
        vessel_add(f.s, tote, "sea_water", 500000, 20, &why);
        check(vessel_transfer(f.s, drum, tote, &why) == 0 && why == "it has a lid; pipe it in through a port",
              "nothing is poured into a closed tank");
        f.machine(f.cell(9, 29), B_VALVE);
        f.s.use(f.w, 9, 29, -B_VALVE, 1); // closed
        for (int x : {8, 10, 11})
            f.w.solid[f.cell(x, 29)] = B_PIPE;
        PortRef port;
        check(find_port(f.w, f.s, f.cell(7, 29), f.cell(8, 29), port) && port.id == tote &&
                  !find_port(f.w, f.s, f.cell(7, 28), f.cell(8, 28), port),
              "a pipe end beside a port is coupled to it");
        const double salt0 = tv.dissolved[SOL_SALT], water0 = tv.water;
        for (int i = 0; i < 120; i++)
            step_game(f.w, f.g, f.s, nullptr);
        check(dv.water == 0, "a closed valve holds the tank back");
        f.s.use(f.w, 9, 29, -B_VALVE, 1);
        for (int i = 0; i < 1200; i++)
            step_game(f.w, f.g, f.s, nullptr);
        const double tote_row = 24 + 6 * (1 - vessel_mass(tv) / 1e6), drum_row = 26 + 4 * (1 - vessel_mass(dv) / 2e5);
        check(dv.water > 100000 && std::abs(tote_row - drum_row) < 0.25 && f.w.volume() < 1e-9 &&
                  near(dv.dissolved[SOL_SALT] / dv.water, salt0 / water0, 1e-9) &&
                  near(tv.water + dv.water, water0, 1e-6) && near(tv.dissolved[SOL_SALT] + dv.dissolved[SOL_SALT], salt0, 1e-6),
              "the tote drains into the drum through the pipe until their levels meet");
        check(near(books(), 0, 1e-3) && near(dv.temperature, 20, 0.5), "heat crosses the ports with the liquid");
        // With the valve shut again, a pump lifts the drum back up into the tote's top port.
        f.s.use(f.w, 9, 29, -B_VALVE, 1);
        f.s.use(f.w, 14, 29, 301, 1);
        f.s.use(f.w, 4, 23, 301, 1);
        for (int i = 0; i < 600 && dv.water > GRAMS_PER_UNIT; i++)
            step_game(f.w, f.g, f.s, nullptr);
        check(dv.water < GRAMS_PER_UNIT && near(tv.water + dv.water + f.s.pumps[0].buffer.amount * GRAMS_PER_UNIT, water0, 1e-6) &&
                  f.s.budget["power_joules"] > 0,
              "a pump lifts the drum into the tote through its top port");
        f.s.pumps[0].on = false;
        // An open pipe end is a leak: the tote empties onto the floor until the puddle is as high as its level.
        f.w.solid[f.cell(1, 29)] = B_PIPE;
        f.w.solid[f.cell(1, 28)] = B_PIPE;
        const double units = f.w.volume(), in_tote = tv.water;
        for (int i = 0; i < 240; i++)
            step_game(f.w, f.g, f.s, nullptr);
        check(f.w.volume() > units + 100 && near((f.w.volume() - units) * GRAMS_PER_UNIT, in_tote - tv.water, 1e-6),
              "a pipe that ends in the open spills the tank onto the floor");
        check(near(books(), 0, 1e-3), "the books balance with the ports");
        check(vessel_collect(f.s, tote, &why).id == "sea_water" && tv.water < 1e-6, "sea water in a tank is bottled for stock");
    }
    {
        // The fill coupling at the curb: while the tanker pumps, it pushes up to a tank's top port at any height.
        Fixture f;
        for (int y = 30; y < 32; y++)
            for (int x = 0; x < 32; x++)
                f.w.solid[f.cell(x, y)] = B_STONE;
        std::string why;
        const int tote = place_equipment(f.w, f.g, f.s, EQ_TOTE, 2, 29, &why);
        const int coupling = place_equipment(f.w, f.g, f.s, EQ_COUPLING, 20, 29, &why);
        for (int y = 20; y <= 27; y++)
            f.w.solid[f.cell(20, y)] = B_PIPE;
        for (int x = 5; x < 20; x++)
            f.w.solid[f.cell(x, 20)] = B_PIPE;
        for (int y = 21; y <= 23; y++)
            f.w.solid[f.cell(5, y)] = B_PIPE;
        Vessel &tv = f.s.equipment[tote].vessel, &cv = f.s.equipment[coupling].vessel;
        Equipment &ce = f.s.equipment[coupling];
        double delivered = 0;
        ce.setting = 1;
        for (int i = 0; i < 600; i++) {
            const double room = 20000 - vessel_mass(cv), grams = std::min(300.0, room);
            if (grams > 1 && delivered + grams <= 100000 && vessel_add(f.s, coupling, "sea_water", grams, 12, &why))
                delivered += grams;
            step_game(f.w, f.g, f.s, nullptr);
        }
        check(delivered > 99000 && vessel_mass(tv) > 0.9 * delivered && f.w.volume() < 1e-9,
              "the tanker's pump pushes through the coupling up into the tote");
        ce.setting = 0;
        const double left = vessel_mass(cv), held = vessel_mass(tv);
        for (int i = 0; i < 120; i++)
            step_game(f.w, f.g, f.s, nullptr);
        check(near(vessel_mass(cv), left) && near(vessel_mass(tv), held), "without the tanker's pump nothing flows uphill");
    }
    {
        // Beet sugar (M2): diffuse cossettes in hot water, lime the juice, boil it to grain with a seed, spin the
        // crystals out in a centrifuge. By-products: pulp, lime mud and molasses.
        Fixture f;
        for (int y = 30; y < 32; y++)
            for (int x = 0; x < 32; x++)
                f.w.solid[f.cell(x, y)] = B_STONE;
        std::string why;
        const int kettle = place_equipment(f.w, f.g, f.s, EQ_KETTLE, 2, 29, &why);
        const int slow = place_equipment(f.w, f.g, f.s, EQ_KETTLE, 10, 29, &why);
        const int spinner = place_equipment(f.w, f.g, f.s, EQ_CENTRIFUGE, 18, 29, &why);
        check(kettle >= 0 && slow >= 0 && spinner >= 0, "two kettles and a centrifuge stand on the floor");
        auto books = [&] {
            double held = 0;
            for (auto &[id, e] : f.s.equipment)
                held += e.vessel.energy + e.aux.energy;
            auto &b = f.s.budget;
            return held - (b["placed_J"] - b["removed_J"] - b["destroyed_J"] + b["added_J"] + b["stove_J"] +
                           b["intake_J"] - b["loss_J"] - b["vented_J"] - b["sink_J"] - b["smoke_J"] - b["drained_J"] -
                           b["spilled_J"] - b["collected_J"] + b["port_in_J"] - b["port_out_J"]);
        };
        Equipment &ke = f.s.equipment[kettle], &se = f.s.equipment[slow];
        Vessel &kv = ke.vessel, &sv = se.vessel;
        vessel_add(f.s, kettle, "cossettes", 10000, 12, &why);
        vessel_add(f.s, kettle, "water", 12000, 15, &why);
        vessel_add(f.s, slow, "sugar_beet", 10000, 12, &why);
        vessel_add(f.s, slow, "water", 12000, 15, &why);
        auto hold = [&](Equipment &e, double low, double high) {
            e.setting = e.vessel.temperature < low ? 3 : e.vessel.temperature < high ? 1 : 0;
        };
        int ticks = 0;
        for (; ticks < 60 * 300 && kv.temperature < 72; ticks++) {
            hold(ke, 72, 75);
            hold(se, 72, 75);
            step_game(f.w, f.g, f.s, nullptr);
        }
        const int heating = ticks;
        for (int i = 0; i < 60 * 60; i++) {
            hold(ke, 72, 75);
            hold(se, 72, 75);
            step_game(f.w, f.g, f.s, nullptr);
        }
        const double extracted = kv.dissolved[SOL_SUGAR] / (10000 * 0.17), whole = sv.dissolved[SOL_SUGAR] / (10000 * 0.17);
        check(heating < 60 * 60 && extracted > 0.45 && extracted < 0.62 && whole < extracted / 3,
              "hot water draws the sugar out of cossettes, and far more slowly out of whole beets");
        check(vessel_ph(kv) < 7 && kv.dissolved[SOL_SILT] > 50, "raw juice is slightly acid and cloudy");
        ke.setting = se.setting = 0;
        Product pulp = vessel_collect(f.s, kettle, &why);
        check(pulp.id == "beet_pulp" && pulp.grams > 9000 && kv.beet < 1e-9 && kv.water > 8000, "the spent cossettes come out as pulp");
        // Lime: too little leaves colloids, so dose it by the pH meter until it stays just alkaline once hot.
        const double colloid = kv.dissolved[SOL_SILT];
        vessel_add(f.s, kettle, "lime", colloid * 1.03, 20, &why);
        check(vessel_ph(kv) > 7.8, "fresh lime makes the juice alkaline");
        for (int i = 0; i < 60 * 30; i++) {
            hold(ke, 85, 88);
            step_game(f.w, f.g, f.s, nullptr);
        }
        check(kv.dissolved[SOL_SILT] < 0.03 * colloid && kv.mud > colloid && vessel_ph(kv) < 7.5, "hot lime clears the juice");
        check(vessel_collect(f.s, kettle, &why).id == "lime_mud" && kv.mud < 1e-9, "the lime mud is scooped out");
        // Boil it down past saturation, seed it, and keep boiling until half the massecuite is crystal.
        ticks = 0;
        for (; ticks < 60 * 600 && kv.dissolved[SOL_SUGAR] / (kv.dissolved[SOL_SUGAR] + kv.water) < 0.86; ticks++) {
            ke.setting = 3;
            step_game(f.w, f.g, f.s, nullptr);
        }
        const int boiling = ticks;
        vessel_add(f.s, kettle, "sugar", 20, 20, &why);
        ke.setting = 1;
        for (; ticks < 60 * 900 && kv.sugar_crystal < 0.5 * vessel_mass(kv); ticks++)
            step_game(f.w, f.g, f.s, nullptr);
        ke.setting = 0;
        check(boiling < 60 * 240 && ticks - boiling < 60 * 120 && kv.sugar_crystal > 400, "a seeded syrup boils to grain");
        check(vessel_collect(f.s, kettle, &why).id.empty() && why == "that is massecuite: spin the sugar out of it in a centrifuge",
              "massecuite is not sold as it is");
        Vessel &basket = f.s.equipment[spinner].vessel, &casing = f.s.equipment[spinner].aux;
        const double massecuite = vessel_mass(kv);
        check(near(vessel_transfer(f.s, kettle, spinner, &why), massecuite, 1e-6), "the massecuite is poured into the centrifuge");
        // Spin, wash the crystals with a splash of water, and spin again.
        f.s.equipment[spinner].setting = 1;
        for (int i = 0; i < 60 * 10; i++)
            step_game(f.w, f.g, f.s, nullptr);
        vessel_add(f.s, spinner, "water", basket.sugar_crystal * 0.03, 15, &why);
        for (int i = 0; i < 60 * 10; i++)
            step_game(f.w, f.g, f.s, nullptr);
        f.s.equipment[spinner].setting = 0;
        const double crystals = basket.sugar_crystal;
        Product sugar = vessel_collect(f.s, spinner, &why);
        check(sugar.id == "sugar" && sugar.grams > 0.98 * crystals && sugar.grams < 1.03 * crystals, "limed, spun beet sugar is white");
        Product molasses = vessel_collect(f.s, spinner, &why);
        check(molasses.id == "molasses" && molasses.grams > 200 && vessel_mass(casing) < 1e-9, "the casing holds molasses");
        check(near(books(), 0, 1e-2), "the books balance through a beet sugar campaign");
        // The same juice unlimed makes off-white sugar; unspun massecuite is raw sugar.
        vessel_discard(f.s, slow, false);
        vessel_add(f.s, slow, "water", 4000, 15, &why);
        vessel_add(f.s, slow, "sugar", 4000, 20, &why);
        sv.dissolved[SOL_SILT] = 4000 * 0.07; // as much as raw juice carries
        sv.dissolved[SOL_METAL] = 4000 * 0.048;
        ticks = 0;
        for (; ticks < 60 * 600 && sv.dissolved[SOL_SUGAR] / (sv.dissolved[SOL_SUGAR] + sv.water) < 0.86; ticks++) {
            se.setting = 3;
            step_game(f.w, f.g, f.s, nullptr);
        }
        vessel_add(f.s, slow, "sugar", 20, 20, &why);
        se.setting = 1;
        for (; ticks < 60 * 900 && sv.sugar_crystal < 0.5 * vessel_mass(sv); ticks++)
            step_game(f.w, f.g, f.s, nullptr);
        se.setting = 0;
        vessel_transfer(f.s, slow, spinner, &why);
        f.s.equipment[spinner].setting = 1;
        for (int i = 0; i < 60 * 20; i++)
            step_game(f.w, f.g, f.s, nullptr);
        f.s.equipment[spinner].setting = 0;
        sugar = vessel_collect(f.s, spinner, &why);
        check(sugar.id == "beet_sugar_b" || sugar.id == "brown_sugar", "cloudy juice makes off-colour sugar");
        vessel_collect(f.s, spinner, &why);
        check(near(books(), 0, 1e-2), "the books still balance");
        // A save keeps the second compartment and the beet tissue.
        vessel_add(f.s, kettle, "cossettes", 1000, 20, &why);
        f.s.equipment[spinner].aux.water = 500;
        f.s.equipment[spinner].aux.energy += 500 * 4.18 * 20;
        Player p;
        const std::string path = "sandbox-test-m2.ecosave";
        check(save_world(path, f.w, f.g, f.s, p, &why), "an M2 world saves");
        World w2;
        Grains g2;
        Sandbox s2;
        Player p2;
        check(load_world(path, w2, g2, s2, p2, &why) && s2.equipment[spinner].aux.water == 500 &&
                  s2.equipment[kettle].vessel.beet_sugar == kv.beet_sugar && s2.equipment[kettle].vessel.beet_cut == 1,
              "the casing and the cossettes survive a save");
        std::remove(path.c_str());
    }
    {
        // A save holds the whole simulation: a loaded world steps on exactly like the original.
        World w;
        Grains g;
        Sandbox s;
        Player p;
        start_plot(w, g, s, p, 9);
        s.paint(w, g, 200, 80, 4, WATER);
        s.paint(w, g, 210, 96, 2, -B_WOOD);
        s.ignite(w, 210, 96, 2);
        g.paint(w, 100 * 8, 70 * 8, 6, SAND);
        int pan = -1;
        for (auto &[id, e] : s.equipment)
            if (e.kind == EQ_SAUCEPAN) {
                pan = id;
                s.equipment[resting_on(w, s, id)].setting = 3;
            }
        vessel_add(s, pan, "sugar", 300, 20);
        vessel_add(s, pan, "water", 200, 20);
        p.input.left = true;
        for (int i = 0; i < 40; i++)
            step_game(w, g, s, &p);
        const std::string path = "sandbox-test-world.ecosave";
        std::string error;
        check(save_world(path, w, g, s, p, &error), "the world saves");
        World w2;
        Grains g2;
        Sandbox s2;
        Player p2;
        check(load_world(path, w2, g2, s2, p2, &error), "the world loads");
        p2.input = p.input;
        for (int i = 0; i < 120; i++) {
            step_game(w, g, s, &p);
            step_game(w2, g2, s2, &p2);
        }
        check(w.liq == w2.liq && w.typ == w2.typ && w.solid == w2.solid && w.temp == w2.temp && w.sol == w2.sol &&
                  s.air_ox == s2.air_ox && s.fire == s2.fire && g.image == g2.image && p.x == p2.x && p.y == p2.y &&
                  s2.equipment.size() == 6 && s.equipment[pan].vessel.energy == s2.equipment[pan].vessel.energy &&
                  s.equipment[pan].vessel.water == s2.equipment[pan].vessel.water && s.equipment[pan].vessel.temperature > 30,
              "a loaded world steps on identically, pans cooking and all");
        {
            std::ofstream bad(path, std::ios::binary | std::ios::trunc);
            bad << "ECOSAVE1 not really";
        }
        World w3 = w2;
        check(!load_world(path, w3, g2, s2, p2, &error) && w3.solid == w2.solid, "a damaged save is refused");
        std::remove(path.c_str());
    }
    std::cout << "Native sandbox: " << checks << " checks, " << failures << " failures\n";
    return failures ? 1 : 0;
}
