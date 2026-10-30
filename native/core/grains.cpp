#include "grains.hpp"
#include <algorithm>
#include <cmath>
namespace ecologist {
double grain_capacity(int kind,double amount) { constexpr double caps[]={0,1.6*.8,SUGAR_CAP,SALT_CAP,0.3*2.09,1.04,.7*.84,1.5*.75,1.5*1.25,2.5*.85,.4,1.7*1.2};return caps[std::clamp(kind,0,GRAIN_KINDS)]*amount/255.0; }
double saturation(int channel,double temperature) {
    // Approximate game curves (concentration units), not laboratory solubility data.
    const double t=std::clamp(temperature,0.0,100.0);
    return channel==SOL_SUGAR ? 255*(1.8+0.01*t+0.00018*t*t) : 255*(0.35+0.0003*t);
}
void Grains::reset(const World& w) {
    width=w.width*GRAIN_SCALE;height=w.height*GRAIN_SCALE;
    particles.clear();occupied.clear();image.clear();
}
bool Grains::allocate(const World& w) {
    if(width!=w.width*GRAIN_SCALE || height!=w.height*GRAIN_SCALE) reset(w);
    if(width<=0 || static_cast<std::int64_t>(width)*height>MAX_FINE_PIXELS) return false;
    if(occupied.empty()) { occupied.assign(width*height,0);image.assign(width*height,0); }
    return true;
}
bool Grains::free(const World& w,int x,int y) const {
    return x>=0 && y>=0 && x<width && y<height && !w.solid[(y/GRAIN_SCALE)*w.width+x/GRAIN_SCALE] && !occupied[y*width+x];
}
bool Grains::add(const World& w,int x,int y,int kind,double amount,double temperature) {
    if(kind<1 || kind>GRAIN_KINDS || !std::isfinite(amount) || !std::isfinite(temperature) || amount<=0 || amount>GRAIN_AMOUNT || particles.size()>=MAX_GRAINS || !allocate(w) || !free(w,x,y)) return false;
    particles.push_back({x,y,kind,amount,temperature});
    occupied[y*width+x]=static_cast<std::uint32_t>(particles.size());image[y*width+x]=kind;
    return true;
}
int Grains::paint(const World& w,int x,int y,int radius,int kind) {
    if(!allocate(w) || x<0 || y<0 || x>=width || y>=height) return 0;
    radius=std::clamp(radius,1,128);int added=0;
    for(int dy=-radius;dy<=radius;dy++) for(int dx=-radius;dx<=radius;dx++)
        // A sparse stream leaves genuinely separate grains visible in the air.
        if(dx*dx+dy*dy<=radius*radius && ((x+dx)*17+(y+dy)*31+int(w.tick))%5==0)
            added+=add(w,x+dx,y+dy,kind,GRAIN_AMOUNT,kind==4?-10:20);
    return added;
}
void Grains::remove(std::size_t i) {
    const auto g=particles[i];occupied[g.y*width+g.x]=0;image[g.y*width+g.x]=0;
    if(i+1!=particles.size()) {
        particles[i]=particles.back();const auto& moved=particles[i];occupied[moved.y*width+moved.x]=static_cast<std::uint32_t>(i+1);
    }
    particles.pop_back();
}
void Grains::erase_cell(int x,int y) {
    if(occupied.empty()) return;
    for(int py=y*8;py<(y+1)*8;py++) for(int px=x*8;px<(x+1)*8;px++)
        if(px>=0 && py>=0 && px<width && py<height && occupied[py*width+px]) remove(occupied[py*width+px]-1);
}
void Grains::step(World& w) {
    for(std::size_t i=0;i<particles.size();) {
        auto& g=particles[i];const int k=g.y/8*w.width+g.x/8;
        if((g.kind==SUGAR_GRAIN||g.kind==SALT_GRAIN||g.kind==8||g.kind==5) && w.typ[k]==WATER && w.liq[k]) {
            const int channel=g.kind==SUGAR_GRAIN||g.kind==8?SOL_SUGAR:g.kind==5?8:SOL_SALT;
            auto& c=w.sol[k*NSOL+channel];
            const double take=std::min({g.amount,DISSOLVE_PER_TICK,std::max(0.0,((channel==8?255:saturation(channel,w.temp[k]))-c)*w.liq[k]/255)});
            if(take>0) {
                const double before_cap=FLUIDS[WATER].capacity*w.liq[k]/255.0+w.dissolved_capacity(k,w.liq[k]);
                const double energy=before_cap*w.temp[k]+grain_capacity(g.kind,take)*g.temperature;
                c+=take*255/w.liq[k];g.amount-=take;
                const double after_cap=FLUIDS[WATER].capacity*w.liq[k]/255.0+w.dissolved_capacity(k,w.liq[k]);
                w.temp[k]=static_cast<float>(energy/after_cap);w.latent[k]+=energy-after_cap*w.temp[k];w.wake(k);
            }
            if(g.amount<1e-10) { remove(i);continue; }
        }
        // Check every traversed pixel; slower sinking in liquid, no wall tunneling.
        const int speed=w.liq[k]?1:4;
        for(int s=0;s<speed;s++) {
            const int side=((w.tick+g.x+g.y)&1)?1:-1;
            const bool floats=(g.kind==4||g.kind==6)&&w.liq[k]&&!FLUIDS[w.typ[k]].gas&&FLUIDS[w.typ[k]].density>(g.kind==4?.3:.7);
            int nx=g.x,ny=g.y+(floats?-1:1);
            if(!free(w,nx,ny)) {
                nx=g.x+side;
                if(!free(w,nx,ny)) { nx=g.x-side;if(!free(w,nx,ny)) break; }
            }
            occupied[g.y*width+g.x]=0;image[g.y*width+g.x]=0;
            g.x=nx;g.y=ny;occupied[ny*width+nx]=static_cast<std::uint32_t>(i+1);image[ny*width+nx]=g.kind;
        }
        ++i;
    }
}
double Grains::mass(int kind) const { double m=0;for(const auto& g:particles)if(g.kind==kind)m+=g.amount;return m; }
double Grains::sensible_energy() const { double e=0;for(const auto& g:particles)e+=grain_capacity(g.kind,g.amount)*g.temperature;return e; }
}
