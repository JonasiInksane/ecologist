#pragma once
#include "sandbox.hpp"
#include <string>

namespace ecologist {
struct PlayerInput {
    bool left = false, right = false, jump = false, up = false, down = false;
};
// The player character (M0): an axis-aligned box in display pixels (8 per cell) that walks, jumps, steps up
// one-tile ledges, climbs ladders and swims. It is hurt by heat, fire, falls and bad air, breathes the air
// model's oxygen, and respawns at its spawn point.
struct Player {
    static constexpr double WIDTH = 20, HEIGHT = 42;
    double x = 0, y = 0, vx = 0, vy = 0, spawn_x = 0, spawn_y = 0, health = 100, breath = 100;
    int facing = 1, deaths = 0;
    bool active = false, on_ground = false, climbing = false, swimming = false;
    std::string event;
    PlayerInput input;
    void place(double px, double py);
    bool free_at(const World &w, double px, double py) const;
    bool overlaps(int cell_x, int cell_y, int cells_w = 1, int cells_h = 1) const;
    void step(World &w, Sandbox &s);
};
// One game tick in the order the Godot adapter uses: the cell world, devices and air, grains, chemistry, then
// the player (when one is active).
void step_game(World &w, Grains &g, Sandbox &s, Player *p);
void start_plot(World &w, Grains &g, Sandbox &s, Player &p, std::uint32_t seed);
// The base (docs/design/rooms.md): open air over a concrete-capped ground line at row BASE_GROUND, earth and rock below,
// nothing built. The player stands on the ground at cell column BASE_SPAWN; rooms are carved by the game.
inline constexpr int BASE_WIDTH = 512, BASE_HEIGHT = 128, BASE_GROUND = 48, BASE_SPAWN = 256;
void start_base(World &w, Grains &g, Sandbox &s, Player &p, std::uint32_t seed);
}
