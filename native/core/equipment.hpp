#pragma once
#include "sandbox.hpp"
#include <string>

namespace ecologist {
// Kitchen and lab equipment (M1). Equipment stands in the world as B_EQUIPMENT cells, which hold liquids back but
// let the player walk in front of them. Vessels exchange matter and heat with the world through their open top:
// water poured or falling in is taken up, smoke rises out into the room, vapour vents outside, and heat leaks into
// the air above.
enum EquipmentKind { EQ_STOVE = 1, EQ_SINK, EQ_TABLE, EQ_SAUCEPAN, EQ_CANDY_MOLD, EQ_SALT_PAN, EQ_KINDS };
struct EquipmentSpec {
    const char *id;
    int width = 0, height = 0; // cells
    double capacity = 0;       // g of contents; 0 = not a vessel
    double body = 0;           // J/K of the vessel itself
    double loss = 0;           // W/K from the contents to the air above the open top
    double surface = 0;        // open surface, for evaporation below the boiling point
    bool support = false;      // other equipment can stand on it
};
inline constexpr double GRAMS_PER_UNIT = 10000.0 / 255.0; // one full cell is 10 L
inline constexpr double JOULES_PER_ENERGY = 10000.0;      // one world energy unit
inline constexpr double LATENT = 2257.0 * 0.25;           // the sim's quarter-strength latent heat, J/g
inline constexpr double STEAM_HIDDEN = LATENT + (4.18 - 2.0) * 100; // J/g a steam cell holds beyond capacity x temperature
inline constexpr double EQUIPMENT_TIME = 4;               // heating and cooling run 4x faster than real time
inline constexpr int STOVE_WATTS[] = {0, 600, 1200, 2000};
inline constexpr double SINK_BATH = 40, BATH_TEMPERATURE = 15; // W/K and °C of a cold-water bath in the sink

const EquipmentSpec &equipment_spec(int kind);
struct Product {
    std::string id, grade, note;
    double grams = 0;
};
int place_equipment(World &w, Grains &g, Sandbox &s, int kind, int x, int y, std::string *why = nullptr);
bool remove_equipment(World &w, Sandbox &s, int id, std::string *why = nullptr);
int move_equipment(World &w, Grains &g, Sandbox &s, int id, int x, int y, std::string *why = nullptr); // new id or -1
int equipment_at(const World &w, const Sandbox &s, int x, int y);
int resting_on(const World &w, const Sandbox &s, int id); // the equipment directly under another, or -1
void equipment_step(World &w, Grains &g, Sandbox &s);
double vessel_mass(const Vessel &v);
double vessel_capacity(const Vessel &v, double body); // J/K
double boiling_point(const Vessel &v);
std::string candy_stage(const Vessel &v);
bool vessel_add(Sandbox &s, int id, const std::string &ingredient, double grams, double temperature, std::string *why = nullptr);
double vessel_transfer(Sandbox &s, int from, int to, std::string *why = nullptr);
int vessel_spill(World &w, Sandbox &s, int id);
double vessel_discard(Sandbox &s, int id, bool keep_crystals);
Product vessel_collect(Sandbox &s, int id, std::string *why = nullptr);
} // namespace ecologist
