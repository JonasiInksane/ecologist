#pragma once
#include "../generated/sandbox.hpp"
#include "grains.hpp"
#include <array>
#include <map>
#include <string>

namespace ecologist {
struct FluidBuffer {
    int type = 0;
    double amount = 0, temperature = 20, latent = 0;
    std::array<double, NSOL> sol{};
};
struct Machine {
    int kind = 0, liquid = 1, filter = 0, period = 120, limit = 3, count = 0, direction = 2, level = 100,
        colour = 0, erupting = 0, rest = 0;
    bool on = false, active = false, open = false, manual = false, was_high = false, charging = false;
    double charge = 0, salt = 0, salt_heat = 0;
    std::vector<int> targets;
};
struct Pump {
    int inlet = -1, outlet = -1;
    bool on = true;
    FluidBuffer buffer;
};
struct Sandbox {
    std::map<int, Machine> machines;
    std::vector<Pump> pumps;
    std::map<int, FluidBuffer> pores;
    std::map<int, FluidBuffer> meltwater;
    std::vector<double> held;
    std::vector<int> power, pipe_show, pipe_time;
    int pending_inlet = -1, pending_wire = -1;
    double source_units = 0, drain_units = 0, source_heat = 0, drain_heat = 0;
    std::array<double, NSOL> drained_solutes{};
    double sunlight = 1, wind = 0.4;
    std::string message;
    void reset(const World &w);
    bool paint(World &w, Grains &g, int x, int y, int radius, int material);
    bool use(World &w, int x, int y, int tool, int selected_liquid, const Grains *grains = nullptr);
    bool wire(World &w, int x, int y);
    void step(World &w, Grains &g);
    void devices_step(World &w, Grains &g);
    void pumps_step(World &w);
    void pipes_step(World &w);
    void material_step(World &w, Grains &g);
    void thermal_step(World &w);
    void reactions_step(World &w);
    void grain_effects(World &w, Grains &g);
    void erase(World &w, int k);
    void freeze(World &w, int k, int block);
    void melt(World &w, int k, int type);
    int neighbor(const World &w, int k, int direction) const;
    double capacity(const World &w, int k) const;
    bool transfer(World &w, int from, int to, int amount);
    int take(World &w, int from, FluidBuffer &buffer, int amount);
    int put(World &w, FluidBuffer &buffer, int to, int amount);
    double buffered_volume() const;
    bool set_gate(World &w, int k, Machine &d, bool open, const Grains *grains = nullptr);
};
} // namespace ecologist
