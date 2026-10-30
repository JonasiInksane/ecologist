#pragma once
#include "../core/equipment.hpp"
#include "../core/grains.hpp"
#include "../core/save.hpp"
#include "../core/sandbox.hpp"
#include "../core/world.hpp"
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/array.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>

namespace godot {
class EcologistWorld : public RefCounted {
    GDCLASS(EcologistWorld, RefCounted)
    ecologist::World simulation;
    ecologist::Grains grains;
    ecologist::Sandbox sandbox;
    ecologist::Player player;

  protected:
    static void _bind_methods();

  public:
    bool setup(int width, int height, int seed);
    void reset_demo(int seed);
    void setup_plot(int seed);
    void player_input(bool left, bool right, bool jump, bool up, bool down);
    Dictionary player_state() const;
    int build(int x, int y, int code);
    bool toggle_door(int x, int y);
    bool use_door_near_player();
    String save_world(const String &path) const;
    String load_world(const String &path);
    PackedByteArray back_data() const;
    Array equipment_kinds() const;
    Dictionary equipment_place(const String &kind, int x, int y);
    String equipment_remove(int id);
    Dictionary equipment_move(int id, int x, int y);
    int equipment_at(int x, int y) const;
    Array equipment_list() const;
    Dictionary equipment_info(int id) const;
    bool equipment_set(int id, int setting);
    String vessel_add(int id, const String &ingredient, double grams, double temperature);
    Dictionary vessel_pour(int from, int to);
    int vessel_spill(int id);
    double vessel_drain(int id, bool keep_crystals);
    Dictionary vessel_collect(int id);
    double budget(const String &key) const;
    void advance(int ticks);
    bool paint(int x, int y, int radius, int material);
    int paint_grains(int x, int y, int radius, int kind);
    bool heat(int x, int y, int radius, double delta);
    bool device_action(int x, int y, int tool, int liquid);
    bool wire_action(int x, int y);
    bool dye(int x, int y, int radius, int channel);
    bool ignite(int x, int y, int radius);
    void flow(bool pressure, bool momentum);
    PackedByteArray fire_data() const;
    void environment(double sunlight, double wind);
    Array device_data() const;
    PackedByteArray grain_pixels() const;
    PackedByteArray pixels() const;
    PackedByteArray render_data() const;
    PackedByteArray solution_data() const;
    Dictionary stats() const;
    Dictionary inspect(int x, int y) const;
};
} // namespace godot
