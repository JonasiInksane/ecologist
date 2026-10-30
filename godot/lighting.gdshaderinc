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
        vec2 off = p - spot.xy;
        // a negative strength is a pendant lamp: a pool spreading down to the floor, dim above the shade
        bool pool = spot.w < 0.0;
        if (pool) { off = off.y < 0.0 ? off * vec2(1.0, 2.6) : off * vec2(0.85, 0.62); }
        float d = length(off);
        if (d < spot.z) {
            float f = 1.0 - d / spot.z;
            // a smooth falloff in fine steps, so a lamp's pool fades into the wall as in the reference
            f = floor(f * f * 12.0 + 0.5) / 12.0;
            light += light_colors[i] * abs(spot.w) * f;
        }
    }
    return min(light, vec3(1.3));
}
