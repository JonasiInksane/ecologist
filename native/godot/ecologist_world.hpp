#pragma once
#include "../core/grains.hpp"
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

  protected:
    static void _bind_methods();

  public:
    bool setup(int width, int height, int seed);
    void reset_demo(int seed);
    void advance(int ticks);
    bool paint(int x, int y, int radius, int material);
    int paint_grains(int x, int y, int radius, int kind);
    bool heat(int x, int y, int radius, double delta);
    bool device_action(int x, int y, int tool, int liquid);
    bool wire_action(int x, int y);
    bool dye(int x, int y, int radius, int channel);
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
