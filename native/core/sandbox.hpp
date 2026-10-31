#pragma once
#include "../generated/sandbox.hpp"
#include "grains.hpp"
#include <array>
#include <map>
#include <string>
#include <vector>

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
// Kitchen and lab equipment (M1, native/core/equipment.cpp). A vessel is a lumped model in grams: 1 world unit is
// 10000/255 g of water, and dissolved[s] holds each solute channel as grams of that component, so liquid moves
// between vessels and world cells without changing mass, solutes or heat.
struct Vessel {
    double water = 0;
    std::array<double, NSOL> dissolved{};
    double sugar_crystal = 0, salt_crystal = 0, bittern_crystal = 0, burnt = 0;
    double energy = 0;                    // J, including the vessel body
    double temperature = 20, peak = 20;
    double salt_heat = 0, salt_formed = 0; // crystallization temperature x grams, for flaky salt
    double vapour = 0;                     // about the grams evaporated in the last second, for drawing steam
    double smoke = 0;
    bool set = false;                      // a candy mold's contents have hardened
    // Beet tissue (M2): marc, and the cell sap's water, sugar, colloids and ash, which diffuse out into the liquid.
    // beet_cut is the share of the tissue that was shredded into cossettes.
    double beet = 0, beet_water = 0, beet_sugar = 0, beet_colloid = 0, beet_ash = 0, beet_cut = 0;
    double mud = 0;          // lime mud: colloids precipitated by lime
    double crystal_dirt = 0; // non-sugars trapped inside sugar crystals as they grew
};
struct Equipment {
    int kind = 0, x = 0, y = 0, setting = 0;
    Vessel vessel;
    Vessel aux; // a second compartment: the centrifuge's casing (M2)
};
// Air in each empty cell, in the browser's units: oxygen in tenths of a percent, CO2 in hundredths.
// Building layer (M0): a door is a solid block while closed; the background layer holds walls behind rooms,
// ladders and the cells of an open door, none of which block liquids.
// B_ROOF: clay roof tiles (the art pass); fired clay like brick, drawn as tiles with sloped ends.
inline constexpr int B_DOOR = 80, B_EQUIPMENT = 81, B_ROOF = 82;
inline constexpr std::uint8_t BACK_WALL = 0x0f, BACK_LADDER = 0x40, BACK_DOOR_OPEN = 0x20;
inline constexpr int BUILD_REMOVE = 1000, BUILD_BACK_WOOD = 1001, BUILD_BACK_BRICK = 1002, BUILD_LADDER = 1003,
                     BUILD_DOOR = 1004, BUILD_REMOVE_BACK = 1005, BUILD_PIPE = 1006, BUILD_VALVE = 1007, BUILD_PUMP = 1008,
                     BUILD_BACK_PLASTER = 1009;
// Rooms (docs/design/rooms.md) set any background wall kind with BUILD_BACK_KIND + kind (1-15), replacing what is there.
inline constexpr int BUILD_BACK_KIND = 1100;
// Background wall kinds in the low bits of the building layer.
inline constexpr std::uint8_t WALL_WOOD = 1, WALL_BRICK = 2, WALL_PLASTER = 3;
// Room walls drawn from the generated wall textures (art-source/pixellab/rooms): plaster, steel, tile, concrete.
inline constexpr std::uint8_t WALL_ROOM_PLASTER = 4, WALL_ROOM_STEEL = 5, WALL_ROOM_TILE = 6, WALL_ROOM_CONCRETE = 7;
inline constexpr double AIR_OX = 210, AIR_CARB = 4, MAX_AIR_OX = 1000, MAX_AIR_CARB = 10000, CARB_PER_OX = 10,
                        FIRE_OX = 150;
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
    // Finite atmosphere, combustion and flow (native/core/combustion.cpp, native/core/flow_systems.cpp).
    std::vector<double> air_ox, air_carb;
    std::vector<std::uint8_t> fire, air_busy;
    std::vector<std::uint32_t> level_until, seen, moved;
    std::vector<std::uint16_t> level_row;
    std::vector<int> queue;
    std::uint32_t search_pass = 0;
    bool pressure_on = true, momentum_on = true, pressure_was_on = false;
    double shake = 0;
    int explosions = 0;
    std::map<std::string, double> budget;
    std::vector<std::uint8_t> back;
    std::map<int, Equipment> equipment;
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
    void fire_step(World &w);
    void explode(World &w, int k);
    bool ignite(World &w, int x, int y, int radius);
    void atmosphere_step(World &w);
    void gas_step(World &w);
    void pressure_step(World &w);
    void momentum_step(World &w);
    void erosion_step(World &w);
    bool air(const World &w, int k) const;
    double breathe_air(World &w, int k, double oxygen);
    void stir(const World &w, int k);
    int build(World &w, Grains &g, int x, int y, int code);
    bool toggle_door(World &w, int x, int y, bool closing_allowed = true);
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
