#pragma once
#include "../generated/materials.hpp"
#include <cstdint>
#include <vector>

namespace ecologist {
inline constexpr int CAPACITY = 255, AWAKE_TICKS = 60, MAX_CELLS = 1024 * 1024;
inline constexpr double DENSITY_GAP = 0.0004;
struct World {
    int width=0, height=0, chunk_width=0;
    std::uint32_t tick=0, rng=1;
    std::vector<std::uint8_t> solid, liq, typ, drop, awake, under;
    std::vector<std::uint32_t> stamp, flux;
    std::vector<float> temp, vel;
    std::vector<double> latent, sol;
    bool reset(int w, int h, std::uint32_t seed);
    void demo(std::uint32_t seed);
    void step();
    void wake(int k);
    void wake_all();
    bool paint(int x, int y, int radius, int material);
    double random();
    double volume() const;
    double dissolved_capacity(int k, double amount) const;
    double density(int k) const;
    void carry(int src, int dst, double amount, double had, double available);
    void swap_sol(int a, int b);
    int viscosity(int type, double temperature) const;
    std::vector<std::uint8_t> rgba() const;
};
}
