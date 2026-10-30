#include "world.hpp"
#include "../render/cells.hpp"
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>
#include <string>
#include <cstring>
using ecologist::World;
template<class T> bool read_array(std::istream& s,std::vector<T>& a) { return bool(s.read(reinterpret_cast<char*>(a.data()),a.size()*sizeof(T))); }
template<class T> void write_array(std::ostream& s,const std::vector<T>& a) { s.write(reinterpret_cast<const char*>(a.data()),a.size()*sizeof(T)); }
int main(int argc,char** argv) {
    World world;
    if(argc==5 && std::string(argv[1])=="--benchmark") {
        const int w=std::stoi(argv[2]),h=std::stoi(argv[3]),ticks=std::stoi(argv[4]);
        if(ticks<1 || ticks>10000 || !world.reset(w,h,7)) return 2;
        for(int x=0;x<w;x++) world.solid[(h-1)*w+x]=2;
        // A quarter of every column starts filled; no automatic water sources or resets during timing.
        for(int y=h/8;y<h*3/8;y++) for(int x=0;x<w;x++) { const int k=y*w+x; world.liq[k]=255;world.typ[k]=ecologist::WATER; }
        const double before=world.volume(); double total=0,worst=0; std::size_t updates=0;
        for(int i=0;i<ticks;i++) {
            for(auto a:world.awake) if(a) updates+=ecologist::CHUNK*ecologist::CHUNK;
            const auto start=std::chrono::steady_clock::now();world.step();
            const auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();total+=ms;worst=std::max(worst,ms);
        }
        std::cout<<"{\"cells\":"<<w*h<<",\"ticks\":"<<ticks<<",\"mean_ms\":"<<total/ticks<<",\"worst_ms\":"<<worst<<",\"mean_active_cells\":"<<updates/ticks<<",\"water_conserved\":"<<(before==world.volume()?"true":"false")<<",\"scope\":\"isolated liquid transport, no rendering or ecology\"}\n";
        return before==world.volume()?0:1;
    }
    const bool rendering=argc==4 && std::string(argv[1])=="--render-cells";
    if(argc!=3 && !rendering) { std::cerr<<"Usage: ecologist-core [--render-cells] input.bin output.bin | --benchmark width height ticks\n";return 2; }
    std::ifstream input(argv[rendering ? 2 : 1],std::ios::binary); char magic[8]{}; std::uint32_t header[5]{};
    input.read(magic,8);input.read(reinterpret_cast<char*>(header),sizeof(header));
    if(!input || std::memcmp(magic,"ECOTR1\0",8) || header[4]>10000 || !world.reset(header[0],header[1],header[3])) { std::cerr<<"Invalid transport fixture\n";return 2; }
    world.tick=header[2]; const auto steps=header[4];
    if(!(read_array(input,world.solid)&&read_array(input,world.liq)&&read_array(input,world.typ)&&read_array(input,world.drop)&&read_array(input,world.awake)&&read_array(input,world.stamp)&&read_array(input,world.flux)&&read_array(input,world.temp)&&read_array(input,world.vel)&&read_array(input,world.latent)&&read_array(input,world.sol))) return 2;
    for(std::size_t k=0;k<world.typ.size();k++) if(world.typ[k]>=ecologist::NLIQ || (world.liq[k] && !ecologist::FLUIDS[world.typ[k]].gravity)) return 2;
    for(std::uint32_t i=0;i<steps;i++) world.step();
    if(rendering) {
        std::ofstream output(argv[3],std::ios::binary);
        write_array(output,ecologist::render_cells(world));
        return output ? 0 : 1;
    }
    std::ofstream output(argv[2],std::ios::binary); header[2]=world.tick;header[3]=world.rng;header[4]=0;
    output.write(magic,8);output.write(reinterpret_cast<const char*>(header),sizeof(header));
    write_array(output,world.solid);write_array(output,world.liq);write_array(output,world.typ);write_array(output,world.drop);write_array(output,world.awake);write_array(output,world.stamp);write_array(output,world.flux);write_array(output,world.temp);write_array(output,world.vel);write_array(output,world.latent);write_array(output,world.sol);
    return output?0:1;
}
