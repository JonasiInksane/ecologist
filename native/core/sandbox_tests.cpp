#include "sandbox.hpp"
#include <algorithm>
#include <cmath>
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
    std::cout << "Native sandbox: " << checks << " checks, " << failures << " failures\n";
    return failures ? 1 : 0;
}
