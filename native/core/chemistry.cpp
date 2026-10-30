#include "grains.hpp"
#include <algorithm>
#include <cmath>
namespace ecologist {
namespace {
constexpr int STEAM=8, OXYGEN_DEFICIT=12, CHEM_CADENCE=4;
constexpr double OXYGEN_REFERENCE=9.1/(15.0/255.0), DIFFUSION=0.02;
constexpr double BOIL=100.0, GAME_LATENT=2257.0*0.25;
constexpr double STEAM_OFFSET=GAME_LATENT+(4.18-2.0)*BOIL;
double capacity(const World& w,int k) { return FLUIDS[w.typ[k]].capacity*w.liq[k]/255.0+w.dissolved_capacity(k,w.liq[k]); }
void diffuse(World& w,int a,int b) {
    if(w.typ[b]!=WATER || !w.liq[b])return;
    const double va=w.liq[a],vb=w.liq[b];
    for(int s=0;s<NSOL;s++) {
        auto& ca=w.sol[a*NSOL+s];auto& cb=w.sol[b*NSOL+s];
        const double transfer=(ca-cb)*DIFFUSION*va*vb/(va+vb);
        if(std::abs(transfer)<1e-12)continue;
        const double transferred_capacity=(s==SOL_SUGAR?SUGAR_CAP:s==SOL_SALT?SALT_CAP:0)*transfer/(255.0*255.0);
        const double heat=transferred_capacity*(transfer>0?w.temp[a]:w.temp[b]);
        const double ea=capacity(w,a)*w.temp[a]-heat,eb=capacity(w,b)*w.temp[b]+heat;
        ca-=transfer/va;cb+=transfer/vb;
        const double capa=capacity(w,a),capb=capacity(w,b);
        w.temp[a]=static_cast<float>(ea/capa);w.temp[b]=static_cast<float>(eb/capb);
        w.latent[a]+=ea-capa*w.temp[a];w.latent[b]+=eb-capb*w.temp[b];
    }
}
}
bool heat_brush(World& w,int x,int y,int radius,double delta) {
    if(x<0 || y<0 || x>=w.width || y>=w.height || !std::isfinite(delta))return false;
    radius=std::clamp(radius,1,16);bool changed=false;
    for(int dy=-radius;dy<=radius;dy++) for(int dx=-radius;dx<=radius;dx++) {
        const int xx=x+dx,yy=y+dy;
        if(dx*dx+dy*dy>radius*radius || xx<0 || yy<0 || xx>=w.width || yy>=w.height)continue;
        const int k=yy*w.width+xx;
        w.temp[k]=static_cast<float>(std::clamp(w.temp[k]+delta,-80.0,1800.0));w.wake(k);changed=true;
    }
    return changed;
}
void chemistry_step(World& w,Grains& grains) {
    if(w.tick%CHEM_CADENCE)return;
    for(int k=0;k<w.width*w.height;k++) {
        if(!w.liq[k])continue;
        // Condensation returns phase energy as stored enthalpy instead of deleting it.
        if(w.typ[k]==STEAM && w.temp[k]<BOIL) {
            w.latent[k]+=(STEAM_OFFSET+(FLUIDS[STEAM].capacity-FLUIDS[WATER].capacity)*w.temp[k])*w.liq[k]/255.0;
            w.typ[k]=WATER;w.wake(k);continue;
        }
        if(w.typ[k]!=WATER)continue;
        if(k%w.width+1<w.width)diffuse(w,k,k+1);
        if(k+w.width<w.width*w.height)diffuse(w,k,k+w.width);
        for(int channel : {SOL_SUGAR,SOL_SALT}) {
            auto& c=w.sol[k*NSOL+channel];
            const double excess=(c-saturation(channel,w.temp[k]))*w.liq[k]/255.0;
            if(excess<=1e-9)continue;
            const double amount=std::min(excess,GRAIN_AMOUNT);bool placed=false;
            for(int p=0;p<64 && !placed;p++) {
                const int px=k%w.width*8+(p+int(w.tick))%8,py=k/w.width*8+p/8;
                placed=grains.add(w,px,py,channel==SOL_SUGAR?SUGAR_GRAIN:SALT_GRAIN,amount,w.temp[k]);
            }
            if(placed){c-=amount*255/w.liq[k];w.wake(k);}
        }
        double cap=capacity(w,k);
        double energy=cap*(w.temp[k]-BOIL)+w.latent[k];
        if(energy<GAME_LATENT/255 || w.temp[k]<BOIL)continue;
        int outlet=k-w.width;
        while(outlet>=0 && !w.solid[outlet] && w.liq[outlet] && w.typ[outlet]==WATER)outlet-=w.width;
        if(outlet<0 || w.solid[outlet] || (w.liq[outlet] && w.typ[outlet]!=STEAM))continue;
        bool residue=false;
        for(int s=0;s<NSOL;s++) if(s!=OXYGEN_DEFICIT && std::abs(w.sol[k*NSOL+s])>1e-10)residue=true;
        // Final drying reserves every residue pixel before changing any mass.
        // Unknown ingredients or blocked outputs retain the last carrier unit.
        if(residue && w.liq[k]==1 && w.liq[outlet]<255 && FLUIDS[WATER].capacity/255.0*(w.temp[k]-BOIL)+w.latent[k]>=GAME_LATENT/255.0) {
            bool supported=true;int required=0;
            for(int s=0;s<NSOL;s++) if(s!=OXYGEN_DEFICIT && std::abs(w.sol[k*NSOL+s])>1e-10) {
                if(s!=SOL_SALT && s!=SOL_SUGAR)supported=false;
                else required+=static_cast<int>(std::ceil(w.sol[k*NSOL+s]/255.0/GRAIN_AMOUNT));
            }
            if(supported && required<=64 && grains.particles.size()+required<=MAX_GRAINS && grains.allocate(w)) {
                std::vector<std::pair<int,int>> places;
                for(int p=0;p<64;p++) {
                    const int px=k%w.width*8+p%8,py=k/w.width*8+p/8;
                    if(grains.free(w,px,py))places.push_back({px,py});
                }
                if(static_cast<int>(places.size())>=required) {
                    int place=0;
                    for(int s : {SOL_SALT,SOL_SUGAR}) {
                        double remaining=w.sol[k*NSOL+s]/255.0;
                        while(remaining>1e-10) {
                            const double parcel=std::min(remaining,GRAIN_AMOUNT);const auto pos=places[place++];
                            grains.add(w,pos.first,pos.second,s==SOL_SALT?SALT_GRAIN:SUGAR_GRAIN,parcel,w.temp[k]);remaining-=parcel;
                        }
                        w.sol[k*NSOL+s]=0;
                    }
                    residue=false;cap=capacity(w,k);energy=cap*(w.temp[k]-BOIL)+w.latent[k];
                }
            }
        }
        // Keep the final carrier until all residues can be represented. Oxygen
        // deficit is a reference field and does not become a solid residue.
        const int amount=std::min({int(energy*255/GAME_LATENT),int(w.liq[k])-(residue?1:0),255-int(w.liq[outlet]),16});
        if(amount<=0)continue;
        const int before=w.liq[k],had=w.liq[outlet];
        const double remaining_energy=cap*w.temp[k]+w.latent[k]-amount/255.0*(FLUIDS[STEAM].capacity*BOIL+STEAM_OFFSET);
        w.liq[k]-=amount;
        if(w.liq[k])for(int s=0;s<NSOL;s++) {
            auto& c=w.sol[k*NSOL+s];
            c=s==OXYGEN_DEFICIT ? OXYGEN_REFERENCE-(OXYGEN_REFERENCE-c)*before/w.liq[k] : c*before/w.liq[k];
        }
        w.typ[outlet]=STEAM;w.liq[outlet]+=amount;
        w.temp[outlet]=static_cast<float>((w.temp[outlet]*had+BOIL*amount)/(had+amount));
        if(!had){w.latent[outlet]=0;std::fill_n(w.sol.begin()+outlet*NSOL,NSOL,0.0);}
        w.latent[k]=0;
        if(w.liq[k]) {
            const double nextcap=capacity(w,k);
            w.temp[k]=static_cast<float>(remaining_energy/nextcap);
            // Retain floating-point rounding in the energy reservoir.
            w.latent[k]=remaining_energy-nextcap*w.temp[k];
        } else {w.latent[outlet]+=remaining_energy;w.typ[k]=0;std::fill_n(w.sol.begin()+k*NSOL,NSOL,0.0);}
        w.wake(k);w.wake(outlet);
    }
}
}
