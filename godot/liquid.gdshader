shader_type canvas_item;
render_mode unshaded;
#include "res://generated/palettes.gdshaderinc"
#include "res://generated/blocks.gdshaderinc"

uniform sampler2D world_data : filter_nearest, repeat_disable;
uniform sampler2D grain_data : filter_nearest, repeat_disable;
uniform sampler2D solution_data : filter_nearest, repeat_disable;
uniform bool has_solutions = false;
uniform bool has_grains = false;
uniform ivec2 world_size = ivec2(512, 128);
uniform float animation_time = 0.0;
uniform uint world_seed = 7u;
uniform vec2 view_origin = vec2(0.0);
uniform float sunlight : hint_range(0.0, 1.0) = 1.0;
// Controlled backdrop for comparisons with the HTML drawBody/drawStream functions.
uniform bool reference_mode = false;
uniform vec3 reference_color = vec3(0.12, 0.18, 0.25);

bool in_world(ivec2 p) { return all(greaterThanEqual(p, ivec2(0))) && all(lessThan(p, world_size)); }
ivec4 cell_at(ivec2 p) {
    if (!in_world(p)) { return ivec4(0); }
    return ivec4(round(texelFetch(world_data, p, 0) * 255.0));
}
ivec4 shape_at(ivec2 p) {
    if (!in_world(p)) { return ivec4(0); }
    return ivec4(round(texelFetch(world_data, p + ivec2(0, world_size.y), 0) * 255.0));
}
float world_hash(ivec2 p) {
    uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u + world_seed * 2246822519u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    return float(h ^ (h >> 16u)) / 4294967296.0;
}
float world_noise(vec2 p, int salt) {
    ivec2 i = ivec2(floor(p)); vec2 f = fract(p); vec2 smooth_f = f * f * (3.0 - 2.0 * f);
    float a = world_hash(i + ivec2(salt, 0)), b = world_hash(i + ivec2(salt + 1, 0));
    float c = world_hash(i + ivec2(salt, 1)), d = world_hash(i + ivec2(salt + 1, 1));
    return a + (b-a)*smooth_f.x + (c-a)*smooth_f.y + (a-b-c+d)*smooth_f.x*smooth_f.y;
}
vec3 blend_pixel(vec3 behind, vec3 color, float opacity) {
    return floor(mix(behind, color, opacity) * 255.0 + 0.00001) / 255.0;
}
bool solid_at(ivec2 p) {
    if (p.y < 0) { return false; }
    return !in_world(p) || cell_at(p).b != 0;
}
vec3 backdrop(ivec2 pixel, ivec4 cell) {
    if ((cell.a & 1) != 0) {
        ivec2 p = (pixel - ivec2(floor(view_origin * 0.35 + 0.5))) & ivec2(511);
        float r = world_hash(ivec2(p.x >> 1, (p.y >> 1) + 7000));
        vec3 color = CAVE_COLORS[r < 0.45 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3];
        if (world_noise(vec2(p) / vec2(40.0, 28.0), 5100) > 0.62) { color = floor(color * 0.82 * 255.0) / 255.0; }
        return color;
    }
    float t = min(1.0, float(pixel.y) / (float(world_size.y) * 8.0 * 0.42)) * 3.0;
    int i = min(2, int(t));
    vec3 color = floor(mix(SKY_COLORS[i], SKY_COLORS[i+1], t-float(i)) * 255.0 + 0.5) / 255.0;
    // The browser deliberately omits hills behind liquid cells.
    if (cell.g == 0) {
        for (int layer = 0; layer < 2; layer++) {
            vec4 hill = HILL_SHAPE[layer];
            float lx = float(pixel.x) - view_origin.x * (1.0-hill.x);
            float n = world_noise(vec2(lx/hill.w, 0.0), HILL_SALT[layer])*0.7 + world_noise(vec2(lx/(hill.w/3.0), 3.0), HILL_SALT[layer]+1)*0.3;
            int top = int(floor(hill.y-hill.z*n+0.5)) + int(floor(view_origin.y*(1.0-hill.x)+0.5));
            if (pixel.y >= top) { color = pixel.y == top ? HILL_RIM[layer] : HILL_BODY[layer]; }
        }
    }
    return color;
}
vec3 base_pixel(ivec2 pixel) {
    if (reference_mode) { return reference_color; }
    ivec2 tile = ivec2(floor(vec2(pixel)/8.0));
    if (!in_world(tile)) { return vec3(0.055, 0.085, 0.10); }
    ivec4 cell = cell_at(tile); ivec2 local = pixel - tile*8;
    vec3 bg = backdrop(pixel, cell);
    int material = cell.b;
    if (material == 0) { return bg; }
    if (material == 22) { return blend_pixel(bg,vec3(207.0,238.0,246.0)/255.0,0.22); }
    if (material == 25 || material == 26 || material == 27) { return bg; }
    bool up = !solid_at(tile+ivec2(0,-1)), down = !solid_at(tile+ivec2(0,1));
    bool left = !solid_at(tile+ivec2(-1,0)), right = !solid_at(tile+ivec2(1,0));
    bool corner = (local.x == 0 && local.y == 0 && up && left) || (local.x == 7 && local.y == 0 && up && right) || (local.x == 0 && local.y == 7 && down && left) || (local.x == 7 && local.y == 7 && down && right);
    if (corner) { return bg; }
    bool edge = (up && local.y == 0) || (down && local.y == 7) || (left && local.x == 0) || (right && local.x == 7);
    if (material == 1 && up && (cell.a & 1) == 0) {
        int grass_depth = 2 + (world_hash(ivec2(pixel.x,77)) > 0.55 ? 1 : 0);
        if (local.y == 0) { return GRASS_COLORS[3]; }
        if (local.y < grass_depth) {
            if (edge) { return GRASS_COLORS[3]; }
            return GRASS_COLORS[local.y == 1 && world_hash(ivec2(pixel.x,78)) > 0.6 ? 2 : world_hash(ivec2(pixel.x >> 1,pixel.y)) > 0.5 ? 0 : 1];
        }
    }
    int shade;
    if (edge) { shade = 4; }
    else if (up && local.y == 1 && !(material == 1 && (cell.a & 1) == 0)) { shade = 5; }
    else if (down && local.y == 6) { shade = 3; }
    else {
        float r = world_hash(ivec2((pixel.x >> 1) + material*977, pixel.y >> 1));
        shade = r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3;
    }
    if (material == 18 && local.y % 4 == 3) { shade = 3; }
    if (material == 23 && (local.y % 4 == 3 || (local.x + (local.y / 4)*4) % 8 == 7)) { shade = 4; }
    if ((material == 24 || material == 51 || material >= 75 && material <= 78) && local.x == 1 && local.y == 1) { shade = 5; }
    return material == 1 ? DIRT_COLORS[shade] : material == 2 ? STONE_COLORS[shade] : BLOCK_COLORS[material*6+shade];
}
vec4 palette_at(ivec2 tile,int type,int layer) {
    vec4 color = layer == 0 ? LIQ_SURFACE[type] : layer == 1 ? LIQ_BODY[type] : LIQ_DEEP[type];
    if (!has_solutions || !in_world(tile)) { return color; }
    vec4 tint = texelFetch(solution_data,tile,0);
    vec3 rgb = layer == 0 ? min(vec3(1.0),tint.rgb*0.6+vec3(110.0/255.0)) : tint.rgb*(layer == 1 ? 0.85 : 0.45);
    color.rgb = mix(color.rgb,rgb,tint.a);
    if (layer > 0) { color.a = mix(color.a,layer == 1 ? 0.85 : 0.92,tint.a); }
    return color;
}
vec3 stream_pixel(vec3 behind, ivec2 pixel, int local_x, int type, int amount, int align_side) {
    int width = clamp(int(floor(float(amount)*8.0/255.0+0.5))+1, 2, 8);
    int x0 = align_side == 0 ? 0 : align_side == 2 ? 8-width : (8-width)/2;
    int i = local_x - x0;
    if (i < 0 || i >= width) { return behind; }
    vec4 params = LIQ_PARAMS[type];
    int offset = int(animation_time*48.0*params.y*params.x);
    // GLSL integer remainder with negative inputs is not portable across GL drivers.
    float remainder = mod(float(pixel.y-offset+i*3),7.0);
    bool streak = remainder < 0.5 || remainder > 6.5;
    vec4 body = palette_at(pixel/8,type,1);
    vec4 color = streak || (i == 0 && width > 2) ? palette_at(pixel/8,type,0) : i == width-1 && width > 2 ? palette_at(pixel/8,type,2) : vec4(body.rgb,min(1.0,body.a+0.12));
    return blend_pixel(behind, color.rgb, color.a);
}
vec3 liquid_pixel(vec3 behind, ivec2 tile, ivec2 pixel) {
    ivec4 cell = cell_at(tile);
    if (cell.g == 0) { return behind; }
    ivec4 shape = shape_at(tile);
    int type = cell.r; vec4 params = LIQ_PARAMS[type];
    int gravity = int(params.x), height = shape.b, depth = shape.a;
    ivec2 local = pixel - tile*8;
    if (shape.r == 1) {
        if (local.y < 0 || local.y >= 8) { return behind; }
        return stream_pixel(behind,pixel,local.x,type,cell.g,shape.g);
    }
    ivec2 prev = tile-ivec2(0,gravity); ivec4 previous = cell_at(prev), previous_shape = shape_at(prev);
    bool surface = depth == 0;
    bool prev_fall = previous.g > 0 && previous.r == type && previous_shape.r == 1;
    if (prev_fall && local.y >= 0 && local.y < 8 && (gravity > 0 ? local.y < 8-height : local.y >= height)) {
        behind = stream_pixel(behind,pixel,local.x,type,previous.g,previous_shape.g);
    }
    int top = 8-height;
    if (surface && height >= 2) {
        float wave = sin(float(pixel.x)*0.45+animation_time*2.4*params.y)+0.6*sin(float(pixel.x)*0.13-animation_time*1.3*params.y+float(tile.y));
        bool can_rise = in_world(prev) && previous.b == 0 && previous.g == 0;
        if (wave > 1.05 && (height < 8 || can_rise)) { top--; }
        else if (wave < -1.1) { top++; }
    }
    int ly = gravity > 0 ? local.y : 7-local.y;
    if (ly < top || ly >= 8) { return behind; }
    int d = ly-top;
    vec4 surf = palette_at(tile,type,0), body = palette_at(tile,type,1), deep = palette_at(tile,type,2);
    float wx = float(pixel.x), wy = float(pixel.y), time = animation_time, flow = params.y;
    if (surface && d == 0 && type == 9) {
        float hue = wx*0.15+time*0.6;
        return blend_pixel(behind,(vec3(128.0)+110.0*sin(vec3(hue,hue+2.1,hue+4.2)))/255.0,0.7);
    }
    if (surface && d == 0) {
        vec3 result = blend_pixel(behind,surf.rgb,surf.a);
        if (cell.a >= 128 && world_hash(ivec2(pixel.x >> 1,int(time*2.0))) > 0.55) { result = blend_pixel(result,vec3(1.0),0.45); }
        return result;
    }
    if (surface && d == 1) {
        return blend_pixel(behind,floor((surf.rgb+body.rgb)*255.0/2.0)/255.0,(surf.a+body.a)/2.0);
    }
    float f = min(1.0,float(depth*8+ly)/56.0);
    vec4 color = mix(body,deep,f); float shine = 0.0;
    if (params.z > 0.5) {
        color.a *= 0.8+0.2*sin(wx*0.06+time*0.5*flow+sin(wy*0.08+time*0.3)*1.5);
    } else if (type == 2) {
        shine = (sin(wx*0.23+time*0.9+sin(wy*0.31-time*0.6)*2.5)*sin(wy*0.27+time*0.5+sin(wx*0.17+time*0.8)*2.0)-0.4)*2.2;
    } else if (type == 5) {
        float mirror = sin(wx*0.11+wy*0.05+time*0.5)+0.5*sin(wx*0.37-time*0.9);
        shine = mirror > 0.9 ? 0.75 : mirror < -0.9 ? -0.35 : 0.0;
    } else if (type == 6 || type == 10) {
        float hb = world_hash(ivec2(pixel.x,999));
        if (hb > 0.8 && mod(wy+time*18.0*(0.5+hb),float(10+int(hb*40.0))) < 1.0) { shine = 0.95; }
    } else if (type == 14) {
        float hb = world_hash(ivec2(pixel.x,pixel.y+int(time*1.5+world_hash(pixel)*4.0)*57));
        shine = hb > 0.82 ? 0.9 : hb < 0.08 ? -0.5 : 0.0;
        if (shine < 0.0) { color.rgb = mix(color.rgb,deep.rgb,0.5); shine = 0.0; }
    } else if (type == 4 || type == 11 || type == 13) {
        float hs = world_hash(pixel+ivec2(0,31));
        if (hs > 0.975) { shine = sin(time*3.0+hs*400.0)*0.9; }
        else if (((pixel.y+(pixel.x >> 3)) & 3) == 0) { shine = (sin(wx*0.17+time*0.9)-0.85)*2.5; }
    } else if (type == 7) {
        if (world_hash(pixel+ivec2(0,int(time*5.0)*131)) > 0.988) { shine = 1.0; }
        else if (((pixel.y+(pixel.x >> 3)) & 3) == 0) { shine = (sin(wx*0.17+sin(wy*0.5)*2.0+time*0.6)-0.8)*2.5; }
    } else if (((pixel.y+(pixel.x >> 3)) & 3) == 0) {
        shine = (sin(wx*0.17+sin(wy*0.5+time*0.8*flow)*2.0+time*1.4*flow)-0.8)*2.5;
    }
    if (shine > 0.0) { color.rgb = mix(color.rgb,surf.rgb,min(0.95,shine)); }
    else if (shine < 0.0 && type == 5) { color.rgb = mix(color.rgb,deep.rgb,-shine); }
    vec3 result = blend_pixel(behind,color.rgb,color.a);
    bool clear = gravity > 0 && params.w > 0.5 && (cell.a & 1) == 0;
    if (clear && surface && height >= 4 && d >= 2 && d < 8) {
        ivec2 reflected = ivec2(pixel.x+int(floor(sin(wy*0.9+time*3.0)*1.2+0.5)),tile.y*8+top-1-(d-2));
        if (reflected.x >= 0 && reflected.x < world_size.x*8 && reflected.y >= 0) {
            result = blend_pixel(result,base_pixel(reflected),0.3*(1.0-float(d-2)/6.0));
        }
    }
    if (clear && depth < 8 && tile.y < world_size.y-1 && cell_at(tile+ivec2(0,1)).b != 0 && ly >= 5) {
        float band = sin(wx*0.35+time*1.7+sin(wx*0.11-time*0.9)*2.0)+sin(wx*0.23-time*1.3);
        if (band > 0.9) {
            float strength = 0.55*sunlight*(1.0-float(depth)/8.0)*float(ly-4)/3.0;
            result = blend_pixel(result,vec3(1.0,1.0,235.0/255.0),strength*min(1.0,(band-0.9)/0.6));
        }
    }
    return result;
}
void fragment() {
    ivec2 pixel = ivec2(floor(UV*vec2(world_size)*8.0));
    ivec2 tile = pixel/8;
    vec3 color = base_pixel(pixel);
    // Preserve HTML scan order and the one-pixel crests crossing cell boundaries.
    if (pixel.y%8 == 0) { color = liquid_pixel(color,tile+ivec2(0,-1),pixel); }
    color = liquid_pixel(color,tile,pixel);
    if (pixel.y%8 == 7) { color = liquid_pixel(color,tile+ivec2(0,1),pixel); }
    if (has_grains && in_world(tile)) {
        int grain = int(round(texelFetch(grain_data, pixel, 0).r*255.0));
        if (grain > 0) {
            vec3 base = grain == 1 ? vec3(0.76,0.60,0.34) : grain == 2 ? vec3(1.0,0.94,0.77) : grain == 3 ? vec3(0.79,0.90,0.96) : grain == 4 ? vec3(0.95,0.98,1.0) : grain == 5 ? vec3(0.86,0.9,0.8) : grain == 6 ? vec3(0.4,0.4,0.38) : grain == 7 ? vec3(0.85,0.82,0.65) : grain == 8 ? vec3(0.68,0.34,0.13) : grain == 9 ? vec3(0.65,0.86,0.89) : grain == 10 ? vec3(0.17,0.18,0.2) : vec3(0.83,0.88,0.75);
            color = base*(0.81+world_hash(pixel)*0.19);
        }
    }
    COLOR = vec4(color,1.0);
}
