#include "grains.hpp"
#include <cmath>
#include <iostream>
#include <chrono>
using namespace ecologist;
int checks=0,failures=0;
void check(bool pass,const char* message){checks++;if(!pass){failures++;std::cerr<<"FAIL: "<<message<<'\n';}}
bool near(double a,double b,double tolerance=1e-7){return std::abs(a-b)<tolerance;}
double ingredient(const World& w,int channel){double sum=0;for(int k=0;k<w.width*w.height;k++)sum+=w.sol[k*NSOL+channel]*w.liq[k]/255.0;return sum;}
double phase_energy(const World& w){double total=0;for(int k=0;k<w.width*w.height;k++)if(w.liq[k])total+=(FLUIDS[w.typ[k]].capacity*w.liq[k]/255.0+w.dissolved_capacity(k,w.liq[k]))*w.temp[k]+w.latent[k]+(w.typ[k]==8?(2257*.25+(4.18-2)*100)*w.liq[k]/255.0:0);return total;}
int main(){
    World w;w.reset(32,32,7);Grains g;g.reset(w);
    for(int x=0;x<32;x++)w.solid[20*32+x]=2;
    check(g.add(w,80,20,SAND),"add a one-pixel grain");
    check(!g.add(w,80,20,SUGAR_GRAIN),"grains cannot overlap");
    check(!g.add(w,-1,20,SAND) && !g.add(w,80,160,SAND),"walls and bounds reject grains");
    for(int t=0;t<100;t++){w.tick++;g.step(w);}
    check(g.particles[0].y==159,"grain lands on exact pixel above terrain without tunneling");
    check(near(g.mass(SAND),GRAIN_AMOUNT),"falling conserves grain mass");
    g.add(w,80,150,SAND);for(int t=0;t<30;t++){w.tick++;g.step(w);}
    check(g.particles[0].x!=g.particles[1].x && g.particles[1].y==159,"grains slide sideways into a pile");
    g.erase_cell(10,19);check(g.particles.size()<=1,"erasing a cell removes its fine grains");
    w.reset(32,32,7);g.reset(w);const int k=10*32+10;
    w.typ[k]=WATER;w.liq[k]=255;w.solid[k+32]=2;
    g.add(w,80,87,SUGAR_GRAIN);const double initial=g.mass(SUGAR_GRAIN);
    for(int t=0;t<10;t++){w.tick++;g.step(w);}
    check(g.mass(SUGAR_GRAIN)<initial,"sugar dissolves in water");
    check(near(ingredient(w,SOL_SUGAR)+g.mass(SUGAR_GRAIN),initial),"dissolution conserves fractional sugar");
    g.add(w,81,87,SAND);const double sand=g.mass(SAND);g.step(w);
    check(near(g.mass(SAND),sand),"sand stays sand in water");
    w.sol[k*NSOL+SOL_SUGAR]=700;w.temp[k]=20;w.tick=4;
    const double before=ingredient(w,SOL_SUGAR)+g.mass(SUGAR_GRAIN);
    chemistry_step(w,g);
    check(g.mass(SUGAR_GRAIN)>0,"supersaturated sugar precipitates as actual fine grains");
    check(near(ingredient(w,SOL_SUGAR)+g.mass(SUGAR_GRAIN),before),"precipitation conserves sugar");
    check(saturation(SOL_SUGAR,80)>saturation(SOL_SUGAR,20),"warming increases approximate sugar solubility");
    w.reset(32,32,7);g.reset(w);w.typ[k]=WATER;w.liq[k]=10;w.temp[k]=150;w.sol[k*NSOL+SOL_SALT]=800;
    // Disable precipitation by occupying the full fine cell, then test blocked storage.
    for(int y=80;y<88;y++)for(int x=80;x<88;x++)g.add(w,x,y,SAND);
    const double salt0=ingredient(w,SOL_SALT);w.solid[k-32]=2;w.tick=4;chemistry_step(w,g);
    check(w.liq[k]==10 && near(ingredient(w,SOL_SALT),salt0),"blocked vapor and grain outlets retain everything");
    w.solid[k-32]=0;const double energy0=phase_energy(w),volume0=w.volume();chemistry_step(w,g);
    check(w.liq[k]>=1 && w.typ[k-32]==8,"water evaporates without deleting final dissolved residue");
    check(near(w.volume(),volume0) && near(ingredient(w,SOL_SALT),salt0),"evaporation conserves water and salt");
    check(near(phase_energy(w),energy0,0.0001),"evaporation preserves phase-aware energy");
    w.reset(32,32,7);g.reset(w);w.typ[k]=WATER;w.liq[k]=1;w.temp[k]=300;w.tick=4;
    const auto last_energy=phase_energy(w);chemistry_step(w,g);
    check(w.liq[k]==0 && w.liq[k-32]==1,"last pure water unit evaporates");
    check(near(phase_energy(w),last_energy,0.0001),"last evaporation carries residual energy");
    w.reset(32,32,7);g.reset(w);w.typ[k]=WATER;w.liq[k]=1;w.temp[k]=300;w.tick=4;
    w.sol[k*NSOL+SOL_SUGAR]=100;w.sol[k*NSOL+SOL_SALT]=100;
    const double drying_energy=phase_energy(w);chemistry_step(w,g);
    check(w.liq[k]==0 && near(g.mass(SUGAR_GRAIN),100.0/255) && near(g.mass(SALT_GRAIN),100.0/255),"final drying atomically places both fractional residues");
    check(near(phase_energy(w)+g.sensible_energy(),drying_energy,0.0001),"final mixed drying conserves sensible and phase energy");
    w.reset(32,32,7);g.reset(w);w.typ[k]=WATER;w.liq[k]=1;w.temp[k]=300;w.tick=4;w.sol[k*NSOL+2]=100;
    chemistry_step(w,g);check(w.liq[k]==1 && near(w.sol[k*NSOL+2],100),"unsupported residue prevents final carrier loss");
    w.reset(32,32,7);g.reset(w);w.typ[k]=WATER;w.liq[k]=100;w.typ[k+1]=WATER;w.liq[k+1]=10;w.sol[k*NSOL+SOL_SUGAR]=200;w.tick=4;
    const auto diffusion_mass=ingredient(w,SOL_SUGAR);chemistry_step(w,g);
    check(w.sol[(k+1)*NSOL+SOL_SUGAR]>0 && near(ingredient(w,SOL_SUGAR),diffusion_mass),"unequal-volume diffusion preserves ingredients");
    w.temp[k]=80;w.temp[k+1]=10;const double mixing_energy=phase_energy(w);chemistry_step(w,g);
    check(near(phase_energy(w),mixing_energy,0.0001),"solute diffusion carries sensible heat between hot and cold cells");
    g.add(w,80,80,SUGAR_GRAIN,GRAIN_AMOUNT,5);const double dissolving_energy=phase_energy(w)+g.sensible_energy();g.step(w);
    check(near(phase_energy(w)+g.sensible_energy(),dissolving_energy,0.0001),"dissolving cold sugar carries its own sensible energy");
    w.sol[k*NSOL+SOL_SUGAR]=1500;const double crystal_energy=phase_energy(w)+g.sensible_energy();const double crystals_before=g.mass(SUGAR_GRAIN);chemistry_step(w,g);
    check(g.mass(SUGAR_GRAIN)>crystals_before,"thermal precipitation test actually forms crystals");
    check(near(phase_energy(w)+g.sensible_energy(),crystal_energy,0.0001),"precipitation carries sensible heat into new crystals");
    World large;large.reset(512,128,7);Grains pile;pile.reset(large);
    for(int y=100;y<200;y++)for(int x=100;x<1100;x++)pile.add(large,x,y,SAND);
    const auto start=std::chrono::steady_clock::now();
    for(int t=0;t<60;t++){large.tick++;pile.step(large);}
    const double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()/60;
    check(pile.particles.size()==100000 && near(pile.mass(SAND),100000*GRAIN_AMOUNT),"100,000 independent grains retain mass");
    std::cout<<"Fine-grain benchmark: 100000 particles, mean "<<ms<<" ms/tick (physics only)\n";
    std::cout<<"Native chemistry: "<<checks<<" checks, "<<failures<<" failures\n";return failures?1:0;
}
