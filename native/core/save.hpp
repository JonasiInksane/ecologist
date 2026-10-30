#pragma once
#include "player.hpp"
#include <string>

namespace ecologist {
// World saves (M0): one binary file holding the whole simulation, so a loaded world steps on exactly as
// the saved one would have. The format is little-endian and versioned; see docs/design/m0-foundations.md.
inline constexpr std::uint32_t SAVE_VERSION = 2; // 2 added equipment
bool save_world(const std::string &path, const World &w, const Grains &g, const Sandbox &s, const Player &p,
                std::string *error = nullptr);
bool load_world(const std::string &path, World &w, Grains &g, Sandbox &s, Player &p, std::string *error = nullptr);
}
