// Campaign light, shared by the world shader (cells) and the sprite shader (people, equipment, trucks, the player).
// lighting.gd sets these from the game clock: the outdoor light, the light in rooms (cells with a background wall),
// and up to 16 point lights (lamps after dark, flames). Lit pixels are multiplied by the sum, in soft bands.
uniform bool lit = false;
uniform vec3 ambient_light = vec3(1.0);
uniform vec3 room_light = vec3(1.0);
uniform int light_count = 0;
// x, y and radius in world pixels, then strength.
uniform vec4 light_spots[16];
uniform vec3 light_colors[16];

vec3 light_at(vec2 world, bool indoor) {
    vec3 light = indoor ? room_light : ambient_light;
    vec2 p = floor(world) + 0.5;
    for (int i = 0; i < 16; i++) {
        if (i >= light_count) { break; }
        vec4 spot = light_spots[i];
        float d = length(p - spot.xy);
        if (d < spot.z) {
            float f = 1.0 - d / spot.z;
            // five bands, like the pools of light in the reference paintings
            f = floor(f * f * 5.0 + 0.5) / 5.0;
            light += light_colors[i] * spot.w * f;
        }
    }
    return min(light, vec3(1.3));
}
