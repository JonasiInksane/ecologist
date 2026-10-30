shader_type canvas_item;
// Lights the sprites main.gd draws in the world (people, equipment, trucks, the player, pipes) and the props: by the
// room or outdoor light at the pixel, plus the lamps. Off in the sandbox.
#include "res://lighting.gdshaderinc"

uniform sampler2D room_data : filter_nearest, repeat_disable;
uniform ivec2 room_size = ivec2(512, 128);

varying vec2 world_position;

void vertex() {
    world_position = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}

void fragment() {
    if (lit) {
        ivec2 tile = ivec2(floor(world_position / 8.0));
        bool indoor = false;
        if (all(greaterThanEqual(tile, ivec2(0))) && all(lessThan(tile, room_size))) {
            indoor = (int(round(texelFetch(room_data, tile, 0).r * 255.0)) & 15) != 0;
        }
        COLOR.rgb *= light_at(world_position, indoor);
    }
}
