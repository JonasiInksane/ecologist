#include "player.hpp"
#include "equipment.hpp"
#include <algorithm>
#include <cmath>
namespace ecologist {
namespace {
constexpr double CELL = 8, GRAVITY = 0.4, MAX_FALL = 10, RUN = 3, SWIM_RUN = 1.5, GROUND_ACCEL = 0.35,
                 AIR_ACCEL = 0.2, JUMP = 7, CLIMB = 2, STEP_UP = 16, SWIM_GRAVITY = 0.1, SWIM_FALL = 2,
                 SWIM_UP = 0.6;
// A resting person uses about 0.25 L of oxygen a minute; one air unit is 0.1% of a 10 L cell.
constexpr double BREATH_RATE = 0.007;
constexpr double SAFE_FALL = 9, FALL_HURT = 8, HEAT_HURT_FROM = 60, CHOKE_OX = 120, CHOKE_CARB = 500;
} // namespace

void Player::place(double px, double py) {
    x = spawn_x = px;
    y = spawn_y = py;
    vx = vy = 0;
}
bool Player::free_at(const World &w, double px, double py) const {
    const int x0 = int(std::floor(px / CELL)), x1 = int(std::floor((px + WIDTH - 0.001) / CELL)),
              y0 = int(std::floor(py / CELL)), y1 = int(std::floor((py + HEIGHT - 0.001) / CELL));
    for (int cy = y0; cy <= y1; cy++)
        for (int cx = x0; cx <= x1; cx++) {
            if (cx < 0 || cx >= w.width || cy >= w.height)
                return false;
            // The player walks in front of furniture and equipment.
            if (cy >= 0 && w.solid[cy * w.width + cx] && w.solid[cy * w.width + cx] != B_EQUIPMENT)
                return false;
        }
    return true;
}
bool Player::overlaps(int cell_x, int cell_y, int cells_w, int cells_h) const {
    return x < (cell_x + cells_w) * CELL && x + WIDTH > cell_x * CELL && y < (cell_y + cells_h) * CELL &&
           y + HEIGHT > cell_y * CELL;
}
void Player::step(World &w, Sandbox &s) {
    event.clear();
    const int x0 = std::max(0, int(std::floor(x / CELL))), x1 = std::min(w.width - 1, int(std::floor((x + WIDTH - 0.001) / CELL))),
              y0 = std::max(0, int(std::floor(y / CELL))), y1 = std::min(w.height - 1, int(std::floor((y + HEIGHT - 0.001) / CELL)));
    int wet = 0, cells = 0;
    bool ladder = false, burning = false;
    double hottest = -1e9;
    for (int cy = y0; cy <= y1; cy++)
        for (int cx = x0; cx <= x1; cx++) {
            const int k = cy * w.width + cx;
            cells++;
            if (w.liq[k] >= 96 && !FLUIDS[w.typ[k]].gas)
                wet++;
            ladder = ladder || (s.back[k] & BACK_LADDER);
            burning = burning || (!s.fire.empty() && s.fire[k]);
            hottest = std::max(hottest, double(w.temp[k]));
        }
    swimming = cells && wet * 2 >= cells;
    if (!ladder)
        climbing = false;
    else if (input.up || input.down)
        climbing = true;

    // Horizontal: accelerate towards the wanted speed.
    const double target = (double(input.right) - double(input.left)) * (swimming ? SWIM_RUN : RUN);
    const double accel = on_ground ? GROUND_ACCEL : AIR_ACCEL;
    vx += std::clamp(target - vx, -accel, accel);
    if (input.right != input.left)
        facing = input.right ? 1 : -1;
    // Vertical: ladders hold the player, water buoys them, otherwise gravity.
    if (climbing) {
        vy = (double(input.down) - double(input.up)) * CLIMB;
        if (input.jump && !input.up) {
            climbing = false;
            vy = -JUMP * 0.6;
        }
    } else if (swimming) {
        vy = std::min(vy + SWIM_GRAVITY, SWIM_FALL);
        if (input.jump || input.up)
            vy = std::max(vy - SWIM_UP, -3.0);
    } else {
        vy = std::min(vy + GRAVITY, MAX_FALL);
        if (input.jump && on_ground)
            vy = -JUMP;
    }
    const bool was_ground = on_ground;
    const double landing = vy;
    // Move one pixel at a time so nothing tunnels; a one-tile ledge is stepped up while walking.
    for (double left = vx; std::abs(left) > 1e-9;) {
        const double d = std::clamp(left, -1.0, 1.0);
        if (free_at(w, x + d, y)) {
            x += d;
            left -= d;
            continue;
        }
        bool stepped = false;
        if (was_ground && !swimming)
            for (double up = 1; up <= STEP_UP && !stepped; up++)
                if (free_at(w, x + d, y - up) && free_at(w, x, y - up)) {
                    y -= up;
                    x += d;
                    left -= d;
                    stepped = true;
                }
        if (!stepped) {
            vx = 0;
            break;
        }
    }
    on_ground = false;
    for (double left = vy; std::abs(left) > 1e-9;) {
        const double d = std::clamp(left, -1.0, 1.0);
        if (free_at(w, x, y + d)) {
            y += d;
            left -= d;
            continue;
        }
        if (vy > 0)
            on_ground = true;
        vy = 0;
        break;
    }
    if (!on_ground && vy >= 0 && !free_at(w, x, y + 1))
        on_ground = true;
    if (on_ground && !was_ground && landing > SAFE_FALL && !swimming) {
        health -= (landing - SAFE_FALL) * FALL_HURT;
        event = "fall";
    }

    // Heat, flames and air. The head is the top cell under the box's centre.
    if (burning)
        health -= 0.6;
    if (hottest > HEAT_HURT_FROM)
        health -= std::min(2.0, (hottest - HEAT_HURT_FROM) * 0.004);
    const int head_x = std::clamp(int((x + WIDTH / 2) / CELL), 0, w.width - 1), head_y = std::clamp(int((y + 4) / CELL), 0, w.height - 1);
    const int head = head_y * w.width + head_x;
    bool choking = false;
    if (w.liq[head] >= 96 && !FLUIDS[w.typ[head]].gas)
        choking = true; // under water, or anything else that is not a gas
    else if (w.liq[head] >= 64 && FLUIDS[w.typ[head]].gas && w.typ[head] != L_OXYGEN) {
        choking = true;
        if (w.typ[head] == L_POISON || w.typ[head] == L_CHLORINE)
            health -= 0.2;
    } else if (s.air(w, head)) {
        choking = s.air_ox[head] < CHOKE_OX || s.air_carb[head] > CHOKE_CARB;
        s.breathe_air(w, head, BREATH_RATE); // a person uses the room's oxygen too
    }
    breath = choking ? std::max(0.0, breath - 0.25) : std::min(100.0, breath + 1);
    if (breath <= 0)
        health -= 0.5;
    if (health <= 0) {
        deaths++;
        event = "respawn";
        x = spawn_x;
        y = spawn_y;
        vx = vy = 0;
        health = breath = 100;
        climbing = swimming = false;
    }
}

void step_game(World &w, Grains &g, Sandbox &s, Player *p) {
    w.step();
    s.step(w, g);
    g.step(w);
    chemistry_step(w, g);
    if (p && p->active)
        p->step(w, s);
}

// The campaign start: a narrow plot with a one-room wooden shack, a road to the east for deliveries,
// and gentle land to the west. Ground level is row 100 of a 512 x 128 world.
void start_plot(World &w, Grains &g, Sandbox &s, Player &p, std::uint32_t seed) {
    if (!w.reset(512, 128, seed))
        return;
    g.reset(w);
    s.reset(w);
    constexpr int GROUND = 100;
    auto set = [&](int x, int y, int block) {
        if (x >= 0 && y >= 0 && x < w.width && y < w.height)
            w.solid[y * w.width + x] = std::uint8_t(block);
    };
    for (int x = 0; x < w.width; x++) {
        const int surface = x < 150 ? GROUND + int(std::lround(std::sin((150 - x) * 0.035) * 5)) : GROUND;
        for (int y = surface; y < w.height; y++) {
            set(x, y, y < surface + 6 ? B_DIRT : B_STONE);
            w.under[y * w.width + x] = y > surface;
        }
    }
    for (int x = 380; x < w.width; x++) // the road, where delivery trucks will park
        for (int y = GROUND; y < GROUND + 2; y++)
            set(x, y, B_BASALT);
    // The shack: 16 tiles wide, a 5-tile room with a wooden floor, walls and ceiling beam, plaster inside, a window
    // and a door, under a clay tile roof that steps in a cell a row (drawn sloped) with a brick chimney through it.
    constexpr int L = 240, R = 271, ROOF = 88;
    for (int x = L - 1; x <= R + 1; x++)
        set(x, ROOF + 1, B_WOOD);
    for (int row = 0; row < 4; row++)
        for (int x = L - 3 + row; x <= R + 3 - row; x++)
            set(x, ROOF - row, B_ROOF);
    for (int y = ROOF - 7; y <= ROOF; y++)
        for (int x : {R - 8, R - 7})
            set(x, y, B_BRICK);
    for (int y = ROOF + 2; y < GROUND; y++)
        for (int x : {L, L + 1, R - 1, R})
            set(x, y, B_WOOD);
    for (int x = L; x <= R; x++)
        for (int y = GROUND; y < GROUND + 2; y++)
            set(x, y, B_WOOD);
    for (int y = ROOF + 4; y < ROOF + 8; y++)
        for (int x : {L, L + 1})
            set(x, y, B_GLASS);
    for (int y = GROUND - 6; y < GROUND; y++)
        for (int x : {R - 1, R})
            set(x, y, B_DOOR);
    for (int y = ROOF + 2; y < GROUND; y++)
        for (int x = L + 2; x < R - 1; x++)
            s.back[y * w.width + x] = WALL_PLASTER;
    // The kitchen: a sink with mains water, a table with a candy mold and the laptop the shop runs on, and a stove
    // with a saucepan on it.
    place_equipment(w, g, s, EQ_SINK, L + 4, GROUND - 1);
    place_equipment(w, g, s, EQ_TABLE, L + 10, GROUND - 1);
    place_equipment(w, g, s, EQ_CANDY_MOLD, L + 12, GROUND - 5);
    place_equipment(w, g, s, EQ_LAPTOP, L + 14, GROUND - 5);
    place_equipment(w, g, s, EQ_STOVE, L + 18, GROUND - 1);
    place_equipment(w, g, s, EQ_SAUCEPAN, L + 18, GROUND - 5);
    w.wake_all();
    p = Player{};
    p.active = true;
    p.place((L + 23) * CELL, GROUND * CELL - Player::HEIGHT);
}
} // namespace ecologist
