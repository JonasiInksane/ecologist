// Building (M0): tile placement in 2 x 2 cell tiles, background walls, ladders and doors; pipes, valves and pumps
// (M2) cell by cell. A tile is only built into empty cells, so construction never deletes liquid; removing a block
// keeps the machine and pore rules of erase(). Costs and reach are game rules applied by the caller.
#include "sandbox.hpp"
#include <algorithm>
#include <vector>
namespace ecologist {
namespace {
bool buildable_block(int b) {
    switch (b) {
    case B_DIRT: case B_STONE: case B_WOOD: case B_BRICK: case B_GLASS: case B_METAL: case B_COPPER: case B_CLAY:
    case B_SAND: case B_BASALT: case B_WOOL: case B_POROUS: case B_LIMESTONE: case B_ROOF:
        return true;
    default: return false;
    }
}
} // namespace

// Returns the number of cells changed (0 when nothing could be built or removed).
int Sandbox::build(World &w, Grains &g, int x, int y, int code) {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height)
        return 0;
    const int k = y * w.width + x, b = w.solid[k];
    // Pipes, valves and pumps (M2) are single cells, built and removed one at a time.
    if (code == BUILD_REMOVE && (b == B_PIPE || b == B_VALVE || b == B_FILTER || b == B_PUMP_IN || b == B_PUMP_OUT)) {
        erase(w, k);
        w.solid[k] = 0;
        w.wake(k);
        return 1;
    }
    if (code == BUILD_PIPE || code == BUILD_VALVE || code == BUILD_PUMP) {
        if (code != BUILD_PUMP && (w.solid[k] || w.liq[k] || (back[k] & BACK_DOOR_OPEN)))
            return 0;
        if (code == BUILD_PIPE) {
            g.erase_cell(x, y);
            w.solid[k] = B_PIPE;
            held[k] = 255;
            back[k] &= ~BACK_LADDER;
            w.wake(k);
            return 1;
        }
        if (code == BUILD_VALVE && !use(w, x, y, -B_VALVE, 1, &g))
            return 0;
        if (code == BUILD_PUMP && (b == B_PUMP_IN || b == B_PUMP_OUT || !use(w, x, y, 301, 1, &g)))
            return 0;
        back[k] &= ~BACK_LADDER;
        return 1;
    }
    const int tx = x & ~1, ty = y & ~1;
    auto inside = [&](int cx, int cy) { return cx >= 0 && cy >= 0 && cx < w.width && cy < w.height; };
    std::vector<int> cells;
    if (code == BUILD_DOOR) { // one tile wide, three tiles tall, standing on the tile under the cursor
        for (int cy = ty - 4; cy < ty + 2; cy++)
            for (int cx = tx; cx < tx + 2; cx++) {
                if (!inside(cx, cy))
                    return 0;
                cells.push_back(cy * w.width + cx);
            }
    } else
        for (int cy = ty; cy < ty + 2; cy++)
            for (int cx = tx; cx < tx + 2; cx++)
                if (inside(cx, cy))
                    cells.push_back(cy * w.width + cx);
    int changed = 0;
    if (code == BUILD_REMOVE) {
        // A solid tile first, then a ladder, then the background wall behind it.
        bool any_solid = false;
        for (int k : cells)
            any_solid = any_solid || (w.solid[k] && w.solid[k] != B_EQUIPMENT);
        for (int k : cells) {
            if (any_solid) {
                if (!w.solid[k] || DEVICE_KIND(w.solid[k]) || w.solid[k] == B_PUMP_IN || w.solid[k] == B_PUMP_OUT ||
                    w.solid[k] == B_EQUIPMENT)
                    continue;
                FluidBuffer water;
                if (auto p = pores.find(k); p != pores.end())
                    water = p->second;
                erase(w, k);
                g.erase_cell(k % w.width, k / w.width);
                w.solid[k] = 0;
                if (water.amount >= 1) // soaked soil gives back its water rather than losing it
                    put(w, water, k, int(water.amount));
                w.wake(k);
                changed++;
            }
        }
        if (any_solid)
            return changed;
        for (int k : cells)
            if (back[k] & BACK_LADDER) {
                back[k] &= ~BACK_LADDER;
                changed++;
            }
        if (changed)
            return changed;
        code = BUILD_REMOVE_BACK;
    }
    if (code == BUILD_REMOVE_BACK) {
        for (int k : cells)
            if (back[k] & BACK_WALL) {
                back[k] &= ~BACK_WALL;
                changed++;
            }
        return changed;
    }
    if (code > BUILD_BACK_KIND && code <= BUILD_BACK_KIND + 15) {
        const std::uint8_t wall = std::uint8_t(code - BUILD_BACK_KIND);
        for (int k : cells)
            if ((back[k] & BACK_WALL) != wall) {
                back[k] = (back[k] & ~BACK_WALL) | wall;
                changed++;
            }
        return changed;
    }
    if (code == BUILD_BACK_WOOD || code == BUILD_BACK_BRICK || code == BUILD_BACK_PLASTER) {
        const std::uint8_t wall = code == BUILD_BACK_WOOD ? WALL_WOOD : code == BUILD_BACK_BRICK ? WALL_BRICK : WALL_PLASTER;
        for (int k : cells)
            if (!(back[k] & BACK_WALL)) {
                back[k] = (back[k] & ~BACK_WALL) | wall;
                changed++;
            }
        return changed;
    }
    if (code == BUILD_LADDER) {
        for (int k : cells)
            if (!w.solid[k] && !(back[k] & BACK_LADDER)) {
                back[k] |= BACK_LADDER;
                changed++;
            }
        return changed;
    }
    const int block = code == BUILD_DOOR ? B_DOOR : -code;
    if (code != BUILD_DOOR && (code >= 0 || !buildable_block(block)))
        return 0;
    for (int k : cells) // only into empty cells: no liquid is displaced or destroyed
        if (w.solid[k] || w.liq[k] || (back[k] & BACK_DOOR_OPEN))
            return 0;
    for (int k : cells) {
        g.erase_cell(k % w.width, k / w.width);
        w.solid[k] = std::uint8_t(block);
        held[k] = 255;
        back[k] &= ~BACK_LADDER;
        if (block == B_DIRT || block == B_SAND)
            w.under[k] = 1;
        w.wake(k);
        changed++;
    }
    return changed;
}

