shader_type canvas_item;
render_mode unshaded;
#include "res://generated/palettes.gdshaderinc"
#include "res://generated/blocks.gdshaderinc"
#include "res://generated/campaign_palette.gdshaderinc"
#include "res://lighting.gdshaderinc"

uniform sampler2D world_data : filter_nearest, repeat_disable;
uniform sampler2D grain_data : filter_nearest, repeat_disable;
uniform sampler2D solution_data : filter_nearest, repeat_disable;
uniform bool has_solutions = false;
uniform bool has_grains = false;
uniform sampler2D fire_data : filter_nearest, repeat_disable;
uniform bool has_fire = false;
// Building layer (native back_data()): bits 0-3 background wall (1 wood, 2 brick), 0x20 open door, 0x40 ladder.
uniform sampler2D back_data : filter_nearest, repeat_disable;
uniform bool has_back = false;
uniform ivec2 world_size = ivec2(512, 128);
uniform float animation_time = 0.0;
uniform uint world_seed = 7u;
uniform vec2 view_origin = vec2(0.0);
uniform float sunlight : hint_range(0.0, 1.0) = 1.0;
// Stars in the open sky at night (campaign day and night; the lighting node darkens the sky itself).
uniform float stars : hint_range(0.0, 1.0) = 0.0;
// The campaign look (docs/design/art.md): textured ground and buildings in the palette, the open sky left clear for
// the backdrop node behind, and the campaign light. The sandbox keeps the browser's look.
uniform bool styled = false;
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
    bool open_sky = true;
    if (cell.g == 0) {
        for (int layer = 0; layer < 2; layer++) {
            vec4 hill = HILL_SHAPE[layer];
            float lx = float(pixel.x) - view_origin.x * (1.0-hill.x);
            float n = world_noise(vec2(lx/hill.w, 0.0), HILL_SALT[layer])*0.7 + world_noise(vec2(lx/(hill.w/3.0), 3.0), HILL_SALT[layer]+1)*0.3;
            int top = int(floor(hill.y-hill.z*n+0.5)) + int(floor(view_origin.y*(1.0-hill.x)+0.5));
            if (pixel.y >= top) { color = pixel.y == top ? HILL_RIM[layer] : HILL_BODY[layer]; open_sky = false; }
        }
    }
    if (stars > 0.0 && open_sky && cell.g == 0) {
        // Two-pixel stars fixed to the sky, drifting slowly with the view; a few twinkle.
        ivec2 p = (pixel - ivec2(floor(view_origin * 0.9 + 0.5))) >> 1;
        float r = world_hash(p + ivec2(0, 12000));
        if (r > 0.9965) {
            float twinkle = r > 0.9993 ? 0.6 + 0.4 * sin(animation_time * 2.3 + r * 900.0) : 1.0;
            color = mix(color, vec3(1.0, 0.98, 0.9), stars * twinkle);
        }
    }
    return color;
}
int back_at(ivec2 tile) {
    if (!has_back || !in_world(tile)) { return 0; }
    return int(round(texelFetch(back_data, tile, 0).r * 255.0));
}
// Walls behind rooms are darker than the blocks in front so a room reads as an interior.
vec3 back_wall_pixel(ivec2 pixel, int wall) {
    if (wall == 2) {
        int row = pixel.y / 4, shifted = pixel.x + (row % 2) * 4;
        bool mortar = pixel.y % 4 == 3 || shifted % 8 == 7;
        float r = world_hash(ivec2(shifted / 8, row + 9100));
        vec3 brick = BLOCK_COLORS[23*6 + (r < 0.45 ? 0 : r < 0.8 ? 1 : 3)];
        return floor((mortar ? vec3(0.16, 0.14, 0.13) : brick * 0.5) * 255.0) / 255.0;
    }
    int board = pixel.y / 4;
    float r = world_hash(ivec2((pixel.x + board * 13) >> 3, board + 9200));
    vec3 wood = BLOCK_COLORS[18*6 + (r < 0.4 ? 0 : r < 0.75 ? 1 : 2)];
    bool seam = pixel.y % 4 == 3 || (pixel.x + board * 11) % 24 == 0;
    return floor((seam ? wood * 0.34 : wood * 0.55) * 255.0) / 255.0;
}
// Ladders, open doors and the background wall, drawn wherever no solid block covers them.
vec3 back_pixel(vec3 bg, ivec2 pixel, int back) {
    if ((back & 15) != 0) { bg = back_wall_pixel(pixel, back & 15); }
    int lx = pixel.x % 16;
    if ((back & 32) != 0) {
        // the door swung open against its hinge side
        if (lx < 3) { bg = BLOCK_COLORS[18*6 + (lx == 0 ? 3 : 1)]; }
        else { bg = floor(bg * 0.85 * 255.0) / 255.0; }
    }
    if ((back & 64) != 0) {
        bool rail = lx == 2 || lx == 3 || lx == 12 || lx == 13;
        bool rung = (pixel.y % 6 == 2 || pixel.y % 6 == 3) && lx > 3 && lx < 12;
        if (rail) { bg = BLOCK_COLORS[18*6 + (lx == 2 || lx == 12 ? 2 : 1)]; }
        else if (rung) { bg = BLOCK_COLORS[18*6 + (pixel.y % 6 == 2 ? 2 : 3)]; }
    }
    return bg;
}
vec3 door_pixel(ivec2 pixel, ivec2 tile) {
    int lx = pixel.x % 16, top = tile.y;
    for (int i = 0; i < 6 && top > 0 && cell_at(ivec2(tile.x, top - 1)).b == 80; i++) { top--; }
    int ly = pixel.y - top * 8;
    bool frame = lx == 0 || lx == 15 || ly == 0 || cell_at(ivec2(tile.x, tile.y + 1)).b != 80 && pixel.y % 8 == 7;
    if (frame) { return BLOCK_COLORS[18*6 + 4]; }
    if (lx >= 11 && lx <= 12 && ly >= 24 && ly <= 26) { return vec3(0.83, 0.72, 0.38); }
    bool panel = (lx == 3 || lx == 12) && ly > 3 || ly == 4 || ly == 22 || ly == 42;
    float r = world_hash(ivec2(pixel.x / 4 + 300, pixel.y >> 2));
    return BLOCK_COLORS[18*6 + (panel ? 3 : r < 0.6 ? 0 : 1)];
}
vec3 base_pixel(ivec2 pixel) {
    if (reference_mode) { return reference_color; }
    ivec2 tile = ivec2(floor(vec2(pixel)/8.0));
    if (!in_world(tile)) { return vec3(0.055, 0.085, 0.10); }
    ivec4 cell = cell_at(tile); ivec2 local = pixel - tile*8;
    vec3 bg = backdrop(pixel, cell);
    int material = cell.b;
    int back = back_at(tile);
    if (back != 0 && (material == 0 || material == 22 || material == 25 || material == 26 || material == 27 || material == 81)) { bg = back_pixel(bg, pixel, back); }
    if (material == 80) { return door_pixel(pixel, tile); }
    if (material == 0) { return bg; }
    if (material == 22) { return blend_pixel(bg,vec3(207.0,238.0,246.0)/255.0,0.22); }
    // Pipes and valves draw as machines, and equipment (81) as sprites, over the background.
    if (material == 25 || material == 26 || material == 27 || material == 81) { return bg; }
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
vec3 sandbox_fragment(ivec2 pixel, ivec2 tile) {
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
    if (has_fire && in_world(tile)) {
        // 201-255: a flame, brightest at the base of its cell; 1-200: a hot solid's glow (native fire_data()).
        int heat = int(round(texelFetch(fire_data, tile, 0).r*255.0));
        ivec2 local = pixel - tile*8;
        if (heat > 200) {
            float flick = world_hash(ivec2(pixel.x, pixel.y+int(animation_time*14.0)*53+heat));
            float base = float(local.y)/7.0;
            color = mix(color, mix(vec3(1.0,0.32,0.05), vec3(1.0,0.88,0.42), flick*base), 0.45+0.45*flick*base);
        } else if (heat > 0) {
            float glow = float(heat)/200.0;
            color = mix(color, vec3(1.0,0.35+0.4*glow,0.1*glow), 0.25+0.5*glow);
        }
        // tongues of flame lick up into the open cell above a fire
        if (heat == 0 && tile.y+1 < world_size.y && cell_at(tile).b == 0) {
            int below = int(round(texelFetch(fire_data, tile+ivec2(0,1), 0).r*255.0));
            if (below > 200) {
                float tongue = world_hash(ivec2(pixel.x, int(animation_time*12.0)*71+below));
                if (float(7-local.y) < tongue*6.0-1.0) { color = mix(color, vec3(1.0,0.55,0.12), 0.7); }
            }
        }
    }
    return color;
}

// ---- The campaign look -------------------------------------------------------------------------------------------
int mat_at(ivec2 t) {
    if (!in_world(t)) { return t.y < 0 ? 0 : 2; }
    return cell_at(t).b;
}
// Surface soil: dirt with open air above that was never dug out from underground.
bool grassy(ivec2 t) {
    if (!in_world(t) || t.y < 1) { return false; }
    ivec4 cell = cell_at(t);
    return cell.b == 1 && (cell.a & 1) == 0 && mat_at(t + ivec2(0, -1)) == 0;
}
vec3 rock_pixel(ivec2 p, int darken) {
    // Cobbles: the nearest of jittered points six pixels apart; cracks where two are nearly as close.
    ivec2 c = ivec2(floor(vec2(p) / 9.0));
    float d1 = 99.0, d2 = 99.0; vec2 near = vec2(0.0); float tone = 0.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            ivec2 k = c + ivec2(i, j);
            vec2 point = vec2(k) * 9.0 + vec2(world_hash(k + ivec2(0, 7100)), world_hash(k + ivec2(0, 7200))) * 7.0 + 1.0;
            float d = length(vec2(p) + 0.5 - point);
            if (d < d1) { d2 = d1; d1 = d; near = point; tone = world_hash(k + ivec2(0, 7300)); }
            else if (d < d2) { d2 = d; }
        }
    }
    // packed stony earth: brown-black stones like the reference's deep ground, the odd grey one
    int shade = tone < 0.45 ? 1 : tone < 0.9 ? 2 : 3;
    if (d2 - d1 < 0.9) { return PAL_SOIL[0]; }
    if (d2 - d1 < 1.9 && float(p.y) + 0.5 < near.y) { shade += 1; }
    if (tone > 0.93) { return PAL_ROCK[clamp(shade - 1 - darken, 0, 5)]; }
    return PAL_SOIL[clamp(shade - darken, 0, 5)];
}
vec3 soil_pixel(ivec2 p, ivec2 t, ivec2 l) {
    // Dark earth (the dusk workshop reference): darker with depth, with big soft stones bedded in it.
    float depth = float(p.y - 800) / 18.0 + (world_noise(vec2(p) / vec2(7.0, 3.0), 4400) - 0.5) * 1.8;
    int tone = 2 - clamp(int(floor(depth)), 0, 1);
    float n = world_noise(vec2(p) / 4.0, 4100);
    if (n < 0.25) { tone -= 1; } else if (n > 0.85) { tone += 1; }
    vec3 color = PAL_SOIL[clamp(tone, 0, 5)];
    // stones: one jittered ellipse per 13 x 11 cell, lit from the top left, rimmed in the darkest soil
    ivec2 c = ivec2(floor(vec2(p) / vec2(13.0, 11.0)));
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            ivec2 k = c + ivec2(i, j);
            if (world_hash(k + ivec2(0, 5300)) > 0.55) { continue; }
            vec2 r = vec2(3.5 + world_hash(k + ivec2(0, 5400)) * 3.0, 3.0 + world_hash(k + ivec2(0, 5500)) * 2.0);
            vec2 centre = vec2(k) * vec2(13.0, 11.0) + vec2(6.5, 5.5) + (vec2(world_hash(k + ivec2(0, 5600)), world_hash(k + ivec2(0, 5700))) - 0.5) * vec2(5.0, 4.0);
            vec2 q = (vec2(p) + 0.5 - centre) / r;
            float e = dot(q, q);
            if (e <= 1.0) {
                int s = q.y < -0.4 && q.x < 0.2 ? 3 : q.y > 0.5 || q.x > 0.6 ? 1 : 2;
                if (world_hash(p + ivec2(0, 5750)) > 0.93) { s -= 1; }
                return PAL_SOIL[clamp(s + (tone > 1 ? 1 : 0), 0, 5)];
            }
            if (e <= 1.45 && (q.y > -0.2 || q.x > 0.4)) { return PAL_SOIL[0]; }
        }
    }
    // Roots hang from the grass into the two tiles below it.
    int surface_y = grassy(t) ? t.y : grassy(t + ivec2(0, -1)) ? t.y - 1 : grassy(t + ivec2(0, -2)) ? t.y - 2 : -1;
    if (surface_y >= 0) {
        ivec2 st = ivec2(t.x, surface_y);
        float r = world_hash(st + ivec2(0, 5800));
        if (r < 0.4) {
            int dy = p.y - surface_y * 8;
            int reach = 9 + int(world_hash(st + ivec2(0, 5900)) * 11.0);
            int x = 1 + int(r * 15.0) % 6 + int(floor(sin(float(dy) * 0.45 + r * 40.0) * 1.4 + 0.5));
            if (dy >= 3 && dy < reach && l.x == x) { return PAL_ROOT[dy > reach - 3 ? 0 : (dy % 3 == 0 ? 2 : 1)]; }
        }
    }
    return color;
}
vec3 grass_pixel(ivec2 p, ivec2 l, vec3 soil) {
    float h = world_hash(ivec2(p.x, 6000));
    // each column hangs its own length; neighbours share it in pairs so the blades read as blades
    int hang = 3 + int(world_hash(ivec2(p.x >> 1, 6040)) * 4.0) - (h > 0.8 ? 1 : 0);
    if (l.y == 0) { return PAL_LEAF[h > 0.55 ? 5 : 4]; }
    if (l.y == 1) { return PAL_LEAF[world_hash(p + ivec2(0, 6010)) > 0.5 ? 4 : 3]; }
    if (l.y == 2) { return PAL_LEAF[world_hash(p + ivec2(0, 6020)) > 0.6 ? 3 : 2]; }
    if (l.y < hang) { return PAL_LEAF[l.y == hang - 1 ? 1 : world_hash(p + ivec2(0, 6030)) > 0.5 ? 2 : 3]; }
    if (l.y == hang && world_hash(ivec2(p.x, 6050)) > 0.6) { return PAL_LEAF[0]; }
    return soil;
}
// Blades and the odd flower growing into the air cell above surface soil.
vec4 blade_pixel(ivec2 p, ivec2 l) {
    float h = world_hash(ivec2(p.x, 6100));
    int height = h < 0.25 ? 0 : 1 + int(world_hash(ivec2(p.x, 6200)) * 4.0);
    if (world_hash(ivec2(p.x >> 2, 6300)) < 0.3) { height = max(0, height - 2); }
    int top = 8 - height;
    if (l.y < top) { return vec4(0.0); }
    if (l.y == top) {
        float f = world_hash(ivec2(p.x, 6400));
        if (height >= 3 && f > 0.93) {
            vec3 petal = f > 0.98 ? PAL_PURPLE[4] : f > 0.96 ? PAL_GOLD[4] : PAL_WHITE[4];
            return vec4(petal, 1.0);
        }
        return vec4(PAL_LEAF[5], 1.0);
    }
    return vec4(PAL_LEAF[l.y == 7 ? 4 : (h > 0.6 ? 4 : 3)], 1.0);
}
vec3 wood_pixel(ivec2 p, ivec2 t, ivec2 l, bool up, bool down, bool left, bool right) {
    bool wl = mat_at(t + ivec2(-1, 0)) == 18, wr = mat_at(t + ivec2(1, 0)) == 18;
    bool wu = mat_at(t + ivec2(0, -1)) == 18, wd = mat_at(t + ivec2(0, 1)) == 18;
    bool outline = (!wu && l.y == 0) || (!wd && l.y == 7) || (!wl && l.x == 0) || (!wr && l.x == 7);
    if (outline) { return PAL_INK[1]; }
    if ((wu || wd) && !(wl && wr)) {
        // a post: a dark upright timber with long grain, lit on its left edge
        if (!wl && l.x == 1) { return PAL_WOOD[4]; }
        if (!wr && l.x == 6) { return PAL_WOOD[1]; }
        float g = world_hash(ivec2(p.x, (p.y + p.x * 5) >> 3) + ivec2(0, 6500));
        return PAL_WOOD[g > 0.82 ? 1 : g > 0.45 ? 2 : 3];
    }
    if (wu) {
        // under the floorboards: a slate slab with a pale top edge, the way the reference's floors are built
        if (l.y == 0) { return PAL_CONCRETE[2]; }
        if (l.y == 1) { return PAL_CONCRETE[1]; }
        float r = world_hash(ivec2(p.x >> 3, p.y >> 2) + ivec2(0, 6550));
        if ((p.x + (p.y >> 2) * 5) % 16 == 0) { return PAL_INK[2]; }
        return PAL_CONCRETE[r > 0.8 ? 1 : 0];
    }
    if (!up && down) {
        // a beam under the roof: heavy dark timber with a lit lower edge
        if (l.y == 6) { return PAL_WOOD[3]; }
        float g = world_hash(ivec2(p.x >> 2, p.y) + ivec2(0, 6580));
        if ((p.x % 24) == 0 && l.y > 1 && l.y < 6) { return PAL_INK[2]; }
        return PAL_WOOD[l.y == 1 ? 2 : g > 0.75 ? 1 : 2];
    }
    // floorboards: boards four pixels high, butt joints staggered from board to board
    int board = p.y >> 2;
    if (!wu && l.y == 1) { return PAL_WOOD[6]; }
    if ((p.y & 3) == 3) { return PAL_WOOD[1]; }
    int joint = (p.x + board * 11) % 20;
    if (joint == 0) { return PAL_WOOD[1]; }
    if ((joint == 2 || joint == 18) && (p.y & 3) == 1) { return PAL_WOOD[2]; }
    float r = world_hash(ivec2((p.x + board * 11) / 20, board) + ivec2(0, 6600));
    int tone = r < 0.35 ? 3 : r < 0.8 ? 4 : 5;
    if (world_hash(p + ivec2(0, 6700)) > 0.9) { tone -= 1; }
    return PAL_WOOD[tone];
}
// Roof shingles (weathered brown, as in the dusk workshop reference) in courses of four pixels; an exposed top corner over a step down is cut on the diagonal, so a
// roof that steps in a cell a row reads as a slope.
vec4 roof_pixel(ivec2 p, ivec2 t, ivec2 l, vec4 bg, bool up, bool down, bool left, bool right) {
    if (up && left && solid_at(t + ivec2(-1, 1))) {
        int d = l.y - (7 - l.x);
        if (d < 0) { return bg; }
        if (d == 0) { return vec4(PAL_SHINGLE[0], 1.0); }
        if (d == 1) { return vec4(PAL_SHINGLE[4], 1.0); }
    }
    if (up && right && solid_at(t + ivec2(1, 1))) {
        int d = l.y - l.x;
        if (d < 0) { return bg; }
        if (d == 0) { return vec4(PAL_SHINGLE[0], 1.0); }
        if (d == 1) { return vec4(PAL_SHINGLE[3], 1.0); }
    }
    if ((up && l.y == 0) || (down && l.y == 7) || (left && l.x == 0) || (right && l.x == 7)) { return vec4(PAL_SHINGLE[0], 1.0); }
    if (up && l.y == 1) { return vec4(PAL_SHINGLE[4], 1.0); }
    int course = p.y >> 2, ly = p.y & 3;
    int sx = p.x + (course & 1) * 2, lx = sx & 3;
    float r = world_hash(ivec2(sx >> 2, course) + ivec2(0, 7700));
    int base = r < 0.12 ? 2 : r > 0.88 ? 4 : 3;
    int tone = ly == 0 ? base : ly == 1 ? base - (lx == 3 ? 1 : 0) : ly == 2 ? base - 1 - (lx == 3 ? 1 : 0) : (lx == 0 || lx == 3 ? 0 : 1);
    if (ly == 0 && lx == 1) { tone = min(4, base + 1); }
    return vec4(PAL_SHINGLE[clamp(tone, 0, 4)], 1.0);
}
vec3 brick_pixel(ivec2 p, ivec2 t, ivec2 l, bool edge) {
    if (edge) { return PAL_INK[2]; }
    int row = p.y >> 2, shifted = p.x + (row & 1) * 4;
    if ((p.y & 3) == 3 || (shifted & 7) == 7) { return PAL_ROCK[2]; }
    float r = world_hash(ivec2(shifted >> 3, row) + ivec2(0, 6800));
    int tone = r < 0.4 ? 2 : r < 0.85 ? 3 : 4;
    if ((p.y & 3) == 0 && (shifted & 7) == 0) { tone += 1; }
    return PAL_BRICK[min(tone, 4)];
}
vec3 asphalt_pixel(ivec2 p, ivec2 t, ivec2 l, bool up) {
    // the curb where the road meets the yard
    if (mat_at(t + ivec2(-1, 0)) != 10 && l.x < 5 && t.y == 100) {
        if (l.y == 0 || l.x == 0) { return PAL_CONCRETE[l.y == 0 ? 5 : 2]; }
        return PAL_CONCRETE[l.x == 4 || l.y == 7 ? 2 : 4];
    }
    if (up && l.y == 0) { return PAL_ASPHALT[3]; }
    if (up && l.y == 1) { return PAL_ASPHALT[2]; }
    float r = world_hash(p + ivec2(0, 6900));
    return PAL_ASPHALT[r > 0.93 ? 3 : r > 0.55 ? 2 : r > 0.15 ? 1 : 0];
}
vec3 steel_pixel(ivec2 p, ivec2 l, bool edge) {
    if (edge) { return PAL_STEEL[0]; }
    if ((l.x == 1 || l.x == 6) && (l.y == 1 || l.y == 6)) { return PAL_STEEL[4]; }
    if (l.y == 1) { return PAL_STEEL[3]; }
    return PAL_STEEL[world_hash(ivec2(p.x >> 2, p.y) + ivec2(0, 7400)) > 0.8 ? 1 : 2];
}
vec3 styled_door(ivec2 pixel, ivec2 tile) {
    int lx = pixel.x % 16, top = tile.y;
    for (int i = 0; i < 6 && top > 0 && cell_at(ivec2(tile.x, top - 1)).b == 80; i++) { top--; }
    int ly = pixel.y - top * 8;
    bool bottom = cell_at(ivec2(tile.x, tile.y + 1)).b != 80 && pixel.y % 8 == 7;
    if (lx == 0 || lx == 15 || ly == 0 || bottom) { return PAL_WOOD[0]; }
    if (lx == 1 || ly == 1) { return PAL_WOOD[5]; }
    if (lx >= 11 && lx <= 12 && ly >= 24 && ly <= 25) { return PAL_GOLD[lx == 11 ? 4 : 2]; }
    bool panel = (lx == 3 || lx == 12) && ly > 3 && ly < 43 || ly == 4 || ly == 21 || ly == 42;
    if (panel) { return PAL_WOOD[2]; }
    bool inset = lx > 3 && lx < 12 && (ly > 4 && ly < 21 || ly > 21 && ly < 42);
    float g = world_hash(ivec2(pixel.x, pixel.y >> 2) + ivec2(0, 7500));
    return PAL_WOOD[inset ? (g > 0.75 ? 3 : 4) : (g > 0.75 ? 4 : 5)];
}
// Whether a cell frames the wall behind it: equipment (81) stands in front of the wall and doesn't.
bool frames_wall(ivec2 t) { return solid_at(t) && mat_at(t) != 81; }
// Walls behind rooms: wood boards, brick, or plaster (3).
vec3 styled_wall(ivec2 p, int wall) {
    if (wall == 2) {
        int row = p.y >> 2, shifted = p.x + (row & 1) * 4;
        if ((p.y & 3) == 3 || (shifted & 7) == 7) { return PAL_ROCK[1]; }
        float r = world_hash(ivec2(shifted >> 3, row) + ivec2(0, 9100));
        return PAL_BRICK[r < 0.45 ? 1 : r < 0.9 ? 2 : 3];
    }
    if (wall == 3) {
        // the reference's lamplit plaster over brick: soft amber with the courses showing through in places, a
        // timber post now and then, a beam under the ceiling and a skirting board over the floor
        ivec2 t = p >> 3, l = p - t * 8;
        bool ceiling = frames_wall(t + ivec2(0, -1)), floor_below = frames_wall(t + ivec2(0, 1));
        if (ceiling && l.y < 3) { return PAL_WOOD[l.y == 2 ? 1 : l.y == 0 ? 3 : 2]; }
        if (floor_below && l.y >= 6) { return PAL_WOOD[l.y == 6 ? 4 : 2]; }
        if (t.x % 12 == 5 && l.x >= 2 && l.x <= 5 && !floor_below) { return PAL_WOOD[l.x == 2 ? 4 : l.x == 5 ? 1 : (world_hash(ivec2(p.x, p.y >> 3) + ivec2(0, 9450)) > 0.8 ? 2 : 3)]; }
        float n = world_noise(vec2(p) / vec2(13.0, 8.0), 9300);
        float m = world_noise(vec2(p) / vec2(3.0, 2.0), 9310);
        int tone = n < 0.25 ? 4 : n > 0.78 ? 6 : 5;
        if (m > 0.85) { tone += 1; } else if (m < 0.12) { tone -= 1; }
        // large blocks under the plaster, their joints showing faintly where it has worn thin
        int row = p.y / 6, bx = p.x + (row & 1) * 7;
        bool joint = p.y % 6 == 5 || bx % 14 == 13;
        float thin = world_noise(vec2(p) / vec2(16.0, 10.0), 9320);
        if (joint && thin > 0.62) { tone -= 1; }
        if (!joint && thin > 0.8 && world_hash(ivec2(bx / 14, row) + ivec2(0, 9330)) > 0.7) { tone -= 1; }
        if (world_hash(p + ivec2(0, 9400)) > 0.985) { tone -= 1; }
        // the corner under the beam and beside the posts sits in shade
        if (ceiling && l.y < 5) { tone -= 1; }
        if (t.x % 12 == 5 && (l.x == 1 || l.x == 6) || t.x % 12 == 4 && l.x == 7 || t.x % 12 == 6 && l.x == 0) { tone -= 1; }
        if (frames_wall(t + ivec2(-1, 0)) && l.x < 2 || frames_wall(t + ivec2(1, 0)) && l.x > 5) { tone -= 1; }
        return PAL_ROOM[clamp(tone, 0, 6)];
    }
    // boards running up the wall
    int board = p.x / 6;
    if (p.x % 6 == 5) { return PAL_WOOD[1]; }
    int joint = (p.y + board * 13) % 28;
    if (joint == 0) { return PAL_WOOD[1]; }
    float r = world_hash(ivec2(board, (p.y + board * 13) / 28) + ivec2(0, 9200));
    float g = world_hash(ivec2(p.x, p.y >> 2) + ivec2(0, 9250));
    return PAL_WOOD[(r < 0.4 ? 2 : 3) + (g > 0.85 ? 1 : 0)];
}
// Ladders and open doors over the wall (or the open air: alpha 0 between the rails).
vec4 styled_back(vec4 bg, ivec2 p, int back) {
    if ((back & 15) != 0) { bg = vec4(styled_wall(p, back & 15), 1.0); }
    int lx = p.x % 16;
    if ((back & 32) != 0) {
        if (lx < 3) { bg = vec4(PAL_WOOD[lx == 0 ? 0 : 3], 1.0); }
        else if (bg.a > 0.0) { bg.rgb *= 0.85; }
    }
    if ((back & 64) != 0) {
        bool rail = lx == 2 || lx == 3 || lx == 12 || lx == 13;
        bool rung = (p.y % 6 == 2 || p.y % 6 == 3) && lx > 3 && lx < 12;
        if (rail) { bg = vec4(PAL_WOOD[lx == 2 || lx == 12 ? 5 : 3], 1.0); }
        else if (rung) { bg = vec4(PAL_WOOD[p.y % 6 == 2 ? 5 : 2], 1.0); }
        else if (lx == 4 || lx == 14) { if (bg.a > 0.0) { bg.rgb *= 0.7; } }
    }
    return bg;
}
// The cell itself, before liquids: alpha 0 where the open sky shows through to the backdrop.
vec4 styled_base(ivec2 pixel) {
    ivec2 tile = pixel >> 3;
    if (!in_world(tile)) { return vec4(PAL_SOIL[0], 1.0); }
    ivec4 cell = cell_at(tile); ivec2 local = pixel - tile * 8;
    int material = cell.b;
    int back = back_at(tile);
    vec4 bg = vec4(0.0);
    // (the surface row has no underground flag, but the row under it does)
    bool dug_surface = material == 0 && (cell.a & 1) == 0 && tile.y + 1 < world_size.y && (cell_at(tile + ivec2(0, 1)).a & 1) != 0;
    if ((cell.a & 1) != 0 || dug_surface) {
        // dug out underground: the dark soil behind
        float n = world_noise(vec2(pixel) / 4.0, 9500);
        bg = vec4(PAL_SOIL[n < 0.35 ? 0 : 1], 1.0);
        if (world_hash(tile + ivec2(0, 9600)) < 0.2 && world_hash(pixel + ivec2(0, 9700)) > 0.6) { bg.rgb = PAL_SOIL[2]; }
    } else if (material == 0 && cell.g == 0 && grassy(tile + ivec2(0, 1)) && back == 0) {
        bg = blade_pixel(pixel, local);
    }
    if (back != 0 && (material == 0 || material == 22 || material == 25 || material == 26 || material == 27 || material == 81)) { bg = styled_back(bg, pixel, back); }
    if (material == 80) { return vec4(styled_door(pixel, tile), 1.0); }
    if (material == 0 || material == 25 || material == 26 || material == 27 || material == 81) { return bg; }
    if (material == 22) {
        // a window: a two-pixel timber frame round the glass and glazing bars between the cells, so the panes read
        // as small square lights like the reference's windows
        bool gu = mat_at(tile + ivec2(0, -1)) == 22, gd = mat_at(tile + ivec2(0, 1)) == 22;
        bool gl = mat_at(tile + ivec2(-1, 0)) == 22, gr = mat_at(tile + ivec2(1, 0)) == 22;
        if (!gu && local.y == 0 || !gd && local.y == 7 || !gl && local.x == 0 || !gr && local.x == 7) { return vec4(PAL_WOOD[1], 1.0); }
        if (!gu && local.y == 1 || !gl && local.x == 1) { return vec4(PAL_WOOD[4], 1.0); }
        if (!gd && local.y == 6 || !gr && local.x == 6) { return vec4(PAL_WOOD[2], 1.0); }
        if (gr && local.x == 7 || gd && local.y == 7) { return vec4(PAL_WOOD[3], 1.0); }
        bool glint = (pixel.x + pixel.y) % 13 == 0 || (pixel.x + pixel.y) % 13 == 2;
        vec3 tint = glint ? PAL_WHITE[4] : PAL_SKY[4];
        float a = glint ? 0.55 : 0.22;
        if (bg.a == 0.0) { return vec4(tint, a); }
        return vec4(mix(bg.rgb, tint, a), 1.0);
    }
    bool up = !solid_at(tile + ivec2(0, -1)), down = !solid_at(tile + ivec2(0, 1));
    bool left = !solid_at(tile + ivec2(-1, 0)), right = !solid_at(tile + ivec2(1, 0));
    if (material == 82) { return roof_pixel(pixel, tile, local, bg, up, down, left, right); }
    bool corner = (local.x == 0 && local.y == 0 && up && left) || (local.x == 7 && local.y == 0 && up && right) || (local.x == 0 && local.y == 7 && down && left) || (local.x == 7 && local.y == 7 && down && right);
    if (corner) { return bg; }
    bool edge = (up && local.y == 0) || (down && local.y == 7) || (left && local.x == 0) || (right && local.x == 7);
    if (material == 1) {
        // the soil gives way to rock in a ragged line
        if (mat_at(tile + ivec2(0, 1)) == 2 && local.y >= 5 + int(world_noise(vec2(float(pixel.x), 0.0) / 3.0, 7600) * 3.0)) { return vec4(rock_pixel(pixel, 0), 1.0); }
        vec3 soil = soil_pixel(pixel, tile, local);
        if (grassy(tile)) { return vec4(grass_pixel(pixel, local, soil), 1.0); }
        if (edge) { return vec4(PAL_SOIL[0], 1.0); }
        if (up && local.y == 1) { return vec4(PAL_SOIL[5], 1.0); }
        return vec4(soil, 1.0);
    }
    if (material == 2) {
        if (edge) { return vec4(PAL_SOIL[0], 1.0); }
        return vec4(rock_pixel(pixel, pixel.y > 900 ? 1 : 0), 1.0);
    }
    if (material == 10) { return vec4(asphalt_pixel(pixel, tile, local, up), 1.0); }
    if (material == 18) { return vec4(wood_pixel(pixel, tile, local, up, down, left, right), 1.0); }
    if (material == 23) { return vec4(brick_pixel(pixel, tile, local, edge), 1.0); }
    if (material == 24) { return vec4(steel_pixel(pixel, local, edge), 1.0); }
    // anything else keeps the sandbox colours, outlined
    if (edge) { return vec4(PAL_INK[1], 1.0); }
    float r = world_hash(ivec2((pixel.x >> 1) + material * 977, pixel.y >> 1));
    return vec4(BLOCK_COLORS[material * 6 + (r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3)], 1.0);
}
// Rooms darken toward their walls and ceiling, as in the reference: how far the nearest solid cell is to the left,
// the right or above, within two cells.
bool room_open(ivec2 t) { return (back_at(t) & 15) != 0 && !frames_wall(t); }
float wall_gap(ivec2 tile, ivec2 dir, int local) {
    if (solid_at(tile + dir) && mat_at(tile + dir) != 81) { return float(local); }
    if (solid_at(tile + dir * 2) && mat_at(tile + dir * 2) != 81) { return float(local + 8); }
    return 16.0;
}
float room_shade(ivec2 pixel, ivec2 tile) {
    ivec2 l = pixel - tile * 8;
    float d = min(min(wall_gap(tile, ivec2(-1, 0), l.x), wall_gap(tile, ivec2(1, 0), 7 - l.x)), wall_gap(tile, ivec2(0, -1), l.y) * 0.8);
    float f = 1.0 - clamp(d / 16.0, 0.0, 1.0);
    return 1.0 - 0.4 * floor(f * f * 8.0 + 0.5) / 8.0;
}
vec3 liquid_passes(vec3 color, ivec2 pixel, ivec2 tile) {
    if (pixel.y % 8 == 0) { color = liquid_pixel(color, tile + ivec2(0, -1), pixel); }
    color = liquid_pixel(color, tile, pixel);
    if (pixel.y % 8 == 7) { color = liquid_pixel(color, tile + ivec2(0, 1), pixel); }
    return color;
}
vec4 styled_fragment(ivec2 pixel, ivec2 tile) {
    vec4 base = styled_base(pixel);
    vec3 color; float alpha;
    if (base.a == 0.0) {
        // Liquid over the open sky: composite over black and over white to recover its colour and coverage.
        vec3 over_black = liquid_passes(vec3(0.0), pixel, tile);
        vec3 over_white = liquid_passes(vec3(1.0), pixel, tile);
        alpha = clamp(1.0 - dot(over_white - over_black, vec3(1.0 / 3.0)), 0.0, 1.0);
        color = alpha > 0.004 ? clamp(over_black / alpha, 0.0, 1.0) : vec3(0.0);
    } else {
        color = liquid_passes(base.rgb, pixel, tile);
        alpha = base.a;
    }
    if (has_grains && in_world(tile)) {
        int grain = int(round(texelFetch(grain_data, pixel, 0).r * 255.0));
        if (grain > 0) {
            vec3 g = grain == 1 ? vec3(0.76,0.60,0.34) : grain == 2 ? vec3(1.0,0.94,0.77) : grain == 3 ? vec3(0.79,0.90,0.96) : grain == 4 ? vec3(0.95,0.98,1.0) : grain == 5 ? vec3(0.86,0.9,0.8) : grain == 6 ? vec3(0.4,0.4,0.38) : grain == 7 ? vec3(0.85,0.82,0.65) : grain == 8 ? vec3(0.68,0.34,0.13) : grain == 9 ? vec3(0.65,0.86,0.89) : grain == 10 ? vec3(0.17,0.18,0.2) : vec3(0.83,0.88,0.75);
            color = g * (0.81 + world_hash(pixel) * 0.19);
            alpha = 1.0;
        }
    }
    if (lit) {
        bool indoor = (back_at(tile) & 15) != 0;
        // the timbers facing into a room (its floor, its ceiling beam, the inner posts) take the room's light too
        bool facing = !indoor && solid_at(tile) && (room_open(tile + ivec2(0, -1)) || room_open(tile + ivec2(0, 1)) || room_open(tile + ivec2(-1, 0)) || room_open(tile + ivec2(1, 0)));
        color *= light_at(vec2(pixel), indoor || facing);
        if (indoor) { color *= room_shade(pixel, tile); }
    }
    if (has_fire && in_world(tile)) {
        // flames give their own light
        int heat = int(round(texelFetch(fire_data, tile, 0).r * 255.0));
        ivec2 local = pixel - tile * 8;
        if (heat > 200) {
            float flick = world_hash(ivec2(pixel.x, pixel.y + int(animation_time * 14.0) * 53 + heat));
            float b = float(local.y) / 7.0;
            float a = 0.45 + 0.45 * flick * b;
            color = mix(color, mix(PAL_GLOW[0], PAL_GLOW[3], flick * b), a);
            alpha = max(alpha, a);
        } else if (heat > 0) {
            float glow = float(heat) / 200.0;
            color = mix(color, vec3(1.0, 0.35 + 0.4 * glow, 0.1 * glow), 0.25 + 0.5 * glow);
        }
        if (heat == 0 && tile.y + 1 < world_size.y && cell_at(tile).b == 0) {
            int below = int(round(texelFetch(fire_data, tile + ivec2(0, 1), 0).r * 255.0));
            if (below > 200) {
                float tongue = world_hash(ivec2(pixel.x, int(animation_time * 12.0) * 71 + below));
                if (float(7 - local.y) < tongue * 6.0 - 1.0) { color = mix(color, PAL_GLOW[1], 0.7); alpha = max(alpha, 0.7); }
            }
        }
    }
    return vec4(color, alpha);
}
void fragment() {
    ivec2 pixel = ivec2(floor(UV*vec2(world_size)*8.0));
    ivec2 tile = pixel/8;
    if (styled) {
        COLOR = styled_fragment(pixel, tile);
    } else {
        COLOR = vec4(sandbox_fragment(pixel, tile), 1.0);
    }
}
