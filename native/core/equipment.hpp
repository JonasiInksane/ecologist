#pragma once
#include "sandbox.hpp"
#include <string>
#include <vector>

namespace ecologist {
// Kitchen and lab equipment (M1) and the logistics kit (M2). Equipment stands in the world as B_EQUIPMENT cells,
// which hold liquids back but let the player walk in front of them. Open vessels exchange matter and heat with
// the world through their open top: water poured or falling in is taken up, smoke rises out into the room, vapour
// vents outside, and heat leaks into the air above. Ports on a vessel's edge couple it to the world's pipes and
// pumps (docs/design/m2-logistics.md).
enum EquipmentKind {
    EQ_STOVE = 1, EQ_SINK, EQ_TABLE, EQ_SAUCEPAN, EQ_CANDY_MOLD, EQ_SALT_PAN,
    EQ_LAPTOP, EQ_DRUM, EQ_TOTE, EQ_COUPLING, EQ_KETTLE, EQ_CENTRIFUGE, EQ_KINDS
};
struct EquipmentSpec {
    const char *id;
    int width = 0, height = 0; // cells
    double capacity = 0;       // g of contents; 0 = not a vessel
    double body = 0;           // J/K of the vessel itself
    double loss = 0;           // W/K from the contents to the air above it
    double surface = 0;        // open surface, for evaporation below the boiling point
    bool support = false;      // other equipment can stand on it
    bool closed = false;       // a lid: nothing is taken in or evaporates through the top
    double aux = 0;            // g held by a second compartment (the centrifuge casing)
};
// A port is a fitting on one edge cell of a piece: a pipe whose end touches it from direction dir (0 up, 1 left,
// 2 right, 3 down, as Sandbox::neighbor) is coupled to the vessel, or to the second compartment when aux is set.
struct PortSpec {
    int dx = 0, dy = 0, dir = 0;
    bool aux = false;
};
struct PortRef {
    int id = -1, port = -1;
};
inline constexpr double GRAMS_PER_UNIT = 10000.0 / 255.0; // one full cell is 10 L
inline constexpr double JOULES_PER_ENERGY = 10000.0;      // one world energy unit
inline constexpr double LATENT = 2257.0 * 0.25;           // the sim's quarter-strength latent heat, J/g
inline constexpr double STEAM_HIDDEN = LATENT + (4.18 - 2.0) * 100; // J/g a steam cell holds beyond capacity x temperature
inline constexpr double EQUIPMENT_TIME = 4;               // heating and cooling run 4x faster than real time
inline constexpr int STOVE_WATTS[] = {0, 600, 1200, 2000};
inline constexpr int KETTLE_WATTS[] = {0, 2500, 10000, 30000}; // the kettle's own gas ring: simmer, medium, roaring
inline constexpr double PUMP_WATTS = 750, CENTRIFUGE_WATTS = 1500; // electricity, real time
inline constexpr double SINK_BATH = 40, BATH_TEMPERATURE = 15; // W/K and °C of a cold-water bath in the sink

const EquipmentSpec &equipment_spec(int kind);
const std::vector<PortSpec> &equipment_ports(int kind);
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
double vessel_ph(const Vessel &v);
std::string candy_stage(const Vessel &v);
bool vessel_add(Sandbox &s, int id, const std::string &ingredient, double grams, double temperature, std::string *why = nullptr);
double vessel_transfer(Sandbox &s, int from, int to, std::string *why = nullptr);
int vessel_spill(World &w, Sandbox &s, int id);
double vessel_discard(Sandbox &s, int id, bool keep_crystals);
Product vessel_collect(Sandbox &s, int id, std::string *why = nullptr);
// Pipes and pumps (sandbox.cpp) reach vessels through these. find_port: the port on equipment cell `cell` that
// faces the pipe or pump cell `from`. port_level: the liquid level the pipe network sees through the port, in its
// row x 256 units (smaller is higher), when the port can give liquid (source) or take it; a coupling the tanker is
// pumping into pushes at any height. port_take and port_put move whole units through the port and return them.
bool find_port(const World &w, const Sandbox &s, int cell, int from, PortRef &ref);
bool port_level(const World &w, const Sandbox &s, const PortRef &ref, bool source, int &level);
double port_salt(const Sandbox &s, const PortRef &ref);
int port_take(Sandbox &s, const PortRef &ref, FluidBuffer &b, int units);
int port_put(Sandbox &s, const PortRef &ref, FluidBuffer &b, int units);
} // namespace ecologist