// Opens a closed door (every connected door cell) or closes an open one. Closing fails while liquid stands in it.
bool Sandbox::toggle_door(World &w, int x, int y, bool closing_allowed) {
    if (x < 0 || y < 0 || x >= w.width || y >= w.height)
        return false;
    const int start = y * w.width + x;
    const bool opening = w.solid[start] == B_DOOR;
    if (!opening && !(back[start] & BACK_DOOR_OPEN))
        return false;
    std::vector<int> door{start}, seen_cells{start};
    for (std::size_t i = 0; i < door.size() && door.size() < 64; i++)
        for (int d = 0; d < 4; d++) {
            const int n = neighbor(w, door[i], d);
            if (n < 0 || std::find(seen_cells.begin(), seen_cells.end(), n) != seen_cells.end())
                continue;
            seen_cells.push_back(n);
            if (opening ? w.solid[n] == B_DOOR : bool(back[n] & BACK_DOOR_OPEN))
                door.push_back(n);
        }
    if (!opening) {
        if (!closing_allowed)
            return false;
        for (int k : door)
            if (w.liq[k] || w.solid[k])
                return false;
    }
    for (int k : door) {
        if (opening) {
            w.solid[k] = 0;
            back[k] |= BACK_DOOR_OPEN;
        } else {
            w.solid[k] = B_DOOR;
            back[k] &= ~BACK_DOOR_OPEN;
        }
        if (!fire.empty())
            fire[k] = 0;
        w.wake(k);
        stir(w, k); // the room's air meets the outside again
    }
    return true;
}
} // namespace ecologist
