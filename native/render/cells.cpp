#include "cells.hpp"
#include <algorithm>
#include <cmath>

namespace ecologist {
std::vector<std::uint8_t> render_cells(const World& w) {
    const int n=w.width*w.height;
    std::vector<std::uint8_t> pixels(n*8,0);
    auto shape=[&](int k,int channel)->std::uint8_t& { return pixels[n*4+k*4+channel]; };
    auto classify=[&](int x,int y,int gravity) {
        const int k=y*w.width+x;
        if(!w.liq[k] || FLUIDS[w.typ[k]].gravity!=gravity) return;
        if(gravity>0 ? y==w.height-1 : y==0) return;
        const int next=k+w.width*gravity;
        if(w.solid[next] || (w.liq[next] && w.typ[next]!=w.typ[k]) || w.liq[next]>=250) return;
        shape(k,0)=1;
        const int prev=k-w.width*gravity;
        const bool prev_in=gravity>0 ? y>0 : y<w.height-1;
        if(prev_in && shape(prev,0) && w.typ[prev]==w.typ[k]) shape(k,1)=shape(prev,1);
        else if(x>0 && w.liq[k-1] && w.typ[k-1]==w.typ[k] && !shape(k-1,0)) shape(k,1)=0;
        else if(x<w.width-1 && w.liq[k+1] && w.typ[k+1]==w.typ[k]) shape(k,1)=2;
        else shape(k,1)=1;
    };
    for(int y=0;y<w.height;y++) for(int x=0;x<w.width;x++) classify(x,y,1);
    for(int y=w.height-1;y>=0;y--) for(int x=0;x<w.width;x++) classify(x,y,-1);
    std::vector<int> depth(w.width,0);
    for(int y=0;y<w.height;y++) for(int x=0;x<w.width;x++) {
        const int k=y*w.width+x,p=k*4;
        pixels[p]=w.typ[k]; pixels[p+1]=w.liq[k]; pixels[p+2]=w.solid[k];
        pixels[p+3]=w.under[k]+(std::abs(w.vel[k])>0.5f ? 128 : 0);
        if(!w.liq[k] || shape(k,0)) { depth[x]=0; continue; }
        const int gravity=FLUIDS[w.typ[k]].gravity,prev=k-w.width*gravity;
        const bool prev_in=gravity>0 ? y>0 : y<w.height-1;
        if(prev_in && w.liq[prev] && w.typ[prev]==w.typ[k] && !shape(prev,0)) {
            if(gravity>0) depth[x]++; else depth[x]=0;
            shape(k,2)=8; shape(k,3)=static_cast<std::uint8_t>(std::min(255,gravity>0 ? depth[x] : 1));
        } else {
            depth[x]=0;
            shape(k,2)=std::clamp(static_cast<int>(std::round(w.liq[k]*8.0/255)),1,8);
        }
    }
    return pixels;
}
}
