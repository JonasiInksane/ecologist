#pragma once
#include "world.hpp"

namespace ecologist {
// Prototype tunables: pixel grid, game carrier units, independent of rendering.
inline constexpr int GRAIN_SCALE=8, MAX_GRAINS=150000, MAX_FINE_PIXELS=16*1024*1024;
inline constexpr double GRAIN_AMOUNT=255.0/64.0, DISSOLVE_PER_TICK=0.5;
enum GrainKind { SAND=1, SUGAR_GRAIN=2, SALT_GRAIN=3 };
inline constexpr int GRAIN_KINDS=11;
struct Grain { int x,y,kind; double amount; double temperature=20; };
struct Grains {
    int width=0,height=0;
    std::vector<Grain> particles;
    std::vector<std::uint32_t> occupied;
    std::vector<std::uint8_t> image;
    void reset(const World& w);
    bool allocate(const World& w);
    bool add(const World& w,int x,int y,int kind,double amount=GRAIN_AMOUNT,double temperature=20);
    int paint(const World& w,int x,int y,int radius,int kind);
    void erase_cell(int x,int y);
    void step(World& w);
    void remove(std::size_t i);
    double mass(int kind) const;
    double sensible_energy() const;
    bool free(const World& w,int x,int y) const;
};
double saturation(int channel,double temperature);
double grain_capacity(int kind,double amount);
void chemistry_step(World& w,Grains& grains);
bool heat_brush(World& w,int x,int y,int radius,double delta);
}
