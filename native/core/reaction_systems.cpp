#include "sandbox.hpp"
#include <algorithm>
#include <cmath>
namespace ecologist {
void Sandbox::reactions_step(World &w) {
    auto clear = [&](int k) {
        w.liq[k] = 0;
        w.typ[k] = 0;
        w.latent[k] = 0;
        std::fill_n(w.sol.begin() + k * NSOL, NSOL, 0.0);
        w.wake(k);
    };
    auto liquid = [&](int k, int type) {
        w.typ[k] = type;
        w.wake(k);
    };
    auto solidify = [&](int k, int block) {
        freeze(w, k, block);
        if (block == B_ICE)
            w.temp[k] = std::min(w.temp[k], -5.0f);
        if (block == B_METAL)
            w.temp[k] = std::min(w.temp[k], 900.0f);
    };
    auto gas = [&](int at, int type, int amount) {
        for (int dir = -1; dir < 4; dir++) {
            int n = dir < 0 ? at : neighbor(w, at, dir);
            if (n < 0 || w.solid[n] || (w.liq[n] && w.typ[n] != type) || 255 - w.liq[n] < amount)
                continue;
            FluidBuffer b;
            b.type = type;
            b.amount = amount;
            b.temperature = w.temp[at];
            put(w, b, n, amount);
            return;
        }
    };
    auto pair = [&](int k, int o, bool above) {
        const int a = w.typ[k], b = w.typ[o];
        if (a == b || !a || !b)
            return;
        const int block = PAIR_BLOCK[a * NLIQ + b];
        if (block) {
            solidify(above ? k : o, block);
            return;
        }
        auto at = [&](int type) { return a == type ? k : b == type ? o : -1; };
        const int water = at(WATER), acid = at(L_ACID), lye = at(L_LYE), honey = at(L_HONEY),
                  lava = at(L_LAVA), slime = at(L_SLIME), bloom = at(L_BLOOM), void_cell = at(L_VOID),
                  mimic = at(L_MIMIC);
        if (void_cell >= 0) {
            int other = void_cell == k ? o : k;
            if (w.typ[other] == L_AETHER)
                clear(void_cell);
            else {
                w.liq[void_cell] = std::max(0, int(w.liq[void_cell]) - 48);
                if (!w.liq[void_cell])
                    clear(void_cell);
            }
            clear(other);
            return;
        }
        if (mimic >= 0) {
            liquid(mimic, w.typ[mimic == k ? o : k]);
            return;
        }
        if (water >= 0 && honey >= 0) {
            if (w.temp[water] < 10) {
                solidify(honey, B_COMB);
                return;
            }
            double &c = w.sol[water * NSOL + SOL_SUGAR];
            if (c > 220)
                return;
            int amount =
                int(std::min({64.0, double(w.liq[honey]), std::max(0.0, 255 - c) * w.liq[water] / 255}));
            c += amount * 255.0 / w.liq[water];
            w.liq[honey] -= amount;
            if (!w.liq[honey])
                clear(honey);
            return;
        }
        if (water >= 0 && (acid >= 0 || lye >= 0)) {
            int n = acid >= 0 ? acid : lye;
            liquid(n, WATER);
            std::fill_n(w.sol.begin() + n * NSOL, NSOL, 0.0);
            w.sol[n * NSOL + (acid >= 0 ? 7 : 8)] = 220;
            w.temp[n] += acid >= 0 ? 25 : 30;
            return;
        }
        if (acid >= 0 && lye >= 0) {
            for (int n : {k, o}) {
                liquid(n, WATER);
                w.temp[n] += 60;
                std::fill_n(w.sol.begin() + n * NSOL, NSOL, 0.0);
                w.sol[n * NSOL + SOL_SALT] = 60;
            }
            return;
        }
        if (water >= 0 && bloom >= 0) {
            liquid(bloom, WATER);
            w.sol[bloom * NSOL + 2] = 255;
            return;
        }
        if (water >= 0 && at(L_FERT) >= 0) {
            int n = at(L_FERT);
            liquid(n, WATER);
            w.sol[n * NSOL + 9] = 200;
            return;
        }
        if (water >= 0 && at(L_FROST) >= 0 && w.sol[water * NSOL + SOL_SALT] <= 100) {
            solidify(water, B_ICE);
            return;
        }
        if (water >= 0 && (at(35) >= 0 || at(38) >= 0)) {
            int n = at(35) >= 0 ? at(35) : at(38);
            const bool ethanol = w.typ[n] == 35;
            liquid(n, WATER);
            w.sol[n * NSOL + (ethanol ? 17 : 7)] = ethanol ? 255 : 12.75;
            return;
        }
        if (lye >= 0 && at(OIL) >= 0) {
            int n = at(OIL);
            liquid(n, FOAM);
            w.sol[n * NSOL + 13] = 200;
            return;
        }
        if (acid >= 0 && at(L_BLEACH) >= 0) {
            int n = at(L_BLEACH);
            liquid(n, L_CHLORINE);
            w.temp[n] = 20;
            w.liq[acid] = std::max(0, int(w.liq[acid]) - 48);
            if (!w.liq[acid])
                clear(acid);
            return;
        }
        if (water >= 0 && at(L_BLEACH) >= 0) {
            if (w.sol[water * NSOL + 7] >= 40) {
                liquid(at(L_BLEACH), L_CHLORINE);
                w.sol[water * NSOL + 7] -= 40;
            }
            w.sol[water * NSOL + 10] = 0;
            return;
        }
        if ((water >= 0 || at(STORM) >= 0) && (at(L_MOLTEN) >= 0 || at(L_MSLAG) >= 0)) {
            int m = at(L_MOLTEN) >= 0 ? at(L_MOLTEN) : at(L_MSLAG), q = m == k ? o : k;
            solidify(m, w.typ[m] == L_MOLTEN ? B_METAL : B_SLAG);
            liquid(q, L_STEAM);
            w.temp[q] = 110;
            return;
        }
        if (lava >= 0 && (acid >= 0 || lye >= 0 || bloom >= 0 || at(L_TONIC) >= 0 || slime >= 0)) {
            clear(lava == k ? o : k);
            return;
        }
        if (lava >= 0 && at(OIL) >= 0) {
            w.temp[at(OIL)] = 1000;
            return;
        }
        if (honey >= 0 && at(L_FROST) >= 0) {
            solidify(honey, B_COMB);
            return;
        }
        if (honey >= 0 && lava >= 0) {
            solidify(honey, B_CRISP);
            return;
        }
        if (honey >= 0 && acid >= 0) {
            clear(honey);
            w.liq[acid] = std::max(0, int(w.liq[acid]) - 40);
            if (!w.liq[acid])
                clear(acid);
            return;
        }
        if (slime >= 0 && (acid >= 0 || lye >= 0)) {
            clear(slime);
            return;
        }
        if (bloom >= 0 && acid >= 0) {
            liquid(acid, L_BLOOM);
            return;
        }
        if (water >= 0 && at(L_CO2) >= 0) {
            int n = at(L_CO2), amount = std::min(8, int(w.liq[n]));
            w.sol[water * NSOL + 18] += amount * 255.0 / w.liq[water];
            w.liq[n] -= amount;
            if (!w.liq[n])
                clear(n);
            return;
        }
        if (water >= 0 && at(OIL) >= 0 && w.sol[water * NSOL + 13] >= 20) {
            int oil = at(OIL);
            liquid(oil, L_EMULSION);
            w.sol[oil * NSOL + 14] = 255;
            liquid(water, L_EMULSION);
            return;
        }
    };
    for (int k = 0; k < w.width * w.height; k++)
        if (w.liq[k]) {
            for (int dir : {3, 1, 2, 0}) {
                int n = neighbor(w, k, dir);
                if (n >= 0 && w.liq[n] && w.typ[n] != w.typ[k])
                    pair(k, n,
                         dir == 0 ? FLUIDS[w.typ[k]].gravity > 0 : dir == 3 && FLUIDS[w.typ[k]].gravity < 0);
                if (!w.liq[k])
                    break;
            }
        }
    auto open_air = [&](int k) {
        for (int dir = 0; dir < 4; dir++) {
            int n = neighbor(w, k, dir);
            if (n >= 0 && !w.solid[n] && (!w.liq[n] || w.typ[n] == L_OXYGEN))
                return true;
        }
        return false;
    };
    auto become = [&](int k, int block, int type, double temperature, double slag) {
        if (type) {
            w.solid[k] = 0;
            w.liq[k] = std::clamp(int(held[k]), 1, 255);
            w.typ[k] = w.random() < slag ? L_MSLAG : type;
            w.temp[k] = float(temperature);
            held[k] = 255;
            std::fill_n(w.sol.begin() + k * NSOL, NSOL, 0.0);
        } else {
            w.solid[k] = block;
            held[k] = 255;
        }
        w.wake(k);
    };
    for (int k = 0; k < w.width * w.height; k++) {
        if (w.liq[k]) {
            for (int kind : {0, 1, 2, 3 + int(w.typ[k])}) {
                const int type = w.typ[k];
                const bool watery = type == WATER || type == STORM;
                double strength = kind == 0   ? (type == L_ACID                        ? 255
                                                 : watery && w.sol[k * NSOL + 7] >= 40 ? w.sol[k * NSOL + 7]
                                                                                       : 0)
                                  : kind == 1 ? (type == L_LYE                         ? 255
                                                 : watery && w.sol[k * NSOL + 8] >= 40 ? w.sol[k * NSOL + 8]
                                                                                       : 0)
                                  : kind == 2 ? (watery ? 255 : 0)
                                              : (type == kind - 3 ? 255 : 0);
                if (strength <= 0)
                    continue;
                bool reacted = false;
                for (int dir = 0; dir < 4 && !reacted; dir++) {
                    int n = neighbor(w, k, dir);
                    if (n < 0 || !w.solid[n])
                        continue;
                    for (const auto &r : CONTACT_RULES) {
                        if (r.alone || r.block != w.solid[n] || r.kind != kind)
                            continue;
                        double rate = r.rate * strength / 255;
                        if (r.salt_faster)
                            rate = r.rate * (1 + w.sol[k * NSOL + SOL_SALT] / 30 + w.sol[k * NSOL + 7] / 30);
                        if (r.wet_air && !open_air(n))
                            rate *= .15;
                        if (w.random() >= rate)
                            continue;
                        if (r.heat) {
                            w.temp[k] += float(r.heat / 2 / std::max(.001, capacity(w, k)));
                            w.temp[n] += float(r.heat / 2 / std::max(.001, capacity(w, n)));
                        }
                        if (watery)
                            for (int s = 0; s < NSOL; s++)
                                w.sol[k * NSOL + s] += r.solutes[s];
                        if (r.uses) {
                            if (kind == 0 && type != L_ACID)
                                w.sol[k * NSOL + 7] = std::max(0.0, w.sol[k * NSOL + 7] - r.uses);
                            else if (kind == 1 && type != L_LYE)
                                w.sol[k * NSOL + 8] = std::max(0.0, w.sol[k * NSOL + 8] - r.uses);
                            else {
                                w.liq[k] = std::max(0, int(w.liq[k]) - int(r.uses));
                                if (!w.liq[k])
                                    clear(k);
                            }
                        }
                        become(n, r.to_block, r.to_liquid, r.to_temp, r.slag);
                        if (r.gas)
                            gas(n, r.gas, r.gas_amount);
                        reacted = true;
                        break;
                    }
                }
                if (reacted || !w.liq[k])
                    break;
            }
            if (w.typ[k] == WATER) {
                double m = std::min(w.sol[k * NSOL + 7], w.sol[k * NSOL + 8]);
                if (m > 0) {
                    m = std::min(m, 8.0);
                    w.sol[k * NSOL + 7] -= m;
                    w.sol[k * NSOL + 8] -= m;
                    w.sol[k * NSOL + SOL_SALT] += m;
                    w.temp[k] += float(m * .1);
                }
            }
        } else if (w.solid[k]) {
            for (const auto &r : CONTACT_RULES) {
                if (!r.alone || r.block != w.solid[k] || w.temp[k] <= r.above || (r.air && !open_air(k)) ||
                    (r.sealed && open_air(k)))
                    continue;
                int touching = -1;
                if (r.touch1) {
                    for (int dir = 0; dir < 4; dir++) {
                        int n = neighbor(w, k, dir);
                        if (n >= 0 && (w.solid[n] == r.touch1 || (r.touch2 && w.solid[n] == r.touch2))) {
                            touching = n;
                            break;
                        }
                    }
                    if (touching < 0)
                        continue;
                }
                if (w.random() >= r.rate)
                    continue;
                if (r.heat)
                    w.temp[k] += float(r.heat / std::max(.001, capacity(w, k)));
                if (touching >= 0 && r.use_touch)
                    become(touching, 0, r.touch_liquid, r.touch_temp, 0);
                become(k, r.to_block, r.to_liquid, r.to_temp, r.slag);
                if (r.gas)
                    gas(touching >= 0 && r.use_touch && !r.touch_liquid ? touching : k, r.gas, r.gas_amount);
                break;
            }
        }
    }
}
} // namespace ecologist
