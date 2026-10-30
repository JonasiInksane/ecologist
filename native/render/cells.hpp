#pragma once
#include "../core/world.hpp"

namespace ecologist {
// Two RGBA8 planes: type/amount/solid/background+whitecap, then fall/alignment/height/depth.
// All presentation classification is read-only and independent of the simulation RNG.
std::vector<std::uint8_t> render_cells(const World& world);
}
