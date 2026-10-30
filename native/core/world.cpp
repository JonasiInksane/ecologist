#include "world.hpp"
#include "../generated/sandbox.hpp"
#include <algorithm>
#include <cmath>
#include <numeric>

namespace ecologist {
bool World::reset(int w,int h,std::uint32_t seed) {
    if(w<CHUNK || h<CHUNK || w>2048 || h>1024 || w%CHUNK || h%CHUNK || w*h>MAX_CELLS) return false;
    width=w; height=h; chunk_width=w/CHUNK; tick=0; rng=seed;
    const auto n=static_cast<std::size_t>(w*h);
    solid.assign(n,0); liq.assign(n,0); typ.assign(n,0); drop.assign(n,0); under.assign(n,0);
    stamp.assign(n,0); flux.assign(n,0); temp.assign(n,20); vel.assign(n,0);
    latent.assign(n,0); sol.assign(n*NSOL,0); awake.assign(n/(CHUNK*CHUNK),AWAKE_TICKS);
    return true;
}
double World::random() {
    rng+=0x6d2b79f5u;
    auto t=(rng^(rng>>15))*(rng|1u);
    t^=t+((t^(t>>7))*(t|61u));
    return static_cast<double>(t^(t>>14))/4294967296.0;
}
void World::wake(int k) {
    const int cx=(k%width)/CHUNK,cy=(k/width)/CHUNK;
    for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++) {
        const int x=cx+dx,y=cy+dy;
        if(x>=0 && x<chunk_width && y>=0 && y<height/CHUNK) awake[y*chunk_width+x]=AWAKE_TICKS;
    }
}
void World::wake_all() { std::fill(awake.begin(),awake.end(),AWAKE_TICKS); }
int World::viscosity(int type,double temperature) const {
    for(const auto& v:VISCOSITIES) if(v.type==type && temperature<v.limit) return v.cadence;
    return FLUIDS[type].viscosity;
}
double World::dissolved_capacity(int k,double amount) const {
    return amount/(255.0*255.0)*(SALT_CAP*std::max(0.0,sol[k*NSOL+SOL_SALT])+SUGAR_CAP*std::max(0.0,sol[k*NSOL+SOL_SUGAR]));
}
double World::density(int k) const {
    const auto type=typ[k]; const double t=temp[k]; const auto p=k*NSOL;
    const double base=type==WATER || type==STORM ? FLUIDS[type].density*(1-6.8e-6*(t-4)*(t-4)) : FLUIDS[type].density*(1-0.0005*(t-20));
    return base+(sol[p+SOL_SALT]*0.2+sol[p+SOL_SUGAR]*0.33+sol[p+SOL_SILT]*0.3+sol[p+SOL_METAL]*0.1)/255;
}
void World::carry(int src,int dst,double amount,double had,double available) {
    if(!(amount>0) || !(available>0)) return;
    const double incoming=FLUIDS[typ[src]].capacity*amount/255+dissolved_capacity(src,amount);
    const double receiving=had>0 ? FLUIDS[typ[dst] ? typ[dst] : typ[src]].capacity*had/255+dissolved_capacity(dst,had) : AIR_CAP;
    temp[dst]=static_cast<float>((static_cast<double>(temp[dst])*receiving+static_cast<double>(temp[src])*incoming)/(receiving+incoming));
    vel[dst]=had>0 ? static_cast<float>((static_cast<double>(vel[dst])*had+static_cast<double>(vel[src])*amount)/(had+amount)) : vel[src];
    for(int i=0;i<NSOL;i++) {
        auto& d=sol[dst*NSOL+i]; const double s=sol[src*NSOL+i];
        if(!had) d=s; else if(d!=s) d=(d*had+s*amount)/(had+amount);
    }
    const double energy=latent[src]*amount/available;
    latent[src]-=energy; latent[dst]+=energy;
}
void World::swap_sol(int a,int b) { for(int i=0;i<NSOL;i++) std::swap(sol[a*NSOL+i],sol[b*NSOL+i]); }
void World::step() {
    ++tick;
    for(int y=height-1;y>=0;y--) {
        const bool ltr=((tick+y)&1)==0; const int crow=(y/CHUNK)*chunk_width;
        for(int i=0;i<width;i++) {
            const int x=ltr ? i : width-1-i;
            if(i%CHUNK==0 && !awake[crow+x/CHUNK]) { i+=CHUNK-1; continue; }
            const int k=y*width+x;
            if(!liq[k] || stamp[k]==tick) continue;
            const int type=typ[k]; const auto& l=FLUIDS[type];
            if(tick%viscosity(type,temp[k])) continue;
            int a=liq[k]; const int g=l.gravity; bool fell=false;
            if(g>0 ? y<height-1 : y>0) {
                const int b=k+width*g;
                if(!solid[b]) {
                    const int ba=liq[b],bt=typ[b];
                    if(!ba || bt==type) {
                        const int room=CAPACITY-ba;
                        if(room>0) {
                            const int mv=std::min(a,room);
                            carry(k,b,mv,ba,a); liq[b]+=mv; typ[b]=type; a-=mv; wake(k);
                            if(mv>=8) flux[b]=tick;
                            drop[b]=std::max(ba ? drop[b] : 0,std::min(CAPACITY,drop[k]+1)); fell=true;
                            if(g<0) stamp[b]=tick;
                            // Preserve the physics RNG draw; cosmetic particles have their own future presentation layer.
                            else if(ba>0 && mv>24 && (y+2>=height || solid[b+width] || liq[b+width]>=250)) (void)random();
                        } else if(g>0 && stamp[b]!=tick && random()<0.5 && density(k)>density(b)+DENSITY_GAP) {
                            swap_sol(k,b); liq[k]=ba; liq[b]=a;
                            std::swap(latent[k],latent[b]); std::swap(temp[k],temp[b]); std::swap(vel[k],vel[b]);
                            wake(k); stamp[k]=tick; stamp[b]=tick; continue;
                        }
                    } else if(type==WATER && bt==OIL && random()<0.1) {
                        typ[k]=FOAM; typ[b]=FOAM; wake(k); stamp[k]=tick; stamp[b]=tick; continue;
                    } else if(SWAPS[type*NLIQ+bt] && (g<0 ? l.density<FLUIDS[bt].density : l.density>FLUIDS[bt].density)) {
                        if(g<0 && l.gas && !FLUIDS[bt].gas) (void)random();
                        liq[k]=ba; typ[k]=bt; liq[b]=a; typ[b]=type;
                        std::swap(temp[k],temp[b]); std::swap(vel[k],vel[b]); swap_sol(k,b); std::swap(latent[k],latent[b]);
                        wake(k); stamp[k]=tick; stamp[b]=tick; continue;
                    }
                }
            }
            if(!fell) drop[k]=0;
            if(!a) { liq[k]=0; typ[k]=0; drop[k]=0; continue; }
            bool use_l=false,use_r=false; int la=0,ra=0;
            if(x>0 && !solid[k-1] && (!liq[k-1] || typ[k-1]==type)) { la=liq[k-1]; use_l=la==0 ? a>=l.min_spread : a-la>=l.min_diff; }
            if(x<width-1 && !solid[k+1] && (!liq[k+1] || typ[k+1]==type)) { ra=liq[k+1]; use_r=ra==0 ? a>=l.min_spread : a-ra>=l.min_diff; }
            if(use_l || use_r) {
                const int n=1+use_l+use_r,sum=a+(use_l ? la : 0)+(use_r ? ra : 0),avg=sum/n;
                if(use_l && la>avg) { carry(k-1,k,la-avg,a,liq[k-1]); a+=la-avg; liq[k-1]=avg; }
                if(use_r && ra>avg) { carry(k+1,k,ra-avg,a,liq[k+1]); a+=ra-avg; liq[k+1]=avg; }
                if(use_l) {
                    if(avg>la) { carry(k,k-1,avg-la,la,a); a-=avg-la; }
                    if(avg-la>=8) flux[k-1]=tick;
                    liq[k-1]=avg; typ[k-1]=type; stamp[k-1]=tick;
                }
                if(use_r) {
                    if(avg>ra) { carry(k,k+1,avg-ra,ra,a); a-=avg-ra; }
                    if(avg-ra>=8) flux[k+1]=tick;
                    liq[k+1]=avg; typ[k+1]=type; stamp[k+1]=tick;
                }
                a=sum-avg*(n-1); wake(k);
            }
            liq[k]=a;
        }
    }
    for(auto& a:awake) if(a) --a;
}
bool World::paint(int x,int y,int radius,int material) {
    if(!width || x<0 || y<0 || x>=width || y>=height || material < -79 || material>=NLIQ || (material>0 && !FLUIDS[material].gravity)) return false;
    radius=std::clamp(radius,1,16);
    for(int yy=std::max(0,y-radius+1);yy<std::min(height,y+radius);yy++) for(int xx=std::max(0,x-radius+1);xx<std::min(width,x+radius);xx++) {
        if((xx-x)*(xx-x)+(yy-y)*(yy-y)>=radius*radius) continue;
        const int k=yy*width+xx;
        if(material>0 && solid[k]) continue;
        solid[k]=material<0 ? -material : 0; liq[k]=material>0 ? CAPACITY : 0; typ[k]=material>0 ? material : 0;
        temp[k]=material>0 ? static_cast<float>(FLUIDS[material].paint_temperature) : 20;
        vel[k]=0; latent[k]=0; drop[k]=0; stamp[k]=0; flux[k]=0;
        std::fill_n(sol.begin()+k*NSOL,NSOL,0); wake(k);
    }
    return true;
}
void World::demo(std::uint32_t seed) {
    if(!reset(W,H,seed)) return;
    for(int x=0;x<width;x++) {
        const int ground=height-16+static_cast<int>(std::sin(x*0.045)*5);
        for(int y=ground;y<height;y++) {
            solid[y*width+x]=y<ground+4 ? 1 : 2;
            under[y*width+x]=y>ground;
        }
    }
    for(int y=70;y<height-8;y++) { solid[y*width+28]=2; solid[y*width+180]=2; }
    for(int x=28;x<=180;x++) solid[(height-8)*width+x]=2;
    for(int y=85;y<height-16;y++) for(int x=29;x<180;x++) if(!solid[y*width+x]) { liq[y*width+x]=CAPACITY; typ[y*width+x]=WATER; }
    for(int x=50;x<100;x++) solid[62*width+x]=2;
    for(int y=43;y<54;y++) for(int x=60;x<75;x++) { liq[y*width+x]=CAPACITY; typ[y*width+x]=3; }
    wake_all();
}
double World::volume() const { return std::accumulate(liq.begin(),liq.end(),0.0); }
std::vector<std::uint8_t> World::rgba() const {
    std::vector<std::uint8_t> pixels(liq.size()*4,0);
    for(std::size_t k=0;k<liq.size();k++) {
        const auto p=k*4;
        if(solid[k]) {
            const bool soil=solid[k]==1; const int grain=static_cast<int>((k*2654435761u)>>28)&7;
            pixels[p]=(soil ? 105 : 88)+grain; pixels[p+1]=(soil ? 81 : 102)+grain; pixels[p+2]=(soil ? 56 : 105)+grain; pixels[p+3]=CAPACITY;
        } else if(liq[k]) {
            const auto& f=FLUIDS[typ[k]]; pixels[p]=f.r; pixels[p+1]=f.g; pixels[p+2]=f.b; pixels[p+3]=liq[k];
        }
    }
    return pixels;
}
}
